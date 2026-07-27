import crypto from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const run = adminUrl ? describe : describe.skip;
const { Client } = pg;
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const loginRole = `relay_test_${suffix}`;
const password = `test-${crypto.randomUUID()}`;
const tenantA = crypto.randomUUID(); const tenantB = crypto.randomUUID();
const caseA = crypto.randomUUID(); const caseB = crypto.randomUUID();
let runtime: pg.Client;

run("PostgreSQL tenant isolation", () => {
  beforeAll(async () => {
    const admin = new Client({ connectionString: adminUrl }); await admin.connect();
    const roleSql = (await admin.query("SELECT format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE relay_api', $1::text, $2::text) AS sql", [loginRole, password])).rows[0].sql;
    await admin.query(roleSql);
    await admin.query("INSERT INTO tenants(id,name) VALUES($1,'Tenant A'),($2,'Tenant B')", [tenantA, tenantB]);
    await admin.query(`INSERT INTO conversations(id,tenant_id,external_thread_id,connector_id,subject,party_name)
      VALUES($1,$2,'a','test','A','A'),($3,$4,'b','test','B','B')`, [caseA, tenantA, caseB, tenantB]);
    await admin.end();
    const url = new URL(adminUrl!); url.username = loginRole; url.password = password;
    runtime = new Client({ connectionString: url.toString() }); await runtime.connect();
  });

  afterAll(async () => {
    if (runtime) await runtime.end();
    const admin = new Client({ connectionString: adminUrl }); await admin.connect();
    await admin.query("DELETE FROM conversations WHERE tenant_id IN ($1,$2)", [tenantA, tenantB]);
    await admin.query("DELETE FROM tenants WHERE id IN ($1,$2)", [tenantA, tenantB]);
    const dropSql = (await admin.query("SELECT format('DROP ROLE %I', $1::text) AS sql", [loginRole])).rows[0].sql; await admin.query(dropSql); await admin.end();
  });

  it("liefert ohne Tenant-Kontext keine Zeile", async () => {
    expect((await runtime.query("SELECT id FROM conversations")).rows).toHaveLength(0);
  });

  it("isoliert bekannte Fremd-UUIDs bei Read und Write", async () => {
    await runtime.query("BEGIN"); await runtime.query("SELECT set_config('app.tenant_id',$1,true)", [tenantA]);
    expect((await runtime.query("SELECT id FROM conversations ORDER BY id")).rows).toEqual([{ id: caseA }]);
    expect((await runtime.query("UPDATE conversations SET subject='breach' WHERE id=$1 RETURNING id", [caseB])).rows).toHaveLength(0);
    await runtime.query("ROLLBACK");
  });

  it("verhindert Cross-Tenant-Insert durch WITH CHECK", async () => {
    await runtime.query("BEGIN"); await runtime.query("SELECT set_config('app.tenant_id',$1,true)", [tenantA]);
    await expect(runtime.query(`INSERT INTO conversations(id,tenant_id,external_thread_id,connector_id,subject,party_name)
      VALUES($1,$2,'cross','test','Cross','Cross')`, [crypto.randomUUID(), tenantB])).rejects.toThrow();
    await runtime.query("ROLLBACK");
  });

  it("Runtime-Rolle ist weder Owner noch BYPASSRLS", async () => {
    const result = await runtime.query("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user");
    expect(result.rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const privileges = await runtime.query(`SELECT
      has_table_privilege(current_user,'audit_entries','DELETE') AS audit_delete,
      has_table_privilege(current_user,'domain_events','DELETE') AS event_delete,
      has_table_privilege(current_user,'outbox_events','UPDATE') AS outbox_update`);
    expect(privileges.rows[0]).toEqual({ audit_delete: false, event_delete: false, outbox_update: true });
  });

  it("erzwingt RLS auf allen tenantgebundenen Fachtabellen", async () => {
    const expected = ["actor_capabilities","actor_identities","actors","audit_entries","commitments","conversations","domain_events","handoffs","ingress_receipts","integration_issues","interactions","outbox_events","pilot_channel_accounts","pilot_onboarding_requests","timeline_events"];
    const rows = await runtime.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relrowsecurity AND c.relforcerowsecurity ORDER BY c.relname`, [expected]);
    expect(rows.rows.map(row => row.relname)).toEqual(expected);
  });
});
