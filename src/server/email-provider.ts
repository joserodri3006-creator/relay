import { resolveMx } from "node:dns/promises";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export type EmailProviderKey = "google" | "microsoft" | "other";
export type MailProductKey = "gmail" | "google_workspace" | "microsoft_365" | "other";
export type EmailProviderDetection = {
  domain: string;
  providerKey: EmailProviderKey | null;
  productKey: MailProductKey | null;
  providerName: string | null;
  authorizationProfile: "google_gmail_oauth" | "microsoft_graph_oauth" | null;
  confidence: "certain" | "high" | "unknown";
  source: "well_known_domain" | "mx" | "unknown";
  evidence: string[];
};
export class EmailProviderLookupTemporaryError extends Error {}

type MxRecord = { exchange: string; priority: number };
type ResolveMx = (domain: string) => Promise<MxRecord[]>;

const MAX_CACHE_ENTRIES = 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SPECIAL_USE_SUFFIXES = [".local", ".internal", ".test", ".invalid", ".example", ".arpa"];

export function normalizeEmailDomain(input: string) {
  const domain = domainToASCII(input.trim().toLowerCase().replace(/\.$/, ""));
  if (!domain || domain.length > 253 || domain === "localhost" || isIP(domain) !== 0 || !domain.includes(".") || !/^[a-z0-9.-]+$/.test(domain)
    || SPECIAL_USE_SUFFIXES.some(suffix => domain.endsWith(suffix))) {
    throw new Error("Ungültige E-Mail-Domain.");
  }
  if (domain.split(".").some(label => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new Error("Ungültige E-Mail-Domain.");
  }
  return domain;
}

function recommendation(domain: string, exchanges: string[]): EmailProviderDetection {
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { domain, providerKey: "google", productKey: "gmail", providerName: "Google Gmail", authorizationProfile: "google_gmail_oauth", confidence: "certain", source: "well_known_domain", evidence: [] };
  }
  const matches = (suffixes: string[]) => exchanges.some(exchange => suffixes.some(suffix => exchange === suffix || exchange.endsWith(`.${suffix}`)));
  const google = matches(["google.com", "googlemail.com"]);
  const microsoft = matches(["protection.outlook.com", "outlook.com"]);
  const allInkl = matches(["kasserver.com"]);
  if ([google, microsoft, allInkl].filter(Boolean).length > 1) {
    return { domain, providerKey: null, productKey: null, providerName: null, authorizationProfile: null, confidence: "unknown", source: "unknown", evidence: exchanges };
  }
  if (google) {
    return { domain, providerKey: "google", productKey: "google_workspace", providerName: "Google Workspace", authorizationProfile: "google_gmail_oauth", confidence: "high", source: "mx", evidence: exchanges };
  }
  if (microsoft) {
    return { domain, providerKey: "microsoft", productKey: "microsoft_365", providerName: "Microsoft 365", authorizationProfile: "microsoft_graph_oauth", confidence: "high", source: "mx", evidence: exchanges };
  }
  if (allInkl) {
    return { domain, providerKey: "other", productKey: "other", providerName: "ALL-INKL", authorizationProfile: null, confidence: "high", source: "mx", evidence: exchanges };
  }
  return { domain, providerKey: null, productKey: null, providerName: null, authorizationProfile: null, confidence: "unknown", source: "unknown", evidence: exchanges };
}

export class EmailProviderDetector {
  private readonly cache = new Map<string, { expiresAt: number; value: EmailProviderDetection }>();

  constructor(private readonly resolve: ResolveMx = resolveMx) {}

  async detect(input: string): Promise<EmailProviderDetection> {
    const domain = normalizeEmailDomain(input);
    const cached = this.cache.get(domain);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const known = recommendation(domain, []);
    if (known.source === "well_known_domain") {
      this.cache.set(domain, { expiresAt: Date.now() + CACHE_TTL_MS, value: known });
      return known;
    }

    let exchanges: string[] = [];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const records = await Promise.race([
        this.resolve(domain),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(Object.assign(new Error("DNS timeout"), { code: "ETIMEDOUT" })), 2000);
        })
      ]);
      exchanges = records
        .slice(0, 20)
        .sort((left, right) => left.priority - right.priority)
        .map(record => normalizeEmailDomain(record.exchange));
    } catch (error) {
      const code = String((error as { code?: string }).code ?? "");
      if (!["ENODATA", "ENOTFOUND", "ENOTIMP"].includes(code)) throw new EmailProviderLookupTemporaryError("Providerprüfung vorübergehend nicht verfügbar.");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const value = recommendation(domain, exchanges);
    if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(domain, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  }
}
