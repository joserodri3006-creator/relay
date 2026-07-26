import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOidcAuthenticator } from "./auth.js";
import { createDatabase, ids, type Database } from "./db.js";

describe("OIDC authentication boundary", () => {
  let issuer: string; let privateKey: CryptoKey; let db: Database; let jwks: JWTVerifyGetKey;
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256"); privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey); Object.assign(jwk, { kid: "pilot-key", use: "sig", alg: "RS256" });
    issuer = "https://identity.test.invalid"; jwks = createLocalJWKSet({ keys: [jwk] });
    db = await createDatabase();
    await db.query("INSERT INTO actor_identities(tenant_id,actor_id,issuer,subject) VALUES($1,$2,$3,'oidc-user')", [ids.tenant,ids.editor,issuer]);
    await db.query("INSERT INTO actor_capabilities(tenant_id,actor_id,capability) VALUES($1,$2,'case:write'),($1,$2,'integration:operate')", [ids.tenant,ids.editor]);
  });
  afterAll(async () => { await db.close(); });

  async function token(audience = "relay-api") {
    return new SignJWT({ relay_tenant_id: ids.tenant }).setProtectedHeader({ alg: "RS256", kid: "pilot-key" }).setIssuer(issuer).setSubject("oidc-user").setAudience(audience).setIssuedAt().setExpirationTime("5m").sign(privateKey);
  }
  const request = (value: string) => ({ headers: { authorization: `Bearer ${value}` } }) as FastifyRequest;

  it("bezieht Rolle und Capabilities aus aktiver DB-Mitgliedschaft", async () => {
    const authenticate = createOidcAuthenticator({ issuer, audience: "relay-api", jwksUrl: issuer, db, jwks });
    await expect(authenticate(request(await token()))).resolves.toMatchObject({ tenantId: ids.tenant, actorId: ids.editor, role: "editor", capabilities: ["case:write", "integration:operate"] });
  });

  it("weist falsche Audience und deaktivierte Membership ab", async () => {
    const authenticate = createOidcAuthenticator({ issuer, audience: "relay-api", jwksUrl: issuer, db, jwks });
    await expect(authenticate(request(await token("wrong-api")))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
    await db.query("UPDATE actor_identities SET status='disabled' WHERE tenant_id=$1 AND issuer=$2", [ids.tenant,issuer]);
    await expect(authenticate(request(await token()))).rejects.toMatchObject({ code: "MEMBERSHIP_INACTIVE" });
  });
});
