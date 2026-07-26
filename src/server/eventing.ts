import crypto from "node:crypto";
import type { Database } from "./db.js";

type Queryable = Pick<Database, "query">;

export type DomainChange = {
  tenantId: string;
  conversationId: string;
  version: number;
  eventIndex?: number;
  eventType: string;
  actorId: string | null;
  requestId: string;
  data: Record<string, unknown>;
  occurredAt?: string;
  causationId?: string | null;
  timeline?: boolean;
};

export function domainEventEnvelope(input: DomainChange, eventId: string, recordedAt: string) {
  return {
    id: eventId,
    type: input.eventType,
    schemaVersion: 1,
    tenantId: input.tenantId,
    aggregate: { type: "conversation", id: input.conversationId, version: input.version },
    occurredAt: input.occurredAt ?? recordedAt,
    recordedAt,
    actor: input.actorId ? { type: "user", id: input.actorId } : { type: "system", id: null },
    correlationId: input.requestId,
    causationId: input.causationId ?? null,
    data: input.data
  };
}

export async function recordDomainChange(db: Queryable, input: DomainChange) {
  const eventId = crypto.randomUUID();
  const recordedAt = new Date().toISOString();
  const envelope = domainEventEnvelope(input, eventId, recordedAt);
  const eventIndex = input.eventIndex ?? 0;
  await db.query(
    `INSERT INTO domain_events
      (id,tenant_id,aggregate_type,aggregate_id,aggregate_version,event_index,event_type,schema_version,actor_id,correlation_id,causation_id,data,recorded_at)
     VALUES ($1,$2,'conversation',$3,$4,$5,$6,1,$7,$8,$9,$10::jsonb,$11)`,
    [eventId, input.tenantId, input.conversationId, input.version, eventIndex, input.eventType, input.actorId, input.requestId, input.causationId ?? null, JSON.stringify(input.data), recordedAt]
  );
  await db.query(
    `INSERT INTO audit_entries
      (id,tenant_id,category,action,actor_id,subject_type,subject_id,result,request_id,metadata,occurred_at)
     VALUES ($1,$2,'domain_change',$3,$4,'conversation',$5,'success',$6,$7::jsonb,$8)`,
    [crypto.randomUUID(), input.tenantId, input.eventType, input.actorId, input.conversationId, input.requestId, JSON.stringify({ aggregateVersion: input.version, domainEventId: eventId }), recordedAt]
  );
  await db.query(
    `INSERT INTO outbox_events
      (id,tenant_id,domain_event_id,topic,partition_key,payload,created_at)
     VALUES ($1,$2,$3,'conversation.events.v1',$4,$5::jsonb,$6)`,
    [crypto.randomUUID(), input.tenantId, eventId, input.conversationId, JSON.stringify(envelope), recordedAt]
  );
  if (input.timeline !== false) {
    await db.query(
      `INSERT INTO timeline_events
        (id,tenant_id,conversation_id,event_type,actor_id,aggregate_version,data,occurred_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [crypto.randomUUID(), input.tenantId, input.conversationId, input.eventType, input.actorId, input.version, JSON.stringify(input.data), input.occurredAt ?? recordedAt]
    );
  }
  return envelope;
}
