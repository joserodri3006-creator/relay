import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import type { Database } from "./db.js";
import { commitmentSchema, commitmentUpdateSchema, connectorIngressSchema, handoffDecisionSchema, handoffSchema, ingressSchema, ownerSchema, pilotSetupSchema, requireTransition, statusSchema, type CaseStatus, type Session } from "./domain.js";
import { recordDomainChange } from "./eventing.js";
import { openapiDocument } from "./openapi.js";
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

const pilotSetupSelect = `SELECT tenant_id AS "tenantId",organization_name AS "organizationName",workflow_name AS "workflowName",
  primary_channel AS "primaryChannel",identity_provider AS "identityProvider",system_of_record AS "systemOfRecord",
  hosting_region AS "hostingRegion",target_start_date::text AS "targetStartDate",team_names AS "teamNames",
  expected_users AS "expectedUsers",monthly_cases AS "monthlyCases",retention_days AS "retentionDays",
  pilot_owner_name AS "pilotOwnerName",pilot_owner_email AS "pilotOwnerEmail",technical_contact_name AS "technicalContactName",
  technical_contact_email AS "technicalContactEmail",access_environment AS "accessEnvironment",
  data_exclusions_confirmed AS "dataExclusionsConfirmed",version,updated_at AS "updatedAt"
  FROM pilot_onboarding_requests WHERE tenant_id=$1`;

function verifyConnectorSignature(rawBody: Buffer, timestamp: string | undefined, signature: string | undefined, secret: string) {
  if (!timestamp || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) throw problem(401, "CONNECTOR_SIGNATURE_REQUIRED", "Gültige Connector-Signatur erforderlich.");
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) throw problem(401, "CONNECTOR_TIMESTAMP_INVALID", "Connector-Zeitstempel liegt außerhalb des erlaubten Fensters.");
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw problem(401, "CONNECTOR_SIGNATURE_INVALID", "Connector-Signatur ist ungültig.");
}

type AuthPublicConfig = { mode: "demo" } | { mode: "oidc"; authority: string; clientId: string; scope: string; redirectUri: string; postLogoutRedirectUri: string };

export async function buildApp(db: Database, options: { serveWeb?: boolean; connectorSecrets?: Record<string, string>; authenticate?: Authenticator; corsOrigins?: string[]; logger?: boolean; expectedMigration?: string; authPublicConfig?: AuthPublicConfig; enableTestIngress?: boolean } = {}) {
  const app = options.logger
    ? Fastify({ logger: { level: "info", redact: ["req.headers.authorization", "req.headers.x-relay-signature"] }, disableRequestLogging: true, bodyLimit: 1024 * 1024 })
    : Fastify({ logger: false, bodyLimit: 1024 * 1024 });
  const authenticate = options.authenticate ?? createDemoAuthenticator();
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
    if (!request.url.startsWith("/api/") || request.url === "/api/health" || request.url === "/api/openapi.json" || request.url === "/api/auth/config" || request.url.startsWith("/api/internal/")) return;
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

  app.put("/api/v1/pilot-onboarding", async (request, reply) => {
    requirePilotConfigurator(request);
    const expectedVersion = parseVersion(request, "Ersteinrichtungs");
    const parsed = pilotSetupSchema.safeParse(request.body);
    if (!parsed.success) throw problem(400, "PILOT_SETUP_INVALID", "Die Pilotangaben sind unvollständig oder ungültig.", parsed.error.flatten());
    const value = parsed.data;
    const saved = await db.withTenant(request.session.tenantId, async tx => {
      const current = (await tx.query<Row>("SELECT version FROM pilot_onboarding_requests WHERE tenant_id=$1 FOR UPDATE", [request.session.tenantId])).rows[0];
      if ((!current && expectedVersion !== 0) || (current && Number(current.version) !== expectedVersion)) throw problem(409, "VERSION_CONFLICT", "Die Ersteinrichtung wurde zwischenzeitlich geändert. Bitte neu laden.");
      if (!current) {
        await tx.query(`INSERT INTO pilot_onboarding_requests
          (tenant_id,organization_name,workflow_name,primary_channel,identity_provider,system_of_record,hosting_region,target_start_date,team_names,
           expected_users,monthly_cases,retention_days,pilot_owner_name,pilot_owner_email,technical_contact_name,technical_contact_email,
           access_environment,data_exclusions_confirmed,created_by_actor_id,updated_by_actor_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)`,
          [request.session.tenantId,value.organizationName,value.workflowName,value.primaryChannel,value.identityProvider,value.systemOfRecord,value.hostingRegion,value.targetStartDate,JSON.stringify(value.teamNames),value.expectedUsers,value.monthlyCases,value.retentionDays,value.pilotOwnerName,value.pilotOwnerEmail,value.technicalContactName,value.technicalContactEmail,value.accessEnvironment,value.dataExclusionsConfirmed,request.session.actorId]);
      } else {
        await tx.query(`UPDATE pilot_onboarding_requests SET organization_name=$2,workflow_name=$3,primary_channel=$4,identity_provider=$5,
          system_of_record=$6,hosting_region=$7,target_start_date=$8,team_names=$9::jsonb,expected_users=$10,monthly_cases=$11,retention_days=$12,
          pilot_owner_name=$13,pilot_owner_email=$14,technical_contact_name=$15,technical_contact_email=$16,access_environment=$17,
          data_exclusions_confirmed=$18,updated_by_actor_id=$19,updated_at=now(),version=version+1 WHERE tenant_id=$1`,
          [request.session.tenantId,value.organizationName,value.workflowName,value.primaryChannel,value.identityProvider,value.systemOfRecord,value.hostingRegion,value.targetStartDate,JSON.stringify(value.teamNames),value.expectedUsers,value.monthlyCases,value.retentionDays,value.pilotOwnerName,value.pilotOwnerEmail,value.technicalContactName,value.technicalContactEmail,value.accessEnvironment,value.dataExclusionsConfirmed,request.session.actorId]);
      }
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
