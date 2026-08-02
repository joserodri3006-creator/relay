import fs from "node:fs/promises";
import { buildApp } from "./app.js";
import { createOidcAuthenticator } from "./auth.js";
import { loadConfig } from "./config.js";
import { createDatabase, type Database } from "./db.js";
import { createPostgresDatabase } from "./postgres.js";
import { GoogleOAuthHttpGateway, InMemorySecretVault } from "./google-oauth.js";
import { GcpMetadataAccessTokenProvider, GcpSecretVault } from "./gcp-secret-vault.js";

const config = loadConfig();
let db: Database;
if (config.DATABASE_URL) {
  db = createPostgresDatabase(config.DATABASE_URL, { max: config.PG_POOL_MAX, statementTimeoutMs: config.PG_STATEMENT_TIMEOUT_MS });
} else {
  await fs.mkdir(".data", { recursive: true });
  db = await createDatabase(config.DATABASE_PATH);
}

const authenticate = config.authMode === "oidc"
  ? createOidcAuthenticator({ issuer: config.OIDC_ISSUER!, audience: config.OIDC_AUDIENCE!, jwksUrl: config.OIDC_JWKS_URL!, db })
  : undefined;
const connectorSecrets = config.connectorSecret ? { [config.CONNECTOR_SECRET_REF]: config.connectorSecret } : undefined;
const googleOAuth = new GoogleOAuthHttpGateway({
  clientId: config.GOOGLE_OAUTH_CLIENT_ID,
  clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
  redirectUri: config.GOOGLE_OAUTH_REDIRECT_URI
});
const secretVault = config.SECRET_VAULT_MODE === "gcp"
  ? new GcpSecretVault(config.GOOGLE_CLOUD_PROJECT!, new GcpMetadataAccessTokenProvider())
  : new InMemorySecretVault();
const app = await buildApp(db, {
  serveWeb: config.NODE_ENV === "production",
  connectorSecrets,
  authenticate,
  corsOrigins: config.corsOrigins,
  logger: config.NODE_ENV === "production",
  expectedMigration: config.NODE_ENV === "production" ? "010_channel_authorizations.sql" : undefined,
  googleOAuth,
  secretVault,
  enableTestIngress: config.NODE_ENV !== "production",
  authPublicConfig: config.authMode === "oidc" ? {
    mode: "oidc", authority: config.OIDC_ISSUER!, clientId: config.OIDC_CLIENT_ID!, scope: config.OIDC_SCOPES,
    redirectUri: `${config.PUBLIC_APP_URL}/auth/callback`, postLogoutRedirectUri: config.PUBLIC_APP_URL!
  } : { mode: "demo" }
});

await app.listen({ port: config.PORT, host: "0.0.0.0" });
console.log(JSON.stringify({ type: "runtime.started", port: config.PORT, database: config.DATABASE_URL ? "postgres" : "pglite", authMode: config.authMode }));

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ type: "runtime.shutdown", signal }));
  const deadline = setTimeout(() => process.exit(1), 20000); deadline.unref();
  try { await app.close(); await db.close(); clearTimeout(deadline); process.exit(0); }
  catch { process.exit(1); }
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
