import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_PATH: z.string().default(".data/relay"),
  AUTH_MODE: z.enum(["demo", "oidc"]).optional(),
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_AUDIENCE: z.string().min(1).optional(),
  OIDC_JWKS_URL: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_SCOPES: z.string().default("openid profile"),
  PUBLIC_APP_URL: z.string().url().optional(),
  CORS_ORIGINS: z.string().optional(),
  CONNECTOR_SECRET: z.string().min(32).optional(),
  CONNECTOR_SECRET_REF: z.string().min(1).default("connector/demo"),
  CONNECTOR_SECRET_DEMO: z.string().min(32).optional(),
  TENANT_ID: z.string().uuid().optional(),
  WORKER_ID: z.string().min(3).max(120).optional(),
  PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  PG_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000)
});

export type RuntimeConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env, purpose: "api" | "worker" = "api") {
  const parsed = environmentSchema.parse(environment);
  const authMode = parsed.AUTH_MODE ?? (parsed.NODE_ENV === "production" ? "oidc" : "demo");
  const corsOrigins = (parsed.CORS_ORIGINS ?? (parsed.NODE_ENV === "production" ? "" : "http://localhost:5173,http://localhost:5174"))
    .split(",").map(value => value.trim()).filter(Boolean);

  if (parsed.NODE_ENV === "production") {
    if (!parsed.DATABASE_URL) throw new Error("DATABASE_URL ist in Produktion erforderlich.");
    if (purpose === "api" && authMode !== "oidc") throw new Error("AUTH_MODE=oidc ist in Produktion erforderlich.");
    if (purpose === "api" && corsOrigins.length === 0) throw new Error("CORS_ORIGINS muss in Produktion explizit gesetzt sein.");
    if (purpose === "api" && !parsed.CONNECTOR_SECRET) throw new Error("CONNECTOR_SECRET muss in Produktion aus dem verwalteten Secret Store injiziert werden.");
  }
  if (purpose === "api" && authMode === "oidc" && (!parsed.OIDC_ISSUER || !parsed.OIDC_AUDIENCE || !parsed.OIDC_JWKS_URL || !parsed.OIDC_CLIENT_ID || !parsed.PUBLIC_APP_URL)) {
    throw new Error("OIDC_ISSUER, OIDC_AUDIENCE, OIDC_JWKS_URL, OIDC_CLIENT_ID und PUBLIC_APP_URL sind für OIDC erforderlich.");
  }
  return { ...parsed, authMode, corsOrigins, connectorSecret: parsed.CONNECTOR_SECRET ?? parsed.CONNECTOR_SECRET_DEMO };
}
