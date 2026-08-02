import { describe, expect, it } from "vitest";
import { GcpMetadataAccessTokenProvider, GcpSecretVault } from "./gcp-secret-vault.js";

describe("GCP Secret Vault", () => {
  it("persistiert versionierte OAuth-Secrets über Workload Identity ohne Rohreferenz im Ressourcennamen", async () => {
    const urls: string[] = [];
    let metadataCalls = 0;
    let exists = false;
    let storedData: string | null = null;
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input); urls.push(url);
      if (url.includes("metadata.test")) {
        metadataCalls += 1;
        expect(init?.headers).toMatchObject({ "Metadata-Flavor": "Google" });
        return Response.json({ access_token: "workload-token", expires_in: 3600 });
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer workload-token" });
      if (url.endsWith("/versions/latest:access")) {
        return storedData ? Response.json({ payload: { data: storedData } }) : new Response("", { status: 404 });
      }
      if (url.endsWith(":addVersion")) {
        storedData = (JSON.parse(String(init?.body)) as { payload: { data: string } }).payload.data;
        return Response.json({ name: "version-1" });
      }
      if (init?.method === "DELETE") { exists = false; storedData = null; return new Response(null, { status: 204 }); }
      if (init?.method === "POST") { exists = true; return Response.json({ name: "secret" }); }
      return exists ? Response.json({ name: "secret" }) : new Response("", { status: 404 });
    }) as typeof fetch;
    const tokenProvider = new GcpMetadataAccessTokenProvider(fakeFetch, "http://metadata.test/token");
    const vault = new GcpSecretVault("relay-pilot-123", tokenProvider, fakeFetch, "https://secretmanager.test/v1");
    const reference = "channel-authorization/google/private-reference";
    const value = { accessToken: "access-secret", refreshToken: "refresh-secret", scope: ["scope-a"], tokenType: "Bearer" };

    await vault.put(reference, value);
    expect(await vault.get(reference)).toEqual(value);
    expect(metadataCalls).toBe(1);
    expect(urls.every(url => !url.includes(reference))).toBe(true);
    expect(urls.some(url => /relay-[a-f0-9]{40}/.test(url))).toBe(true);
    await vault.delete(reference);
    expect(await vault.get(reference)).toBeNull();
  });

  it("verwirft manipulierte Payloads und gibt keine Providerantwort im Fehler preis", async () => {
    const fakeFetch = (async (input: string | URL | Request) => String(input).includes("metadata.test")
      ? Response.json({ access_token: "workload-token", expires_in: 3600 })
      : Response.json({ payload: { data: Buffer.from(JSON.stringify({ accessToken: "only-token" })).toString("base64") } })) as typeof fetch;
    const vault = new GcpSecretVault("relay-pilot-123", new GcpMetadataAccessTokenProvider(fakeFetch, "http://metadata.test/token"), fakeFetch, "https://secretmanager.test/v1");
    await expect(vault.get("oauth-flow/test")).rejects.toThrow("SECRET_VAULT_PAYLOAD_INVALID");
  });
});
