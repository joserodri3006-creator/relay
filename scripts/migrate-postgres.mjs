import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL ist für PostgreSQL-Migrationen erforderlich.");
const directory = path.resolve(process.cwd(), "migrations");
const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
const prefixes = files.map(name => name.match(/^(\d+)/)?.[1]);
if (new Set(prefixes).size !== prefixes.length) throw new Error("Migrationspräfixe müssen eindeutig sein.");
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('relay-schema-migrations')) AS locked")).rows[0]?.locked;
  if (!locked) throw new Error("Eine andere Relay-Migration läuft bereits.");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  for (const version of files) {
    const sql = await readFile(path.join(directory, version), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = (await client.query("SELECT checksum FROM schema_migrations WHERE version=$1", [version])).rows[0];
    if (existing) {
      if (existing.checksum !== checksum) throw new Error(`Migration ${version} wurde nachträglich verändert.`);
      console.log(`= ${version}`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", [version, checksum]);
      await client.query("COMMIT");
      console.log(`+ ${version}`);
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('relay-schema-migrations'))").catch(() => undefined);
  await client.end();
}
