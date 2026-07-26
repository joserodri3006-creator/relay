import fs from "node:fs/promises";
import crypto from "node:crypto";
import { loadConfig } from "./config.js";
import { createDatabase, type Database } from "./db.js";
import { OutboxWorker } from "./outbox.js";
import { createPostgresDatabase } from "./postgres.js";

const config = loadConfig(process.env, "worker");
if (!config.TENANT_ID) throw new Error("TENANT_ID ist für den Outbox-Worker erforderlich.");
let db: Database;
if (config.DATABASE_URL) db = createPostgresDatabase(config.DATABASE_URL, { max: config.PG_POOL_MAX, statementTimeoutMs: config.PG_STATEMENT_TIMEOUT_MS });
else { await fs.mkdir(".data", { recursive: true }); db = await createDatabase(config.DATABASE_PATH); }

const worker = new OutboxWorker(db, { async publish(record) {
  console.log(JSON.stringify({ type: "outbox.published", id: record.id, topic: record.topic, partitionKey: record.partitionKey }));
} });
const workerId = config.WORKER_ID ?? `worker-${crypto.randomUUID()}`;
let stopping = false; let active: ReturnType<OutboxWorker["processOnce"]> | null = null;
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function loop() {
  while (!stopping) {
    active = worker.processOnce(config.TENANT_ID!, workerId);
    try {
      const result = await active;
      if (result.published > 0) console.log(JSON.stringify({ type: "outbox.batch", ...result }));
    } catch (error) {
      console.error(JSON.stringify({ type: "outbox.batch_failed", name: error instanceof Error ? error.name : "Error" }));
    } finally { active = null; }
    if (!stopping) await delay(1000);
  }
}
void loop();

const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(JSON.stringify({ type: "worker.shutdown", signal }));
  const deadline = setTimeout(() => process.exit(1), 20000); deadline.unref();
  if (active) await active.catch(() => undefined);
  await db.close(); clearTimeout(deadline); process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
