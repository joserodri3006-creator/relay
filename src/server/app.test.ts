import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { createDatabase, ids, type Database } from "./db.js";
import { OutboxWorker } from "./outbox.js";

const editor = { authorization: "Bearer demo-editor", "content-type": "application/json" };
const viewer = { authorization: "Bearer demo-viewer", "content-type": "application/json" };
const teammate = { authorization: "Bearer demo-teammate", "content-type": "application/json" };
const event = {
  providerEventId: "provider-event-001",
  connectorId: "email-demo",
  externalThreadId: "thread-4711",
  channel: "email",
  direction: "inbound",
  subject: "Anlage E17",
  partyName: "Anna Weber",
  body: "Bitte bis 14 Uhr zurückrufen."
};
const pilotSetup = {
  organizationName: "R&C Lifestyle", brandName: "Blazed Outfitters", workflowName: "Kundenanfrage bis bestätigte Übergabe",
  channelAccounts: [
    { id: "10000000-0000-4000-8000-000000000001", type: "email", identifier: "support@blazed.example", label: "Kundenservice", provider: "microsoft_365" },
    { id: "10000000-0000-4000-8000-000000000002", type: "email", identifier: "orders@blazed.example", label: "Bestellungen" },
    { id: "10000000-0000-4000-8000-000000000003", type: "email", identifier: "returns@blazed.example", label: "Retouren" },
    { id: "10000000-0000-4000-8000-000000000004", type: "email", identifier: "info@blazed.example", label: "Allgemein", provider: "other", providerName: "ALL-INKL" },
    { id: "10000000-0000-4000-8000-000000000005", type: "instagram", identifier: "@blazedoutfitters", label: "Hauptaccount" },
    { id: "10000000-0000-4000-8000-000000000006", type: "instagram", identifier: "@blazedoutfitters.de", label: "Deutschland" },
    { id: "10000000-0000-4000-8000-000000000007", type: "instagram", identifier: "@blazed.community", label: "Community" },
    { id: "10000000-0000-4000-8000-000000000008", type: "tiktok", identifier: "@blazedoutfitters", label: "TikTok" }
  ],
  selectedChannelAccountId: "10000000-0000-4000-8000-000000000001", inventoryConfirmed: true,
  identityProvider: "entra", systemOfRecord: "none", hostingRegion: "eu_germany",
  targetStartDate: "2026-08-15", teamNames: ["Serviceannahme", "Außendienst"], expectedUsers: 8, monthlyCases: 500, retentionDays: 30,
  pilotOwnerName: "Anna Beispiel", pilotOwnerEmail: "anna@example.test", technicalContactName: "Tom Technik", technicalContactEmail: "tom@example.test",
  accessEnvironment: "sandbox", dataExclusionsConfirmed: true
};

describe("Case Control vertical slice", () => {
  let db: Database;
  let app: FastifyInstance;
  beforeEach(async () => { db = await createDatabase(); app = await buildApp(db, { connectorSecrets: { "connector/demo": "test-secret" } }); });
  afterEach(async () => { await app.close(); await db.close(); });

  it("fordert Authentifizierung und schützt Mutationen vor Viewern", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/cases" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: viewer, payload: event })).statusCode).toBe(403);
  });

  it("verarbeitet Provider-Retries fachlich genau einmal", async () => {
    const first = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    expect(first.statusCode).toBe(202);
    const duplicate = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);
    const cases = await app.inject({ method: "GET", url: "/api/v1/cases?view=unassigned", headers: editor });
    expect(cases.json()).toHaveLength(1);
    const detail = await app.inject({ method: "GET", url: `/api/v1/cases/${first.json().caseId}`, headers: editor });
    expect(detail.json().interactions).toHaveLength(1);
  });

  it("weist wiederverwendete Event-IDs mit verändertem Payload ab", async () => {
    await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    const conflict = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: { ...event, body: "Manipulierter Inhalt" } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("scope-t Provider-Event-IDs pro Connector und ignoriert Providerzeit für Attention", async () => {
    const first = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: { ...event, occurredAt: "2040-01-01T00:00:00.000Z" } });
    const second = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: { ...event, connectorId: "whatsapp-demo", externalThreadId: "wa-thread" } });
    expect(first.statusCode).toBe(202);
    expect(second.statusCode).toBe(202);
    const rows = await db.query<{ updated_at: string }>("SELECT updated_at FROM conversations ORDER BY updated_at");
    expect(rows.rows).toHaveLength(2);
    expect(new Date(rows.rows[0]!.updated_at).getUTCFullYear()).toBeLessThan(2040);
  });

  it("authentifiziert Connectoren über Routing-Key, Rohbody-Signatur und Zeitfenster", async () => {
    const payload = JSON.stringify({ ...event, providerEventId: "signed-provider-001", externalThreadId: "signed-thread", connectorId: undefined });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", "test-secret").update(`${timestamp}.`).update(Buffer.from(payload)).digest("hex")}`;
    const accepted = await app.inject({ method: "POST", url: "/api/internal/v1/channel-ingress/cn_demo_7f3d9a2c/events", headers: { "content-type": "application/json", "x-relay-timestamp": timestamp, "x-relay-signature": signature }, payload });
    expect(accepted.statusCode).toBe(202);
    const saved = await db.query<{ connector_id: string }>("SELECT connector_id FROM conversations WHERE id=$1", [accepted.json().caseId]);
    expect(saved.rows[0]?.connector_id).toBe("demo-adapter");

    const rejected = await app.inject({ method: "POST", url: "/api/internal/v1/channel-ingress/cn_demo_7f3d9a2c/events", headers: { "content-type": "application/json", "x-relay-timestamp": timestamp, "x-relay-signature": `sha256=${"0".repeat(64)}` }, payload: JSON.stringify({ ...event, providerEventId: "signed-provider-002" }) });
    expect(rejected.statusCode).toBe(401);
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const oldSignature = `sha256=${createHmac("sha256", "test-secret").update(`${oldTimestamp}.`).update(Buffer.from(payload)).digest("hex")}`;
    const expired = await app.inject({ method: "POST", url: "/api/internal/v1/channel-ingress/cn_demo_7f3d9a2c/events", headers: { "content-type": "application/json", "x-relay-timestamp": oldTimestamp, "x-relay-signature": oldSignature }, payload });
    expect(expired.statusCode).toBe(401);
    expect(expired.json().code).toBe("CONNECTOR_TIMESTAMP_INVALID");
    const authIssues = await db.query<{ reason_code: string }>("SELECT reason_code FROM integration_issues");
    expect(authIssues.rows).toHaveLength(0);
    const invalidPayload = JSON.stringify({ providerEventId: "invalid-shape-001" });
    const invalidShapeSignature = `sha256=${createHmac("sha256", "test-secret").update(`${timestamp}.`).update(Buffer.from(invalidPayload)).digest("hex")}`;
    const invalidShape = await app.inject({ method: "POST", url: "/api/internal/v1/channel-ingress/cn_demo_7f3d9a2c/events", headers: { "content-type": "application/json", "x-relay-timestamp": timestamp, "x-relay-signature": invalidShapeSignature }, payload: invalidPayload });
    expect(invalidShape.statusCode).toBe(400);
    const validationIssues = await db.query<{ reason_code: string }>("SELECT reason_code FROM integration_issues");
    expect(validationIssues.rows).toEqual([{ reason_code: "CONNECTOR_VALIDATION_ERROR" }]);
  });

  it("führt Ownership, Commitment, Abschluss und Reopen mit Versionsschutz aus", async () => {
    const ingested = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    const caseId = ingested.json().caseId;
    let detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    const assigned = await app.inject({ method: "PUT", url: `/api/v1/cases/${caseId}/owner`, headers: { ...editor, "if-match": String(detail.version) }, payload: { ownerId: ids.editor } });
    expect(assigned.statusCode).toBe(200);
    const stale = await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/status`, headers: { ...editor, "if-match": String(detail.version) }, payload: { status: "resolved" } });
    expect(stale.statusCode).toBe(409);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    const created = await app.inject({ method: "POST", url: `/api/v1/cases/${caseId}/commitments`, headers: { ...editor, "if-match": String(detail.version) }, payload: { description: "Rückruf bestätigen", assigneeId: ids.editor, dueAt: "2026-07-21T12:00:00.000Z" } });
    expect(created.statusCode).toBe(201);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    const blocked = await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/status`, headers: { ...editor, "if-match": String(detail.version) }, payload: { status: "resolved" } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe("OPEN_COMMITMENTS");
    const fulfilled = await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/commitments/${created.json().id}`, headers: { ...editor, "if-match": String(detail.version) }, payload: { status: "fulfilled" } });
    expect(fulfilled.statusCode).toBe(200);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    expect((await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/status`, headers: { ...editor, "if-match": String(detail.version) }, payload: { status: "resolved" } })).statusCode).toBe(200);
    const reopened = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: { ...event, providerEventId: "provider-event-002", body: "Es gibt eine neue Rückfrage." } });
    expect(reopened.statusCode).toBe(202);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    expect(detail.status).toBe("open");
    expect(detail.interactions).toHaveLength(2);
    expect(detail.events.some((x: { event_type: string }) => x.event_type === "conversation.reopened")).toBe(true);
  });

  it("liefert niemals einen Case eines anderen Tenants", async () => {
    const foreignTenant = "00000000-0000-4000-8000-000000000999";
    const foreignCase = "00000000-0000-4000-8000-000000000998";
    await db.query("INSERT INTO tenants (id,name) VALUES ($1,'Fremder Tenant')", [foreignTenant]);
    await db.query("INSERT INTO conversations (id,tenant_id,external_thread_id,connector_id,subject,party_name) VALUES ($1,$2,'foreign-thread','foreign','Geheim','Andere Firma')", [foreignCase, foreignTenant]);
    const response = await app.inject({ method: "GET", url: `/api/v1/cases/${foreignCase}`, headers: editor });
    expect(response.statusCode).toBe(404);
  });

  it("schreibt State, Domain Event, Audit und Outbox atomar und publiziert at-least-once", async () => {
    const ingested = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    const caseId = ingested.json().caseId;
    const counts = await db.query<{ domain_count: number; audit_count: number; outbox_count: number }>(`SELECT
      (SELECT count(*)::int FROM domain_events WHERE aggregate_id=$1) AS domain_count,
      (SELECT count(*)::int FROM audit_entries WHERE subject_id=$1) AS audit_count,
      (SELECT count(*)::int FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.aggregate_id=$1) AS outbox_count`, [caseId]);
    expect(counts.rows[0]).toMatchObject({ domain_count: 2, audit_count: 2, outbox_count: 2 });
    const published: string[] = [];
    const worker = new OutboxWorker(db, { async publish(record) { published.push(record.id); } });
    expect(await worker.processOnce(ids.tenant, "test-worker")).toMatchObject({ claimed: 2, published: 2 });
    expect(published).toHaveLength(2);
    expect(await worker.processOnce(ids.tenant, "test-worker")).toMatchObject({ claimed: 0, published: 0 });
  });

  it("zeigt nur berechtigten Operatoren Integrationsfehler und auditiert den Outbox-Wiederanlauf", async () => {
    await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    const worker = new OutboxWorker(db, { async publish() { throw Object.assign(new Error("broker offline"), { name: "BROKER_UNAVAILABLE" }); } });
    await worker.processOnce(ids.tenant, "failing-worker", 1);
    expect((await app.inject({ method: "GET", url: "/api/v1/integration-issues", headers: teammate })).statusCode).toBe(403);
    const response = await app.inject({ method: "GET", url: "/api/v1/integration-issues", headers: editor });
    expect(response.statusCode).toBe(200);
    const issue = response.json().find((row: { kind: string }) => row.kind === "outbox");
    expect(issue).toMatchObject({ state: "retrying", retry_eligible: true, attempts: 1 });
    const redrive = await app.inject({ method: "POST", url: `/api/v1/integration-issues/outbox/${issue.id}/redrive`, headers: editor });
    expect(redrive.statusCode).toBe(202);
    const audit = await db.query<{ action: string }>("SELECT action FROM audit_entries WHERE subject_id=$1", [issue.id]);
    expect(audit.rows).toEqual([{ action: "outbox.redrive_requested" }]);
  });

  it("übergibt Verantwortung erst nach expliziter Annahme durch den Empfänger", async () => {
    const ingested = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: event });
    const caseId = ingested.json().caseId;
    let detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    await app.inject({ method: "PUT", url: `/api/v1/cases/${caseId}/owner`, headers: { ...editor, "if-match": String(detail.version) }, payload: { ownerId: ids.editor } });
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    const requested = await app.inject({ method: "POST", url: `/api/v1/cases/${caseId}/handoffs`, headers: { ...editor, "if-match": String(detail.version) }, payload: { toActorId: ids.teammate, reason: "Elektrotechnik erforderlich", nextStep: "Fehlerprotokoll prüfen" } });
    expect(requested.statusCode).toBe(201);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    expect(detail.owner_actor_id).toBe(ids.editor);
    expect(detail.handoffs[0].status).toBe("pending");
    const wrongActor = await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/handoffs/${requested.json().id}`, headers: { ...editor, "if-match": String(detail.version) }, payload: { decision: "accepted" } });
    expect(wrongActor.statusCode).toBe(403);
    const accepted = await app.inject({ method: "PATCH", url: `/api/v1/cases/${caseId}/handoffs/${requested.json().id}`, headers: { ...teammate, "if-match": String(detail.version) }, payload: { decision: "accepted" } });
    expect(accepted.statusCode).toBe(200);
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    expect(detail.owner_actor_id).toBe(ids.teammate);
    expect(detail.handoffs[0].status).toBe("accepted");
  });

  it("dupliziert keine Kommunikations- oder Übergabefreitexte in Events, Outbox oder Audit", async () => {
    const ingested = await app.inject({ method: "POST", url: "/api/v1/ingress/events", headers: editor, payload: { ...event, body: "PII-BODY-MARKER" } });
    const caseId = ingested.json().caseId;
    let detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    await app.inject({ method: "POST", url: `/api/v1/cases/${caseId}/commitments`, headers: { ...editor, "if-match": String(detail.version) }, payload: { description: "PII-COMMITMENT-MARKER", assigneeId: ids.editor } });
    detail = (await app.inject({ method: "GET", url: `/api/v1/cases/${caseId}`, headers: editor })).json();
    await app.inject({ method: "POST", url: `/api/v1/cases/${caseId}/handoffs`, headers: { ...editor, "if-match": String(detail.version) }, payload: { toActorId: ids.teammate, reason: "PII-REASON-MARKER", nextStep: "PII-NEXT-MARKER" } });
    const copies = await db.query<{ content: string }>(`SELECT data::text AS content FROM domain_events WHERE aggregate_id=$1
      UNION ALL SELECT payload::text FROM outbox_events o JOIN domain_events e ON e.id=o.domain_event_id WHERE e.aggregate_id=$1
      UNION ALL SELECT data::text FROM timeline_events WHERE conversation_id=$1
      UNION ALL SELECT metadata::text FROM audit_entries WHERE subject_id=$1`, [caseId]);
    const serialized = copies.rows.map(row => row.content).join("\n");
    expect(serialized).not.toContain("PII-BODY-MARKER");
    expect(serialized).not.toContain("PII-COMMITMENT-MARKER");
    expect(serialized).not.toContain("PII-REASON-MARKER");
    expect(serialized).not.toContain("PII-NEXT-MARKER");
  });

  it("liefert einen ausführbaren OpenAPI-Vertrag", async () => {
    const response = await app.inject({ method: "GET", url: "/api/openapi.json" });
    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBe("3.1.0");
    expect(response.json().paths["/api/v1/cases/{id}/handoffs"]).toBeDefined();
  });

  it("trennt Liveness, Readiness und öffentliche Auth-Konfiguration", async () => {
    expect((await app.inject({ method: "GET", url: "/health/live" })).json()).toEqual({ status: "live" });
    expect((await app.inject({ method: "GET", url: "/health/ready" })).json()).toEqual({ status: "ready" });
    expect((await app.inject({ method: "GET", url: "/api/auth/config" })).json()).toMatchObject({ mode: "demo", testIngressEnabled: true });
  });

  it("begrenzt missbräuchlichen Connector-Traffic ohne Issue-Flut", async () => {
    let last;
    for (let index = 0; index < 61; index += 1) {
      last = await app.inject({ method: "POST", url: "/api/internal/v1/channel-ingress/cn_demo_7f3d9a2c/events", headers: { "content-type": "application/json", "x-relay-timestamp": String(Math.floor(Date.now() / 1000)), "x-relay-signature": `sha256=${"0".repeat(64)}` }, payload: JSON.stringify({ providerEventId: `abuse-${index}` }) });
    }
    expect(last?.statusCode).toBe(429);
    expect((await db.query("SELECT id FROM integration_issues")).rows).toHaveLength(0);
  });

  it("speichert einen tenantgebundenen Pilotauftrag ohne Secrets und mit Audit", async () => {
    expect((await app.inject({ method: "GET", url: "/api/v1/pilot-onboarding", headers: teammate })).statusCode).toBe(403);
    const invalid = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: { ...pilotSetup, clientSecret: "should-never-be-accepted" } });
    expect(invalid.statusCode).toBe(400);
    const socialSelection = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: { ...pilotSetup, selectedChannelAccountId: pilotSetup.channelAccounts[4]!.id } });
    expect(socialSelection.statusCode).toBe(400);
    const duplicate = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: {
      ...pilotSetup, channelAccounts: [...pilotSetup.channelAccounts, { ...pilotSetup.channelAccounts[0], id: "10000000-0000-4000-8000-000000000099", identifier: "SUPPORT@BLAZED.EXAMPLE" }]
    } });
    expect(duplicate.statusCode).toBe(400);
    const unnamedProvider = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: {
      ...pilotSetup,
      channelAccounts: pilotSetup.channelAccounts.map(account => account.id === "10000000-0000-4000-8000-000000000004"
        ? { ...account, providerName: undefined }
        : account)
    } });
    expect(unnamedProvider.statusCode).toBe(400);
    const created = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: pilotSetup });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ state: "relay_review_required", setup: {
      organizationName: "R&C Lifestyle", brandName: "Blazed Outfitters", selectedChannelAccountId: pilotSetup.selectedChannelAccountId,
      channelAccounts: expect.arrayContaining([
        expect.objectContaining({ identifier: "support@blazed.example", type: "email" }),
        expect.objectContaining({ identifier: "info@blazed.example", provider: "other", providerName: "ALL-INKL" })
      ]), version: 1
    } });
    expect(created.json().setup.channelAccounts).toHaveLength(8);
    expect(JSON.stringify(created.json())).not.toContain("clientSecret");
    const loaded = await app.inject({ method: "GET", url: "/api/v1/pilot-onboarding", headers: editor });
    expect(loaded.json()).toMatchObject({ setup: { teamNames: ["Serviceannahme", "Außendienst"], inventoryConfirmed: true }, relayGates: expect.arrayContaining(["managed_postgres_rls", "shadow_run_100"]) });
    const storedAccounts = await db.query<{ channel_type: string; activation_status: string }>("SELECT channel_type,activation_status FROM pilot_channel_accounts ORDER BY channel_type");
    expect(storedAccounts.rows.filter(account => account.channel_type === "email")).toHaveLength(4);
    expect(storedAccounts.rows.filter(account => account.channel_type === "instagram")).toHaveLength(3);
    expect(storedAccounts.rows.filter(account => account.channel_type === "tiktok")).toHaveLength(1);
    expect(storedAccounts.rows.filter(account => account.channel_type !== "email").every(account => account.activation_status === "blocked")).toBe(true);
    const stale = await app.inject({ method: "PUT", url: "/api/v1/pilot-onboarding", headers: { ...editor, "if-match": "0" }, payload: pilotSetup });
    expect(stale.statusCode).toBe(409);
    const audit = await db.query<{ action: string; metadata: Record<string,unknown> }>("SELECT action,metadata FROM audit_entries WHERE category='pilot_configuration'");
    expect(audit.rows).toEqual([{ action: "pilot_setup.submitted", metadata: {} }]);
  });
});
