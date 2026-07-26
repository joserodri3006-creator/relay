import pg from "pg";
import type { Database, Queryable, QueryResult } from "./db.js";

const { Pool } = pg;

export function createPostgresDatabase(connectionString: string, options: { max?: number; statementTimeoutMs?: number } = {}): Database {
  const pool = new Pool({ connectionString, max: options.max ?? 10, statement_timeout: options.statementTimeoutMs ?? 15000, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, application_name: "relay-runtime" });
  pool.on("error", error => console.error(JSON.stringify({ type: "database.pool_error", name: error.name })));
  const query = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => {
    const result = await pool.query(sql, params);
    return { rows: result.rows as T[] } satisfies QueryResult<T>;
  };
  const transaction = async <T>(callback: (tx: Queryable) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const value = await callback({ query: async <R extends Record<string, unknown>>(sql: string, params: unknown[] = []) => ({ rows: (await client.query(sql, params)).rows as R[] }) });
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  };
  return {
    query,
    transaction,
    async withTenant<T>(tenantId: string, callback: (tx: Queryable) => Promise<T>) {
      return transaction(async tx => {
        await tx.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
        return callback(tx);
      });
    },
    async exec(sql: string) { await pool.query(sql); },
    async lookupConnector(routingKey: string) {
      return (await pool.query("SELECT * FROM lookup_connector($1)", [routingKey])).rows[0] ?? null;
    },
    async close() { await pool.end(); }
  };
}
