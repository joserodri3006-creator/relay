import crypto from "node:crypto";
import type { SecretPayload, SecretVault } from "./google-oauth.js";

type Fetcher = typeof fetch;

export interface CloudAccessTokenProvider {
  accessToken(): Promise<string>;
}

export class GcpMetadataAccessTokenProvider implements CloudAccessTokenProvider {
  #cached: { token: string; expiresAt: number } | null = null;
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly metadataUrl = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
  ) {}

  async accessToken() {
    if (this.#cached && this.#cached.expiresAt - Date.now() > 300_000) return this.#cached.token;
    const response = await this.fetcher(this.metadataUrl, {
      headers: { "Metadata-Flavor": "Google" },
      signal: AbortSignal.timeout(3_000)
    });
    if (!response.ok) throw new Error("SECRET_VAULT_IDENTITY_UNAVAILABLE");
    const value = await response.json() as Record<string, unknown>;
    if (typeof value.access_token !== "string" || typeof value.expires_in !== "number") {
      throw new Error("SECRET_VAULT_IDENTITY_INVALID");
    }
    this.#cached = { token: value.access_token, expiresAt: Date.now() + value.expires_in * 1_000 };
    return this.#cached.token;
  }
}

export class GcpSecretVault implements SecretVault {
  readonly #baseUrl: string;
  constructor(
    private readonly projectId: string,
    private readonly tokenProvider: CloudAccessTokenProvider,
    private readonly fetcher: Fetcher = fetch,
    baseUrl = "https://secretmanager.googleapis.com/v1"
  ) {
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectId)) throw new Error("GOOGLE_CLOUD_PROJECT_INVALID");
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  async put(reference: string, value: SecretPayload) {
    const name = this.resourceName(reference);
    const token = await this.tokenProvider.accessToken();
    const existing = await this.request(`${this.#baseUrl}/${name}`, { method: "GET" }, token, [404]);
    if (existing.status === 404) {
      const secretId = name.split("/").at(-1)!;
      await this.request(`${this.#baseUrl}/projects/${encodeURIComponent(this.projectId)}/secrets?secretId=${encodeURIComponent(secretId)}`, {
        method: "POST",
        body: JSON.stringify({ replication: { automatic: {} }, labels: { service: "relay", purpose: "oauth" } })
      }, token, [409]);
    }
    const data = Buffer.from(JSON.stringify(value), "utf8").toString("base64");
    const added = await this.request(`${this.#baseUrl}/${name}:addVersion`, {
      method: "POST",
      body: JSON.stringify({ payload: { data } })
    }, token);
    const addedVersion = await added.json() as { name?: string };
    if (typeof addedVersion.name !== "string") throw new Error("SECRET_VAULT_VERSION_INVALID");
    await this.disablePreviousVersions(name, addedVersion.name, token);
  }

  async get(reference: string) {
    const token = await this.tokenProvider.accessToken();
    const response = await this.request(`${this.#baseUrl}/${this.resourceName(reference)}/versions/latest:access`, { method: "GET" }, token, [404]);
    if (response.status === 404) return null;
    const body = await response.json() as { payload?: { data?: string } };
    if (typeof body.payload?.data !== "string") throw new Error("SECRET_VAULT_PAYLOAD_INVALID");
    let value: unknown;
    try { value = JSON.parse(Buffer.from(body.payload.data, "base64").toString("utf8")); }
    catch { throw new Error("SECRET_VAULT_PAYLOAD_INVALID"); }
    if (!isSecretPayload(value)) throw new Error("SECRET_VAULT_PAYLOAD_INVALID");
    return value;
  }

  async delete(reference: string) {
    const token = await this.tokenProvider.accessToken();
    await this.request(`${this.#baseUrl}/${this.resourceName(reference)}`, { method: "DELETE" }, token, [404]);
  }

  private resourceName(reference: string) {
    if (reference.length < 3 || reference.length > 300) throw new Error("SECRET_REFERENCE_INVALID");
    const secretId = `relay-${crypto.createHash("sha256").update(reference).digest("hex").slice(0, 40)}`;
    return `projects/${encodeURIComponent(this.projectId)}/secrets/${secretId}`;
  }

  private async request(url: string, init: RequestInit, token: string, accepted: number[] = []) {
    const response = await this.fetcher(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok && !accepted.includes(response.status)) throw new Error(`SECRET_VAULT_REQUEST_FAILED_${response.status}`);
    return response;
  }

  private async disablePreviousVersions(secretName: string, currentVersion: string, token: string) {
    const response = await this.request(`${this.#baseUrl}/${secretName}/versions?pageSize=100`, { method: "GET" }, token);
    const body = await response.json() as { versions?: Array<{ name?: string; state?: string }> };
    const previous = (body.versions ?? []).filter(version => version.state === "ENABLED" && version.name && version.name !== currentVersion);
    for (const version of previous) {
      await this.request(`${this.#baseUrl}/${version.name}:disable`, { method: "POST", body: "{}" }, token);
    }
  }
}

function isSecretPayload(value: unknown): value is SecretPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.codeVerifier === "string") return candidate.codeVerifier.length >= 32 && Object.keys(candidate).length === 1;
  return typeof candidate.accessToken === "string"
    && (candidate.refreshToken === undefined || typeof candidate.refreshToken === "string")
    && (candidate.expiresIn === undefined || typeof candidate.expiresIn === "number")
    && Array.isArray(candidate.scope) && candidate.scope.every(scope => typeof scope === "string")
    && typeof candidate.tokenType === "string";
}
