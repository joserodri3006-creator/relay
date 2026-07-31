import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import type { Database } from "./db.js";
import { commitmentSchema, commitmentUpdateSchema, connectorIngressSchema, emailProviderDetectionSchema, handoffDecisionSchema, handoffSchema, ingressSchema, ownerSchema, pilotSetupSchema, requireTransition, statusSchema, type CaseStatus, type Session } from "./domain.js";
import { recordDomainChange } from "./eventing.js";
import { openapiDocument } from "./openapi.js";
import { EmailProviderDetector, EmailProviderLookupTemporaryError, type EmailProviderDetection } from "./email-provider.js";
import { GoogleOAuthHttpGateway, InMemorySecretVault, gmailReadOnlyScope, randomOAuthValue, sha256Base64Url, sha256Hex, type GoogleOAuthGateway, type GoogleTokenSet, type SecretVault } from "./google-oauth.js";
import { processCanonicalIngress } from "./ingress-service.js";
import { createDemoAuthenticator, type Authenticator } from "./auth.js";

declare module "fastify" { interface FastifyRequest { session: Session; rawBody?: Buffer } }

type Row = Record<string, unknown>;
const uuid = () => crypto.randomUUID();

function problem(statusCode: number, code: string, message: string, details?: unknown) {
  return Object.assign(new Error(message), { statusCode, code, details });
}

function parseVersion(request: FastifyRequest, subject = "Case") {
  const raw = request.headers["if-match"];
  if (!raw) throw problem(428, "VERSION_REQUIRED", `Diese Änderung benötigt die aktuelle ${subject}-Version.`);
  const value = Number(String(raw).replaceAll('"', ""));
  if (!Number.isInteger(value)) throw problem(400, "INVALID_VERSION", "Die Case-Version ist ungültig.");
  return value;
}

async function one(db: Database, tenantId: string, sql: string, params: unknown[] = []) {
  return db.withTenant(tenantId, async tx => (await tx.query<Row>(sql, params)).rows[0] ?? null);
}

async function list(db: Database, tenantId: string, sql: string, params: unknown[] = []) {
  return db.withTenant(tenantId, async tx => (await tx.query<Row>(sql, params)).rows);
}

function requireEditor(request: FastifyRequest) {
  if (request.session.role !== "editor") throw problem(403, "FORBIDDEN", "Diese Rolle darf den Case nicht verändern.");
}

function requireIntegrationOperator(request: FastifyRequest) {
  if (!request.session.capabilities.includes("integration:operate")) throw problem(403, "INTEGRATION_OPERATION_FORBIDDEN", "Diese Rolle darf Integrationsfehler nicht bearbeiten.");
}

function requirePilotConfigurator(request: FastifyRequest) {
  if (!request.session.capabilities.includes("pilot:configure")) throw problem(403, "PILOT_CONFIGURATION_FORBIDDEN", "Diese Rolle darf keine Pilot-Einrichtung anfordern.");
}

const pilotSetupSelect = `SELECT p.tenant_id AS "tenantId",p.organization_name AS "organizationName",p.brand_name AS "brandName",
  p.workflow_name AS "workflowName",p.primary_channel AS "primaryChannel",p.identity_provider AS "identityProvider",
  p.system_of_record AS "systemOfRecord",p.hosting_region AS "hostingRegion",p.target_start_date::text AS "targetStartDate",
  p.team_names AS "teamNames",p.expected_users AS "expectedUsers",p.monthly_cases AS "monthlyCases",
  p.retention_days AS "retentionDays",p.pilot_owner_name AS "pilotOwnerName",p.pilot_owner_email AS "pilotOwnerEmail",
  p.technical_contact_name AS "technicalContactName",p.technical_contact_email AS "technicalContactEmail",
  p.access_environment AS "accessEnvironment",p.data_exclusions_confirmed AS "dataExclusionsConfirmed",
  p.inventory_confirmed AS "inventoryConfirmed",p.selected_channel_account_id::text AS "selectedChannelAccountId",
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id::text,'type',a.channel_type,'identifier',a.identifier,'label',a.display_label,
    'providerKey',a.provider_key,'mailProductKey',a.mail_product_key,'providerName',a.email_provider_name
  ) ORDER BY a.created_at,a.id) FROM pilot_channel_accounts a WHERE a.tenant_id=p.tenant_id),'[]'::jsonb) AS "channelAccounts",
  p.version,p.updated_at AS "updatedAt"
  FROM pilot_onboarding_requests p WHERE p.tenant_id=$1`;

function primaryChannelFor(product: "gmail" | "google_workspace" | "microsoft_365" | "other") {
  if (product === "microsoft_365") return "microsoft_365_email";
  if (product === "gmail" || product === "google_workspace") return "google_email";
  return "other_email";
}

function legacyEmailProvider(providerKey: "google" | "microsoft" | "other" | undefined) {
  if (providerKey === "google") return "google_workspace";
  if (providerKey === "microsoft") return "microsoft_365";
  return providerKey;
}

function verifyConnectorSignature(rawBody: Buffer, timestamp: string | undefined, signature: string | undefined, secret: string) {
  if (!timestamp || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw problem(401, "CONNECTOR_SIGNATURE_REQUIRED", "Gültige Connector-Signatur erforderlich.");
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) throw problem(401, "CONNECTOR_TIMESTAMP_INVALID", "Connector-Zeitstempel liegt außerhalb des erlaubten Fensters.");
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw problem(401, "CONNECTOR_SIGNATURE_INVALID", "Connector-Signatur ist ungültig.");
}

type AuthPublicConfig = { mode: "demo" } | { mode: "oidc"; authority: string; clientId: string; scope: string; redirectUri: string; postLogoutRedirectUri: string };

export async function buildApp(db: Database, options: { serveWeb?: boolean; connectorSecrets?: Record<string, string>; authenticate?: Authenticator; corsOrigins?: string[]; logger?: boolean; expectedMigration?: string; authPublicConfig?: AuthPublicConfig; enableTestIngress?: boolean; detectEmailProvider?: (domain: string) => Promise<EmailProviderDetection>; googleOAuth?: GoogleOAuthGateway; secretVault?: SecretVault } = {}) {
  const app = options.logger
    ? Fastify({ logger: { level: "info", redact: ["req.headers.authorization", "req.headers.x-relay-signature"] }, disableRequestLogging: true, bodyLimit: 1024 * 1024 })
    : Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const authenticate = options.authenticate ?? createDemoAuthenticator();
  const providerDetector = new EmailProviderDetector();
  const detectEmailProvider = options.detectEmailProvider ?? providerDetector.detect.bind(providerDetector);
  const googleOAuth = options.googleOAuth ?? new GoogleOAuthHttpGateway({});
  const secretVault = options.secretVault ?? new InMemorySecretVault();
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    request.rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    try { done(null, body.length === 0 ? {} : JSON.parse(body.toString("utf8"))); }
    catch { done(problem(400, "INVALID_JSON", "Request Body ist kein gültiges JSON.")); }
  });
  await app.register(cors, { origin: options.corsOrigins ?? ["http://localhost:5173", "http://localhost:5174"], credentials: false });
  await app.register(helmet, { contentSecurityPolicy: options.serveWeb ? undefined : false });
  await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute", errorResponseBuilder: (request) => ({ statusCode: 429, message: "Zu viele Anfragen.", code: "RATE_LIMITED", requestId: request.id }) });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; details?: unknown }, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    if (status >= 500) request.log.error({ err: error, requestId: request.id, route: request.routeOptions.url }, "request.failed");
    reply.status(status).send({ type: "about:blank", title: status === 500 ? "Interner Fehler" : error.message, status, code: error.code ?? "INTERNAL_ERROR", requestId: request.id, details: error.details });
  });

  app.addHook("preHandler", async (request) => {
    if (!request.url.startsWith("/api/") || request.url === "/api/health" || request.url === "/api/openapi.json" || request.url === "/api/auth/config" || request.url.startsWith("/api/internal/") || request.url.startsWith("/api/oauth/google/callback")) return;
    request.session = await authenticate(request);
  });

  if (options.logger) app.addHook("onResponse", async (request, reply) => {
    request.log.info({ requestId: request.id, route: request.routeOptions.url, method: request.method, statusCode: reply.statusCode, elapsedMs: reply.elapsedTime }, "request.completed");
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  app.get("/health/live", async () => ({ status: "live" }));
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/auth/config", async () => ({ ...(options.authPublicConfig ?? { mode: "demo" }), testIngressEnabled: options.enableTestIngress ?? true }));
  app.get("/health/ready", async (_request, reply) => {
    try {
      await db.query("SELECT 1 AS ready");
      if (options.expectedMigration) {
        const row = (await db.query<Row>("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1")).rows[0];
        if (row?.version !== options.expectedMigration) throw new Error("schema mismatch");
      }
      return { status: "ready" };
    }
    catch { return reply.code(503).send({ status: "not_ready" }); }
  });
  app.get("/api/openapi.json", async () => openapiDocument);
  app.get("/api/v1/session", async (request) => ({ ...request.session, tenantName: "Relay Demo GmbH" }));
  app.get("/api/v1/actors", async (request) => list(db, request.session.tenantId, "SELECT id,display_name AS name,role FROM actors WHERE tenant_id=$1 ORDER BY display_name", [request.session.tenantId]));

  app.get("/api/v1/pilot-onboarding", async (request) => {
    requirePilotConfigurator(request);
    const setup = await one(db, request.session.tenantId, pilotSetupSelect, [request.session.tenantId]);
    return { setup, state: setup ? "relay_review_required" : "not_started", relayGates: [
      "managed_postgres_rls", "oidc_connection", "secret_store_rotation", "provider_adapter_fixture", "shadow_run_100", "backup_restore"
    ], nextStep: setup ? "Relay prüft Zugang, Identität und Sicherheitsgates. Reale Daten bleiben gesperrt." : "Pilotangaben vervollständigen und Einrichtung anfordern." };
  });

  app.post("/api/v1/email-provider-detection", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async request => {
    requirePilotConfigurator(request);
    const parsed = emailProviderDetectionSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "EMAIL_DOMAIN_INVALID", "Die E-Mail-Domain ist ungültig.", parsed.error.flatten());
    try {
      return await detectEmailProvider(parsed.data.domain);
    } catch (error) {
      if (error instanceof EmailProviderLookupTemporaryError) {
        throw problem(503, "EMAIL_PROVIDER_LOOKUP_TEMPORARY_FAILURE", "Die Providerprüfung ist vorübergehend nicht verfügbar.");
      }
      throw problem(400, "EMAIL_DOMAIN_INVALID", "Die E-Mail-Domain ist ungültig.");
    }
  });

  app.get("/api/v1/channel-accounts/:accountId/authorization", async request => {
    requirePilotConfigurator(request);
    const { accountId } = request.params as { accountId: string };
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw problem(400, "CHANNEL_ACCOUNT_INVALID", "Die Kanal-ID ist ungültig.");
    const row = await one(db, request.session.tenantId, `SELECT a.id::text,a.status,a.expected_identifier AS "expectedIdentifier",
      a.authorized_identifier AS "authorizedIdentifier",a.granted_scopes AS "grantedScopes",a.error_code AS "errorCode",
      a.updated_at AS "updatedAt" FROM channel_authorizations a
      WHERE a.tenant_id=$1 AND a.channel_account_id=$2 AND a.provider='google'`, [request.session.tenantId,accountId]);
    return { configured: googleOAuth.configured, authorization: row };
  });

  app.post("/api/v1/channel-accounts/:accountId/authorization/google/start", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async request => {
    requirePilotConfigurator(request);
    if (!googleOAuth.configured) throw problem(503, "GOOGLE_OAUTH_NOT_CONFIGURED", "Google OAuth ist für diese Umgebung noch nicht konfiguriert.");
    const { accountId } = request.params as { accountId: string };
    const state = `${request.session.tenantId}.${randomOAuthValue()}`;
    const codeVerifier = randomOAuthValue();
    const flowId = uuid();
    const authorizationId = uuid();
    const pkceSecretRef = `oauth-flow/google/${flowId}`;
    const account = await one(db, request.session.tenantId, `SELECT a.id::text,a.identifier,a.provider_key,a.mail_product_key
      FROM pilot_channel_accounts a JOIN pilot_onboarding_requests p ON p.tenant_id=a.tenant_id
      WHERE a.tenant_id=$1 AND a.id=$2 AND a.channel_type='email' AND p.selected_channel_account_id=a.id`, [request.session.tenantId,accountId]);
    if (!account) throw problem(404, "PILOT_CHANNEL_ACCOUNT_NOT_FOUND", "Das gewählte Pilot-Postfach wurde nicht gefunden.");
    if (account.provider_key !== "google" || !["gmail","google_workspace"].includes(String(account.mail_product_key))) {
      throw problem(409, "GOOGLE_PROVIDER_REQUIRED", "Dieses Postfach ist nicht als Google-Postfach bestätigt.");
    }
    const previousAuthorization = await one(db, request.session.tenantId, `SELECT secret_ref AS "secretRef"
      FROM channel_authorizations WHERE tenant_id=$1 AND channel_account_id=$2 AND provider='google'`, [request.session.tenantId,accountId]);
    if (previousAuthorization?.secretRef) {
      const previousTokens = await secretVault.get(String(previousAuthorization.secretRef));
      if (previousTokens && "accessToken" in previousTokens) await googleOAuth.revoke(previousTokens.accessToken);
      await secretVault.delete(String(previousAuthorization.secretRef));
    }
    await secretVault.put(pkceSecretRef, { codeVerifier });
    try {
      await db.withTenant(request.session.tenantId, async tx => {
        const authorization = (await tx.query<{ id: string }>(`INSERT INTO channel_authorizations
          (id,tenant_id,channel_account_id,provider,status,expected_identifier,created_by_actor_id,updated_by_actor_id)
          VALUES($1,$2,$3,'google','pending',$4,$5,$5)
          ON CONFLICT (tenant_id,channel_account_id,provider) DO UPDATE SET
            status='pending',expected_identifier=EXCLUDED.expected_identifier,authorized_identifier=NULL,provider_subject=NULL,
            secret_ref=NULL,granted_scopes='[]'::jsonb,error_code=NULL,updated_by_actor_id=EXCLUDED.updated_by_actor_id,
            updated_at=now(),version=channel_authorizations.version+1
          RETURNING id::text`, [authorizationId,request.session.tenantId,accountId,String(account.identifier).toLowerCase(),request.session.actorId])).rows[0]!;
        await tx.query("UPDATE oauth_authorization_flows SET status='expired' WHERE tenant_id=$1 AND authorization_id=$2 AND status='pending'", [request.session.tenantId,authorization.id]);
        await tx.query(`INSERT INTO oauth_authorization_flows
          (id,tenant_id,authorization_id,actor_id,state_hash,pkce_secret_ref,status,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,'pending',now()+interval '10 minutes')`,
          [flowId,request.session.tenantId,authorization.id,request.session.actorId,sha256Hex(state),pkceSecretRef]);
        await tx.query(`INSERT INTO audit_entries(id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata)
          VALUES($1,$2,'channel_authorization','google.authorization_started',$3,'channel_account',$4,'success',$5,'{}'::jsonb)`,
          [uuid(),request.session.tenantId,request.session.actorId,accountId,request.id]);
      });
    } catch (error) {
      await secretVault.delete(pkceSecretRef);
      throw error;
    }
    return {
      authorizationUrl: googleOAuth.authorizationUrl({
        state,
        codeChallenge: sha256Base64Url(codeVerifier),
        loginHint: String(account.identifier)
      }),
      expiresInSeconds: 600
    };
  });

  app.get("/api/oauth/google/callback", async (request, reply) => {
    const query = request.query as { state?: string; code?: string; error?: string };
    const tenantId = query.state?.split(".", 1)[0];
    if (!query.state || !tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
      throw problem(400, "OAUTH_STATE_INVALID", "Die Google-Autorisierung ist ungültig oder abgelaufen.");
    }
    const flow = await db.withTenant(tenantId, async tx => {
      const found = (await tx.query<Row>(`SELECT f.id::text,f.authorization_id::text AS "authorizationId",f.actor_id::text AS "actorId",
        f.pkce_secret_ref AS "pkceSecretRef",a.channel_account_id::text AS "accountId",a.expected_identifier AS "expectedIdentifier"
        FROM oauth_authorization_flows f JOIN channel_authorizations a ON a.tenant_id=f.tenant_id AND a.id=f.authorization_id
        WHERE f.tenant_id=$1 AND f.state_hash=$2 AND f.status='pending' AND f.expires_at>now() FOR UPDATE`, [tenantId,sha256Hex(query.state!)])).rows[0];
      if (!found) throw problem(400, "OAUTH_STATE_INVALID", "Die Google-Autorisierung ist ungültig oder abgelaufen.");
      await tx.query("UPDATE oauth_authorization_flows SET status='consumed',consumed_at=now() WHERE tenant_id=$1 AND id=$2", [tenantId,found.id]);
      return found;
    });
    const fail = async (code: string) => {
      await db.withTenant(tenantId, async tx => {
        await tx.query(`UPDATE channel_authorizations SET status='error',error_code=$3,updated_at=now(),version=version+1
          WHERE tenant_id=$1 AND id=$2`, [tenantId,flow.authorizationId,code]);
        await tx.query(`INSERT INTO audit_entries(id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,reason_code,metadata)
          VALUES($1,$2,'channel_authorization','google.authorization_failed',$3,'channel_account',$4,'failure',$5,$6,'{}'::jsonb)`,
          [uuid(),tenantId,flow.actorId,flow.accountId,request.id,code]);
      });
      return reply.redirect(`/?googleOAuth=error&code=${encodeURIComponent(code)}`);
    };
    if (query.error) {
      await secretVault.delete(String(flow.pkceSecretRef));
      return fail(query.error === "access_denied" ? "GOOGLE_ACCESS_DENIED" : "GOOGLE_AUTHORIZATION_FAILED");
    }
    if (!query.code) return fail("GOOGLE_CODE_MISSING");
    const verifierSecret = await secretVault.get(String(flow.pkceSecretRef));
    await secretVault.delete(String(flow.pkceSecretRef));
    if (!verifierSecret || !("codeVerifier" in verifierSecret)) return fail("OAUTH_PKCE_SECRET_MISSING");
    try {
      const tokens = await googleOAuth.exchangeCode({ code: query.code, codeVerifier: verifierSecret.codeVerifier });
      const identity = await googleOAuth.identity(tokens.accessToken);
      const rejectTokens = async (code: string) => {
        await googleOAuth.revoke(tokens.refreshToken ?? tokens.accessToken).catch(() => undefined);
        return fail(code);
      };
      if (!identity.emailVerified) return rejectTokens("GOOGLE_EMAIL_NOT_VERIFIED");
      if (identity.email.trim().toLowerCase() !== String(flow.expectedIdentifier).trim().toLowerCase()) return rejectTokens("GOOGLE_ACCOUNT_MISMATCH");
      if (!tokens.scope.includes(gmailReadOnlyScope)) return rejectTokens("GOOGLE_SCOPE_MISSING");
      const tokenSecretRef = `channel-authorization/google/${flow.authorizationId}`;
      await secretVault.put(tokenSecretRef, tokens);
      try {
        await db.withTenant(tenantId, async tx => {
          await tx.query(`UPDATE channel_authorizations SET status='connected',authorized_identifier=$3,provider_subject=$4,
            secret_ref=$5,granted_scopes=$6::jsonb,error_code=NULL,updated_at=now(),version=version+1 WHERE tenant_id=$1 AND id=$2`,
            [tenantId,flow.authorizationId,identity.email.toLowerCase(),identity.subject,tokenSecretRef,JSON.stringify(tokens.scope)]);
          await tx.query(`INSERT INTO audit_entries(id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata)
            VALUES($1,$2,'channel_authorization','google.authorization_connected',$3,'channel_account',$4,'success',$5,'{}'::jsonb)`,
            [uuid(),tenantId,flow.actorId,flow.accountId,request.id]);
        });
      } catch (error) {
        await secretVault.delete(tokenSecretRef);
        throw error;
      }
      return reply.redirect("/?googleOAuth=connected");
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("GOOGLE_")) return fail(error.message);
      throw error;
    }
  });

  app.delete("/api/v1/channel-accounts/:accountId/authorization", async (request, reply) => {
    requirePilotConfigurator(request);
    const { accountId } = request.params as { accountId: string };
    const authorization = await one(db, request.session.tenantId, `SELECT id::text,secret_ref AS "secretRef",status
      FROM channel_authorizations WHERE tenant_id=$1 AND channel_account_id=$2 AND provider='google'`, [request.session.tenantId,accountId]);
    if (!authorization) return reply.code(204).send();
    if (authorization.secretRef) {
      const tokens = await secretVault.get(String(authorization.secretRef));
      if (tokens && "accessToken" in tokens) await googleOAuth.revoke(tokens.accessToken);
      await secretVault.delete(String(authorization.secretRef));
    }
    await db.withTenant(request.session.tenantId, async tx => {
      await tx.query(`UPDATE channel_authorizations SET status='revoked',secret_ref=NULL,provider_subject=NULL,
        granted_scopes='[]'::jsonb,error_code=NULL,updated_by_actor_id=$3,updated_at=now(),version=version+1
        WHERE tenant_id=$1 AND id=$2`, [request.session.tenantId,authorization.id,request.session.actorId]);
      await tx.query(`INSERT INTO audit_entries(id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata)
        VALUES($1,$2,'channel_authorization','google.authorization_revoked',$3,'channel_account',$4,'success',$5,'{}'::jsonb)`,
        [uuid(),request.session.tenantId,request.session.actorId,accountId,request.id]);
    });
    return reply.code(204).send();
  });

  app.put("/api/v1/pilot-onboarding", async (request, reply) => {
    requirePilotConfigurator(request);
    const expectedVersion = parseVersion(request, "Ersteinrichtungs");
    const parsed = pilotSetupSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "PILOT_SETUP_INVALID", "Die Pilotangaben sind unvollständig oder ungültig.", parsed.error.flatten());
    const value = parsed.data;
    const selectedAccount = value.channelAccounts.find(account => account.id === value.selectedChannelAccountId)!;
    const primaryChannel = primaryChannelFor(selectedAccount.mailProductKey!);
    const saved = await db.withTenant(request.session.tenantId, async tx => {
      const current = (await tx.query<Row>("SELECT version FROM pilot_onboarding_requests WHERE tenant_id=$1 FOR UPDATE", [request.session.tenantId])).rows[0];
      const existingAccounts = current
        ? (await tx.query<{ id: string }>("SELECT id::text AS id FROM pilot_channel_accounts WHERE tenant_id=$1 FOR UPDATE", [request.session.tenantId])).rows
        : [];
      if ((!current && expectedVersion !== 0) || (current && Number(current.version) !== expectedVersion)) throw problem(409, "VERSION_CONFLICT", "Die Ersteinrichtung wurde zwischenzeitlich geändert. Bitte neu laden.");
      if (!current) {
        await tx.query(`INSERT INTO pilot_onboarding_requests
          (tenant_id,organization_name,brand_name,workflow_name,primary_channel,identity_provider,system_of_record,hosting_region,target_start_date,team_names,
           expected_users,monthly_cases,retention_days,pilot_owner_name,pilot_owner_email,technical_contact_name,technical_contact_email,
           access_environment,data_exclusions_confirmed,inventory_confirmed,created_by_actor_id,updated_by_actor_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21)`,
          [request.session.tenantId,value.organizationName,value.brandName,value.workflowName,primaryChannel,value.identityProvider,value.systemOfRecord,value.hostingRegion,value.targetStartDate,JSON.stringify(value.teamNames),value.expectedUsers,value.monthlyCases,value.retentionDays,value.pilotOwnerName,value.pilotOwnerEmail,value.technicalContactName,value.technicalContactEmail,value.accessEnvironment,value.dataExclusionsConfirmed,value.inventoryConfirmed,request.session.actorId]);
      } else {
        await tx.query("UPDATE pilot_onboarding_requests SET selected_channel_account_id=NULL WHERE tenant_id=$1", [request.session.tenantId]);
        await tx.query(`UPDATE pilot_onboarding_requests SET organization_name=$2,brand_name=$3,workflow_name=$4,primary_channel=$5,identity_provider=$6,
          system_of_record=$7,hosting_region=$8,target_start_date=$9,team_names=$10::jsonb,expected_users=$11,monthly_cases=$12,retention_days=$13,
          pilot_owner_name=$14,pilot_owner_email=$15,technical_contact_name=$16,technical_contact_email=$17,access_environment=$18,
          data_exclusions_confirmed=$19,inventory_confirmed=$20,updated_by_actor_id=$21,updated_at=now(),version=version+1 WHERE tenant_id=$1`,
          [request.session.tenantId,value.organizationName,value.brandName,value.workflowName,primaryChannel,value.identityProvider,value.systemOfRecord,value.hostingRegion,value.targetStartDate,JSON.stringify(value.teamNames),value.expectedUsers,value.monthlyCases,value.retentionDays,value.pilotOwnerName,value.pilotOwnerEmail,value.technicalContactName,value.technicalContactEmail,value.accessEnvironment,value.dataExclusionsConfirmed,value.inventoryConfirmed,request.session.actorId]);
      }
      const existingIds = new Set(existingAccounts.map(account => account.id));
      const submittedIds = new Set(value.channelAccounts.map(account => account.id));
      for (const account of value.channelAccounts) {
        const accountValues = [account.id,request.session.tenantId,account.type,account.identifier,account.label ?? "",legacyEmailProvider(account.providerKey) ?? null,account.providerKey ?? null,account.mailProductKey ?? null,account.providerName ?? null,account.type === "email" ? "inventory" : "blocked",request.session.actorId];
        if (existingIds.has(account.id)) {
          await tx.query(`UPDATE pilot_channel_accounts SET
            channel_type=$3,identifier=$4,display_label=$5,email_provider=$6,provider_key=$7,mail_product_key=$8,
            email_provider_name=$9,activation_status=$10,updated_by_actor_id=$11,updated_at=now()
            WHERE id=$1 AND tenant_id=$2`, accountValues);
        } else {
          await tx.query(`INSERT INTO pilot_channel_accounts
            (id,tenant_id,channel_type,identifier,display_label,email_provider,provider_key,mail_product_key,email_provider_name,activation_status,created_by_actor_id,updated_by_actor_id)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`, accountValues);
        }
      }
      for (const account of existingAccounts) {
        if (!submittedIds.has(account.id)) {
          await tx.query("DELETE FROM pilot_channel_accounts WHERE tenant_id=$1 AND id=$2", [request.session.tenantId,account.id]);
        }
      }
      await tx.query("UPDATE pilot_onboarding_requests SET selected_channel_account_id=$2 WHERE tenant_id=$1", [request.session.tenantId,value.selectedChannelAccountId]);
      await tx.query(`INSERT INTO audit_entries(id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata)
        VALUES($1,$2,'pilot_configuration',$3,$4,'tenant',$2,'success',$5,'{}'::jsonb)`, [uuid(),request.session.tenantId,current ? "pilot_setup.updated" : "pilot_setup.submitted",request.session.actorId,request.id]);
      return (await tx.query<Row>(pilotSetupSelect, [request.session.tenantId])).rows[0];
    });
    return reply.code(expectedVersion === 0 ? 201 : 200).send({ setup: saved, state: "relay_review_required", nextStep: "Relay prüft Zugang, Identität und Sicherheitsgates. Reale Daten bleiben gesperrt." });
  });

  app.get("/api/v1/integration-issues", async (request) => {
    requireIntegrationOperator(request);
    const inbound = await list(db, request.session.tenantId, `SELECT i.id,'ingress' AS kind,i.issue_type AS subject,
      CASE WHEN i.status='resolved' THEN 'resolved' ELSE 'blocked' END AS state,i.reason_code AS code,
      0 AS attempts,i.occurred_at,false AS retry_eligible,c.display_name AS connector_name
      FROM integration_issues i LEFT JOIN connectors c ON c.tenant_id=i.tenant_id AND c.id=i.connector_id
      WHERE i.tenant_id=$1 AND i.status='open' ORDER BY i.occurred_at DESC`, [request.session.tenantId]);
    const outbound = await list(db, request.session.tenantId, `SELECT o.id,'outbox' AS kind,d.event_type AS subject,
      CASE WHEN o.dead_lettered_at IS NOT NULL THEN 'dead_letter' ELSE 'retrying' END AS state,
      o.last_error_code AS code,o.attempts,o.created_at AS occurred_at,
      CASE WHEN o.published_at IS NULL AND (o.lease_until IS NULL OR o.lease_until < now()) THEN true ELSE false END AS retry_eligible,
      NULL AS connector_name
      FROM outbox_events o JOIN domain_events d ON d.id=o.domain_event_id AND d.tenant_id=o.tenant_id
      WHERE o.tenant_id=$1 AND o.published_at IS NULL AND (o.last_error_code IS NOT NULL OR o.dead_lettered_at IS NOT NULL)
      ORDER BY o.created_at DESC`, [request.session.tenantId]);
    return [...inbound, ...outbound].sort((a, b) => new Date(String(b.occurred_at)).getTime() - new Date(String(a.occurred_at)).getTime());
  });

  app.post("/api/v1/integration-issues/outbox/:id/redrive", { config: { rateLimit: { max: 3, timeWindow: "10 minutes" } } }, async (request, reply) => {
    requireIntegrationOperator(request);
    const { id } = request.params as { id: string };
    await db.withTenant(request.session.tenantId, async tx => {
      const row = (await tx.query<Row>(`SELECT id,published_at,lease_until,last_error_code,dead_lettered_at FROM outbox_events
        WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [request.session.tenantId, id])).rows[0];
      if (!row) throw problem(404, "INTEGRATION_ISSUE_NOT_FOUND", "Integrationsfehler nicht gefunden.");
      if (row.published_at || (!row.last_error_code && !row.dead_lettered_at)) throw problem(409, "OUTBOX_REDRIVE_NOT_ELIGIBLE", "Dieses Event benötigt keinen Wiederanlauf.");
      if (row.lease_until && new Date(String(row.lease_until)) > new Date()) throw problem(409, "OUTBOX_LEASE_ACTIVE", "Dieses Event wird bereits verarbeitet.");
      await tx.query(`UPDATE outbox_events SET attempts=0,available_at=now(),last_error_code=NULL,
        dead_lettered_at=NULL,locked_by=NULL,lease_until=NULL,redrive_count=redrive_count+1
        WHERE tenant_id=$1 AND id=$2`, [request.session.tenantId, id]);
      await tx.query(`INSERT INTO audit_entries
        (id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata)
        VALUES ($1,$2,'integration_operation','outbox.redrive_requested',$3,'outbox',$4,'success',$5,'{}'::jsonb)`,
        [uuid(), request.session.tenantId, request.session.actorId, id, request.id]);
    });
    return reply.code(202).send({ accepted: true });
  });

  app.get("/api/v1/cases", async (request) => {
    const query = request.query as { view?: string; owner?: string; status?: string };
    const params: unknown[] = [request.session.tenantId, request.session.actorId];
    let filter = "";
    if (query.view === "mine") filter += " AND c.owner_actor_id=$2 AND c.status NOT IN ('resolved','closed')";
    if (query.view === "unassigned") filter += " AND c.owner_actor_id IS NULL AND c.status NOT IN ('resolved','closed')";
    if (query.view === "active") filter += " AND c.status NOT IN ('resolved','closed')";
    if (query.view === "resolved") filter += " AND c.status IN ('resolved','closed')";
    return list(db, request.session.tenantId, `
      SELECT c.id,c.subject,c.party_name,c.status,c.owner_actor_id,c.version,c.updated_at,
        a.display_name AS owner_name,
        (SELECT i.body FROM interactions i WHERE i.tenant_id=c.tenant_id AND i.conversation_id=c.id ORDER BY i.occurred_at DESC LIMIT 1) AS preview,
        (SELECT i.channel FROM interactions i WHERE i.tenant_id=c.tenant_id AND i.conversation_id=c.id ORDER BY i.occurred_at DESC LIMIT 1) AS channel,
        (SELECT min(due_at) FROM commitments k WHERE k.tenant_id=c.tenant_id AND k.conversation_id=c.id AND k.status='open') AS next_due_at,
        (SELECT count(*)::int FROM commitments k WHERE k.tenant_id=c.tenant_id AND k.conversation_id=c.id AND k.status='open') AS open_commitments
      FROM conversations c LEFT JOIN actors a ON a.tenant_id=c.tenant_id AND a.id=c.owner_actor_id
      WHERE c.tenant_id=$1 AND $2::uuid IS NOT NULL ${filter}
      ORDER BY CASE WHEN EXISTS (SELECT 1 FROM commitments k WHERE k.conversation_id=c.id AND k.status='open' AND k.due_at < now()) THEN 0 WHEN c.owner_actor_id IS NULL THEN 1 ELSE 2 END, c.updated_at DESC
    `, params);
  });

  app.get("/api/v1/cases/:id", async (request) => {
    const { id } = request.params as { id: string };
    const item = await one(db, request.session.tenantId, `SELECT c.id,c.external_thread_id,c.connector_id,c.subject,c.party_name,c.status,c.owner_actor_id,c.version,c.created_at,c.updated_at,a.display_name AS owner_name FROM conversations c LEFT JOIN actors a ON a.id=c.owner_actor_id AND a.tenant_id=c.tenant_id WHERE c.tenant_id=$1 AND c.id=$2`, [request.session.tenantId, id]);
    if (!item) throw problem(404, "CASE_NOT_FOUND", "Case nicht gefunden.");
    const interactions = await list(db, request.session.tenantId, "SELECT id,channel,direction,body,party_name,provider_event_id,occurred_at FROM interactions WHERE tenant_id=$1 AND conversation_id=$2 ORDER BY occurred_at,id", [request.session.tenantId, id]);
    const commitments = await list(db, request.session.tenantId, `SELECT k.*,a.display_name AS assignee_name, CASE WHEN k.status='open' AND k.due_at < now() THEN true ELSE false END AS overdue FROM commitments k JOIN actors a ON a.id=k.assignee_actor_id AND a.tenant_id=k.tenant_id WHERE k.tenant_id=$1 AND k.conversation_id=$2 ORDER BY CASE WHEN k.status='open' THEN 0 ELSE 1 END,k.due_at NULLS LAST,k.created_at`, [request.session.tenantId, id]);
    const handoffs = await list(db, request.session.tenantId, `SELECT h.*,fa.display_name AS from_actor_name,ta.display_name AS to_actor_name
      FROM handoffs h JOIN actors fa ON fa.id=h.from_actor_id AND fa.tenant_id=h.tenant_id
      JOIN actors ta ON ta.id=h.to_actor_id AND ta.tenant_id=h.tenant_id
      WHERE h.tenant_id=$1 AND h.conversation_id=$2 ORDER BY h.created_at DESC`, [request.session.tenantId, id]);
    const events = await list(db, request.session.tenantId, `SELECT e.*,a.display_name AS actor_name FROM timeline_events e LEFT JOIN actors a ON a.id=e.actor_id AND a.tenant_id=e.tenant_id WHERE e.tenant_id=$1 AND e.conversation_id=$2 ORDER BY e.occurred_at,e.id`, [request.session.tenantId, id]);
    return { ...item, interactions, commitments, handoffs, events };
  });

  app.get("/api/v1/cases/:id/audit", async (request) => {
    const { id } = request.params as { id: string };
    const exists = await one(db, request.session.tenantId, "SELECT id FROM conversations WHERE tenant_id=$1 AND id=$2", [request.session.tenantId, id]);
    if (!exists) throw problem(404, "CASE_NOT_FOUND", "Case nicht gefunden.");
    return list(db, request.session.tenantId, `SELECT id,category,action,result,request_id,reason_code,metadata,occurred_at
      FROM audit_entries WHERE tenant_id=$1 AND subject_type='conversation' AND subject_id=$2
      ORDER BY occurred_at DESC,id DESC LIMIT 100`, [request.session.tenantId, id]);
  });

  app.post("/api/v1/ingress/events", async (request, reply) => {
    if (options.enableTestIngress === false) throw problem(404, "NOT_FOUND", "Route nicht gefunden.");
    requireEditor(request);
    const parsed = ingressSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Das Event ist unvollständig oder ungültig.", parsed.error.flatten());
    const outcome = await processCanonicalIngress({ db, tenantId: request.session.tenantId, actorId: request.session.actorId, requestId: request.id, event: parsed.data });
    return reply.code(outcome.duplicate ? 200 : 202).send(outcome);
  });

  app.post("/api/internal/v1/channel-ingress/:routingKey/events", { bodyLimit: 256 * 1024, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { routingKey } = request.params as { routingKey: string };
    const connector = await db.lookupConnector(routingKey);
    if (!connector || connector.status !== "active") throw problem(404, "CONNECTOR_NOT_FOUND", "Connector nicht gefunden.");
    const tenantId = String(connector.tenant_id); const connectorId = String(connector.connector_key);
    const secret = options.connectorSecrets?.[String(connector.secret_ref)];
    if (!secret) throw problem(503, "CONNECTOR_SECRET_UNAVAILABLE", "Connector kann derzeit nicht authentifiziert werden.");
    try {
      verifyConnectorSignature(request.rawBody ?? Buffer.alloc(0), request.headers["x-relay-timestamp"] as string | undefined, request.headers["x-relay-signature"] as string | undefined, secret);
      const parsed = connectorIngressSchema.safeParse(request.body);
      if (!parsed.success) throw problem(400, "CONNECTOR_VALIDATION_ERROR", "Connector Event ist ungültig.", parsed.error.flatten());
      const outcome = await processCanonicalIngress({ db, tenantId, actorId: null, requestId: request.id, event: { ...parsed.data, connectorId } });
      return reply.code(outcome.duplicate ? 200 : 202).send(outcome);
    } catch (error) {
      const failure = error as Error & { code?: string; statusCode?: number };
      if (failure.statusCode !== 401) await db.withTenant(tenantId, tx => tx.query(`INSERT INTO integration_issues
          (id,tenant_id,connector_id,issue_type,reason_code,retry_eligible,source_ref,diagnostic)
          VALUES ($1,$2,$3,$4,$5,false,$6,$7::jsonb)`, [uuid(), tenantId, connector.id,
          failure.statusCode === 400 ? "ingress_validation" : "ingress_processing",
          failure.code ?? "CONNECTOR_PROCESSING_ERROR", request.id, JSON.stringify({ routingKeySuffix: routingKey.slice(-6), requestId: request.id })]));
      throw error;
    }
  });

  app.put("/api/v1/cases/:id/owner", async (request) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = ownerSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Owner ist ungültig.", parsed.error.flatten());
    const { id } = request.params as { id: string };
    if (parsed.data.ownerId) {
      const actor = await one(db, request.session.tenantId, "SELECT id FROM actors WHERE tenant_id=$1 AND id=$2 AND role='editor'", [request.session.tenantId, parsed.data.ownerId]);
      if (!actor) throw problem(400, "INVALID_OWNER", "Nur aktive Editor-Nutzer können einen Case übernehmen.");
    }
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const result = (await tx.query<Row>("UPDATE conversations SET owner_actor_id=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3 AND version=$4 RETURNING version", [parsed.data.ownerId, request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: parsed.data.ownerId ? "ownership.assigned" : "ownership.released", actorId: request.session.actorId, requestId: request.id, data: { ownerId: parsed.data.ownerId } });
      return result;
    });
    return { version: updated.version };
  });

  app.patch("/api/v1/cases/:id/status", async (request) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = statusSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Status ist ungültig.");
    const { id } = request.params as { id: string };
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const current = (await tx.query<Row>("SELECT status FROM conversations WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [request.session.tenantId, id])).rows[0];
      if (!current) throw problem(404, "CASE_NOT_FOUND", "Case nicht gefunden.");
      requireTransition(current.status as CaseStatus, parsed.data.status);
      if (["resolved", "closed"].includes(parsed.data.status)) {
        const open = (await tx.query<Row>("SELECT count(*)::int AS count FROM commitments WHERE tenant_id=$1 AND conversation_id=$2 AND status='open'", [request.session.tenantId, id])).rows[0];
        if (Number(open?.count) > 0) throw problem(409, "OPEN_COMMITMENTS", "Offene Commitments müssen zuerst erfüllt oder abgebrochen werden.", { count: open?.count });
      }
      const result = (await tx.query<Row>("UPDATE conversations SET status=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3 AND version=$4 RETURNING version", [parsed.data.status, request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: "conversation.status_changed", actorId: request.session.actorId, requestId: request.id, data: { from: current.status, to: parsed.data.status } });
      return result;
    });
    return { version: updated.version };
  });

  app.post("/api/v1/cases/:id/commitments", async (request, reply) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = commitmentSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Commitment ist unvollständig.", parsed.error.flatten());
    const { id } = request.params as { id: string };
    const assignee = await one(db, request.session.tenantId, "SELECT id FROM actors WHERE tenant_id=$1 AND id=$2 AND role='editor'", [request.session.tenantId, parsed.data.assigneeId]);
    if (!assignee) throw problem(400, "INVALID_ASSIGNEE", "Der Verantwortliche gehört nicht zu diesem Tenant oder kann keine Commitments übernehmen.");
    const commitmentId = uuid();
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const result = (await tx.query<Row>("UPDATE conversations SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING version", [request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await tx.query("INSERT INTO commitments (id,tenant_id,conversation_id,description,assignee_actor_id,due_at,source_interaction_id,created_by_actor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [commitmentId, request.session.tenantId, id, parsed.data.description, parsed.data.assigneeId, parsed.data.dueAt ?? null, parsed.data.sourceInteractionId ?? null, request.session.actorId]);
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: "commitment.created", actorId: request.session.actorId, requestId: request.id, data: { commitmentId, assigneeId: parsed.data.assigneeId, dueAt: parsed.data.dueAt ?? null } });
      return result;
    });
    return reply.code(201).send({ id: commitmentId, version: updated.version });
  });

  app.patch("/api/v1/cases/:id/commitments/:commitmentId", async (request) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = commitmentUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Commitment-Status ist ungültig.");
    const { id, commitmentId } = request.params as { id: string; commitmentId: string };
    const commitment = await one(db, request.session.tenantId, "SELECT status FROM commitments WHERE tenant_id=$1 AND conversation_id=$2 AND id=$3", [request.session.tenantId, id, commitmentId]);
    if (!commitment) throw problem(404, "COMMITMENT_NOT_FOUND", "Commitment nicht gefunden.");
    if (commitment.status !== "open") throw problem(409, "COMMITMENT_FINAL", "Dieses Commitment ist bereits abgeschlossen.");
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const result = (await tx.query<Row>("UPDATE conversations SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING version", [request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await tx.query("UPDATE commitments SET status=$1,updated_at=now() WHERE tenant_id=$2 AND conversation_id=$3 AND id=$4", [parsed.data.status, request.session.tenantId, id, commitmentId]);
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: `commitment.${parsed.data.status}`, actorId: request.session.actorId, requestId: request.id, data: { commitmentId } });
      return result;
    });
    return { version: updated.version };
  });

  app.post("/api/v1/cases/:id/handoffs", async (request, reply) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = handoffSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Übergabe ist unvollständig.", parsed.error.flatten());
    const { id } = request.params as { id: string };
    if (parsed.data.toActorId === request.session.actorId) throw problem(400, "SELF_HANDOFF", "Eine Übergabe an sich selbst ist nicht möglich.");
    const recipient = await one(db, request.session.tenantId, "SELECT id FROM actors WHERE tenant_id=$1 AND id=$2 AND role='editor'", [request.session.tenantId, parsed.data.toActorId]);
    if (!recipient) throw problem(400, "INVALID_RECIPIENT", "Der Empfänger kann keine Cases übernehmen.");
    const handoffId = uuid();
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const pending = (await tx.query<Row>("SELECT id FROM handoffs WHERE tenant_id=$1 AND conversation_id=$2 AND status='pending'", [request.session.tenantId, id])).rows[0];
      if (pending) throw problem(409, "HANDOFF_PENDING", "Für diesen Case ist bereits eine Übergabe offen.");
      const result = (await tx.query<Row>("UPDATE conversations SET version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND version=$3 RETURNING version", [request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await tx.query("INSERT INTO handoffs (id,tenant_id,conversation_id,from_actor_id,to_actor_id,reason,next_step,due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [handoffId, request.session.tenantId, id, request.session.actorId, parsed.data.toActorId, parsed.data.reason, parsed.data.nextStep, parsed.data.dueAt ?? null]);
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: "handoff.requested", actorId: request.session.actorId, requestId: request.id, data: { handoffId, fromActorId: request.session.actorId, toActorId: parsed.data.toActorId, dueAt: parsed.data.dueAt ?? null } });
      return result;
    });
    return reply.code(201).send({ id: handoffId, version: updated.version });
  });

  app.patch("/api/v1/cases/:id/handoffs/:handoffId", async (request) => {
    requireEditor(request);
    const version = parseVersion(request);
    const parsed = handoffDecisionSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "VALIDATION_ERROR", "Übergabeentscheidung ist ungültig.");
    const { id, handoffId } = request.params as { id: string; handoffId: string };
    const handoff = await one(db, request.session.tenantId, "SELECT * FROM handoffs WHERE tenant_id=$1 AND conversation_id=$2 AND id=$3", [request.session.tenantId, id, handoffId]);
    if (!handoff) throw problem(404, "HANDOFF_NOT_FOUND", "Übergabe nicht gefunden.");
    if (handoff.status !== "pending") throw problem(409, "HANDOFF_FINAL", "Diese Übergabe ist bereits abgeschlossen.");
    if (parsed.data.decision === "cancelled" && handoff.from_actor_id !== request.session.actorId) throw problem(403, "FORBIDDEN", "Nur der Absender darf die Übergabe abbrechen.");
    if (parsed.data.decision !== "cancelled" && handoff.to_actor_id !== request.session.actorId) throw problem(403, "FORBIDDEN", "Nur der Empfänger darf diese Übergabe beantworten.");
    const updated = await db.withTenant(request.session.tenantId, async (tx) => {
      const result = (await tx.query<Row>(`UPDATE conversations SET owner_actor_id=CASE WHEN $1='accepted' THEN $2::uuid ELSE owner_actor_id END,
        version=version+1,updated_at=now() WHERE tenant_id=$3 AND id=$4 AND version=$5 RETURNING version`, [parsed.data.decision, handoff.to_actor_id, request.session.tenantId, id, version])).rows[0];
      if (!result) throw problem(409, "VERSION_CONFLICT", "Der Case wurde zwischenzeitlich geändert. Bitte neu laden.");
      await tx.query("UPDATE handoffs SET status=$1,resolved_at=now(),responded_by_actor_id=$2 WHERE tenant_id=$3 AND conversation_id=$4 AND id=$5", [parsed.data.decision, request.session.actorId, request.session.tenantId, id, handoffId]);
      await recordDomainChange(tx, { tenantId: request.session.tenantId, conversationId: id, version: Number(result.version), eventType: `handoff.${parsed.data.decision}`, actorId: request.session.actorId, requestId: request.id, data: { handoffId, fromActorId: handoff.from_actor_id, toActorId: handoff.to_actor_id } });
      return result;
    });
    return { version: updated.version };
  });

  if (options.serveWeb) {
    const webRoot = path.resolve("dist/web");
    if (fs.existsSync(webRoot)) {
      await app.register(fastifyStatic, { root: webRoot });
      app.setNotFoundHandler((request, reply) => request.url.startsWith("/api/") ? reply.code(404).send({ code: "NOT_FOUND" }) : reply.sendFile("index.html"));
    }
  }
  return app;
}
