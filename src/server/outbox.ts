import type { Database } from "./db.js";
import crypto from "node:crypto";

type OutboxRecord = {
  id: string;
  tenant_id: string;
  domain_event_id: string;
  topic: string;
  partition_key: string;
  payload: Record<string, unknown>;
  attempts: number;
};

export interface EventPublisher {
  publish(record: { id: string; topic: string; partitionKey: string; payload: Record<string, unknown> }): Promise<void>;
}

export class OutboxWorker {
  constructor(private readonly db: Database, private readonly publisher: EventPublisher) {}

  async processOnce(tenantId: string, workerId: string, limit = 25) {
    const leaseOwner = `${workerId}:${crypto.randomUUID()}`;
    const rows = await this.db.withTenant(tenantId, async tx => (await tx.query<OutboxRecord>(`
      UPDATE outbox_events SET attempts=attempts+1,locked_by=$2,lease_until=now()+interval '30 seconds'
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE tenant_id=$1 AND published_at IS NULL AND dead_lettered_at IS NULL
          AND available_at <= now() AND attempts < 10 AND (lease_until IS NULL OR lease_until < now())
        ORDER BY available_at,id LIMIT $3 FOR UPDATE SKIP LOCKED
      )
      RETURNING id,tenant_id,domain_event_id,topic,partition_key,payload,attempts
    `, [tenantId, leaseOwner, limit])).rows);
    let published = 0;
    for (const row of rows) {
      try {
        await this.publisher.publish({ id: row.domain_event_id, topic: row.topic, partitionKey: row.partition_key, payload: row.payload });
        await this.db.withTenant(tenantId, tx => tx.query("UPDATE outbox_events SET published_at=now(),last_error_code=NULL,locked_by=NULL,lease_until=NULL WHERE tenant_id=$1 AND id=$2 AND published_at IS NULL AND locked_by=$3", [tenantId, row.id, leaseOwner]));
        published += 1;
      } catch (error) {
        const code = error instanceof Error ? error.name.slice(0, 80) : "PUBLISH_ERROR";
        await this.db.withTenant(tenantId, tx => tx.query(`UPDATE outbox_events SET last_error_code=$1,
          available_at=now() + (LEAST(300, power(2,attempts)) * interval '1 second'),
          dead_lettered_at=CASE WHEN attempts>=10 THEN now() ELSE NULL END,locked_by=NULL,lease_until=NULL
          WHERE tenant_id=$2 AND id=$3 AND published_at IS NULL AND locked_by=$4`, [code, tenantId, row.id, leaseOwner]));
      }
    }
    return { claimed: rows.length, published };
  }
}
