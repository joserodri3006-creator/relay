import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ids } from "./db.js";
import type { Database } from "./db.js";
import type { Session } from "./domain.js";

export type Authenticator = (request: FastifyRequest) => Promise<Session>;

function unauthorized(code = "UNAUTHORIZED", message = "Authentifizierung erforderlich.") {
  return Object.assign(new Error(message), { statusCode: 401, code });
}

const pilotClaims = z.object({
  relay_tenant_id: z.string().uuid(),
  sub: z.string().min(1).max(255)
});

function bearer(request: FastifyRequest) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  return header.slice(7);
}

export function createDemoAuthenticator(): Authenticator {
  return async request => {
    const token = bearer(request);
    if (token === "demo-editor") return { tenantId: ids.tenant, actorId: ids.editor, role: "editor", name: "Mara Klein", capabilities: ["case:write", "integration:operate", "pilot:configure"] };
    if (token === "demo-teammate") return { tenantId: ids.tenant, actorId: ids.teammate, role: "editor", name: "David Nguyen", capabilities: ["case:write"] };
    if (token === "demo-viewer") return { tenantId: ids.tenant, actorId: ids.viewer, role: "viewer", name: "Lea Hoffmann", capabilities: [] };
    throw unauthorized("UNAUTHORIZED", "Ungültige Demo-Session.");
  };
}

export function createOidcAuthenticator(options: { issuer: string; audience: string; jwksUrl: string; db: Database; jwks?: JWTVerifyGetKey }): Authenticator {
  const jwks = options.jwks ?? createRemoteJWKSet(new URL(options.jwksUrl), { timeoutDuration: 5000, cooldownDuration: 30000 });
  return async request => {
    try {
      const verified = await jwtVerify(bearer(request), jwks, { issuer: options.issuer, audience: options.audience, algorithms: ["RS256", "ES256"] });
      return await sessionFromClaims(verified.payload, options.issuer, options.db);
    } catch (error) {
      if (error instanceof Error && "statusCode" in error) throw error;
      throw unauthorized("TOKEN_INVALID", "Token ist ungültig oder abgelaufen.");
    }
  };
}

async function sessionFromClaims(payload: JWTPayload, issuer: string, db: Database): Promise<Session> {
  const claims = pilotClaims.safeParse(payload);
  if (!claims.success) throw unauthorized("TOKEN_CLAIMS_INVALID", "Token enthält nicht die erforderlichen Relay-Claims.");
  const rows = await db.withTenant(claims.data.relay_tenant_id, tx => tx.query<{ id: string; display_name: string; role: "editor" | "viewer"; capabilities: string[] }>(`SELECT a.id,a.display_name,a.role,
    COALESCE(array_agg(c.capability) FILTER (WHERE c.capability IS NOT NULL),ARRAY[]::text[]) AS capabilities
    FROM actor_identities i JOIN actors a ON a.tenant_id=i.tenant_id AND a.id=i.actor_id
    LEFT JOIN actor_capabilities c ON c.tenant_id=a.tenant_id AND c.actor_id=a.id
    WHERE i.tenant_id=$1 AND i.issuer=$2 AND i.subject=$3 AND i.status='active'
    GROUP BY a.id,a.display_name,a.role`, [claims.data.relay_tenant_id, issuer, claims.data.sub]));
  const actor = rows.rows[0];
  if (!actor) throw unauthorized("MEMBERSHIP_INACTIVE", "Keine aktive Relay-Mitgliedschaft gefunden.");
  const capabilities = actor.capabilities.filter((value): value is "case:write" | "integration:operate" | "pilot:configure" => value === "case:write" || value === "integration:operate" || value === "pilot:configure");
  return {
    tenantId: claims.data.relay_tenant_id,
    actorId: actor.id,
    name: actor.display_name,
    role: actor.role,
    capabilities
  };
}
