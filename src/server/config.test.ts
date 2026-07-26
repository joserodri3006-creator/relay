import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const validProduction = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://runtime:secret@db.example.test/relay?sslmode=verify-full",
  AUTH_MODE: "oidc",
  OIDC_ISSUER: "https://identity.example.test",
  OIDC_AUDIENCE: "relay-api",
  OIDC_JWKS_URL: "https://identity.example.test/.well-known/jwks.json",
  OIDC_CLIENT_ID: "relay-web",
  PUBLIC_APP_URL: "https://pilot.example.test",
  CORS_ORIGINS: "https://pilot.example.test",
  CONNECTOR_SECRET: "a-production-secret-with-at-least-32-characters"
};

describe("runtime configuration", () => {
  it("bleibt lokal ohne externe Infrastruktur ausführbar", () => {
    expect(loadConfig({ NODE_ENV: "test" })).toMatchObject({ authMode: "demo", DATABASE_PATH: ".data/relay" });
  });

  it("akzeptiert eine vollständige fail-closed Produktionskonfiguration", () => {
    expect(loadConfig(validProduction)).toMatchObject({ authMode: "oidc", corsOrigins: ["https://pilot.example.test"] });
  });

  it.each(["DATABASE_URL", "OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "OIDC_CLIENT_ID", "PUBLIC_APP_URL", "CORS_ORIGINS", "CONNECTOR_SECRET"])("verweigert Produktion ohne %s", key => {
    const environment = { ...validProduction }; delete environment[key as keyof typeof environment];
    expect(() => loadConfig(environment)).toThrow();
  });

  it("verweigert Demo-Authentifizierung in Produktion", () => {
    expect(() => loadConfig({ ...validProduction, AUTH_MODE: "demo" })).toThrow(/AUTH_MODE=oidc/);
  });

  it("verlangt vom Worker PostgreSQL, aber keine Browser- oder OIDC-Konfiguration", () => {
    expect(loadConfig({ NODE_ENV: "production", DATABASE_URL: validProduction.DATABASE_URL }, "worker").DATABASE_URL).toBe(validProduction.DATABASE_URL);
    expect(() => loadConfig({ NODE_ENV: "production" }, "worker")).toThrow(/DATABASE_URL/);
  });
});
