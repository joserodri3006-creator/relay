import { describe, expect, it, vi } from "vitest";
import { EmailProviderDetector, normalizeEmailDomain } from "./email-provider.js";

describe("Email provider detection", () => {
  it("erkennt Gmail ohne DNS-Abfrage", async () => {
    const resolve = vi.fn();
    const result = await new EmailProviderDetector(resolve).detect("GMAIL.COM");
    expect(result).toMatchObject({ providerKey: "google", productKey: "gmail", providerName: "Google Gmail", authorizationProfile: "google_gmail_oauth", confidence: "certain", source: "well_known_domain" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("erkennt bekannte MX-Infrastruktur und gibt nur öffentliche Evidenz zurück", async () => {
    const detector = new EmailProviderDetector(async () => [{ exchange: "w01abc.kasserver.com", priority: 10 }]);
    await expect(detector.detect("blazedoutfitters.com")).resolves.toEqual({
      domain: "blazedoutfitters.com",
      providerKey: "other",
      productKey: "other",
      providerName: "ALL-INKL",
      authorizationProfile: null,
      confidence: "high",
      source: "mx",
      evidence: ["w01abc.kasserver.com"]
    });
  });

  it("cached wiederholte Abfragen", async () => {
    const resolve = vi.fn(async () => [{ exchange: "aspmx.l.google.com", priority: 1 }]);
    const detector = new EmailProviderDetector(resolve);
    await detector.detect("example.com");
    await detector.detect("example.com");
    expect(resolve).toHaveBeenCalledOnce();
  });

  it("weist lokale, IP-ähnliche und unvollständige Ziele ab", () => {
    for (const value of ["localhost", "127.0.0.1", "invalid", "-mail.example.com"]) {
      expect(() => normalizeEmailDomain(value)).toThrow("Ungültige E-Mail-Domain.");
    }
  });
});
