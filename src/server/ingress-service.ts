import crypto from "node:crypto";
import type { z } from "zod";
import type { Database } from "./db.js";
import { ingressSchema } from "./domain.js";
import { recordDomainChange } from "./eventing.js";

type CanonicalIngress = z.infer<typeof ingressSchema>;
type Row = Record<string, unknown>;
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function conflict(code: string, message: string) {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

export async function processCanonicalIngress(input: {
  db: Database;
  tenantId: string;
  actorId: string | null;
  requestId: string;
  event: CanonicalIngress;
}) {
  const { db, tenantId, actorId, requestId, event } = input;
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex");
  const caseId = uuid(); const interactionId = uuid(); const receiptId = uuid();
  const occurredAt = event.occurredAt ?? now(); const recordedAt = now();
  return db.withTenant(tenantId, async tx => {
    const claimed = (await tx.query<Row>(`INSERT INTO ingress_receipts
      (id,tenant_id,connector_id,provider_event_id,payload_hash) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (tenant_id,connector_id,provider_event_id) DO NOTHING RETURNING id`,
      [receiptId, tenantId, event.connectorId, event.providerEventId, payloadHash])).rows[0];
    if (!claimed) {
      const existing = (await tx.query<Row>("SELECT payload_hash,conversation_id,interaction_id FROM ingress_receipts WHERE tenant_id=$1 AND connector_id=$2 AND provider_event_id=$3", [tenantId, event.connectorId, event.providerEventId])).rows[0];
      if (existing?.payload_hash !== payloadHash) throw conflict("IDEMPOTENCY_CONFLICT", "Diese Provider-Event-ID wurde bereits mit anderem Inhalt verwendet.");
      return { duplicate: true, caseId: existing?.conversation_id, interactionId: existing?.interaction_id };
    }
    const current = (await tx.query<Row>("SELECT * FROM conversations WHERE tenant_id=$1 AND connector_id=$2 AND external_thread_id=$3", [tenantId, event.connectorId, event.externalThreadId])).rows[0];
    const actualCaseId = String(current?.id ?? caseId);
    const reopened = Boolean(current && (current.status === "resolved" || current.status === "closed") && event.direction === "inbound");
    let version = Number(current?.version ?? 0);
    if (!current) {
      version = 1;
      await tx.query("INSERT INTO conversations (id,tenant_id,external_thread_id,connector_id,subject,party_name,status,version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,'open',1,$7,$7)", [actualCaseId, tenantId, event.externalThreadId, event.connectorId, event.subject ?? event.body.slice(0, 80), event.partyName, recordedAt]);
      await recordDomainChange(tx, { tenantId, conversationId: actualCaseId, version, eventIndex: 0, eventType: "conversation.opened", actorId, requestId, data: { source: event.connectorId }, occurredAt });
    } else {
      version += 1;
      await tx.query("UPDATE conversations SET version=$1,updated_at=$2,status=CASE WHEN $3 THEN 'open' ELSE status END WHERE tenant_id=$4 AND id=$5", [version, recordedAt, reopened, tenantId, actualCaseId]);
      if (reopened) await recordDomainChange(tx, { tenantId, conversationId: actualCaseId, version, eventIndex: 0, eventType: "conversation.reopened", actorId, requestId, data: { reason: "new_inbound_interaction" }, occurredAt });
    }
    await tx.query("INSERT INTO interactions (id,tenant_id,conversation_id,connector_id,channel,direction,body,party_name,provider_event_id,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [interactionId, tenantId, actualCaseId, event.connectorId, event.channel, event.direction, event.body, event.partyName, event.providerEventId, occurredAt]);
    await recordDomainChange(tx, { tenantId, conversationId: actualCaseId, version, eventIndex: reopened || !current ? 1 : 0, eventType: "interaction.recorded", actorId: null, requestId, data: { interactionId, channel: event.channel, direction: event.direction }, occurredAt });
    await tx.query("UPDATE ingress_receipts SET conversation_id=$1,interaction_id=$2 WHERE id=$3", [actualCaseId, interactionId, receiptId]);
    return { duplicate: false, caseId: actualCaseId, interactionId };
  });
}
