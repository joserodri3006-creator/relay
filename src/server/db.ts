import { PGlite } from "@electric-sql/pglite";

export type QueryResult<T extends Record<string, unknown>> = { rows: T[] };
export interface Queryable {
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface Database extends Queryable {
  transaction<T>(callback: (tx: Queryable) => Promise<T>): Promise<T>;
  withTenant<T>(tenantId: string, callback: (tx: Queryable) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<unknown>;
  lookupConnector(routingKey: string): Promise<Record<string, unknown> | null>;
  close(): Promise<void>;
}

export const ids = {
  tenant: "00000000-0000-4000-8000-000000000001",
  editor: "00000000-0000-4000-8000-000000000101",
  teammate: "00000000-0000-4000-8000-000000000102",
  viewer: "00000000-0000-4000-8000-000000000103",
  connector: "00000000-0000-4000-8000-000000000201"
};

export async function createDatabase(path = "memory://") {
  const db = new PGlite(path);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS actors (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), display_name text NOT NULL,
      role text NOT NULL CHECK (role IN ('editor','viewer')), created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS connectors (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), routing_key text NOT NULL UNIQUE,
      connector_key text NOT NULL, display_name text NOT NULL, status text NOT NULL CHECK (status IN ('active','disabled')),
      secret_ref text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, connector_key), UNIQUE (tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS actor_identities (
      tenant_id uuid NOT NULL, actor_id uuid NOT NULL, issuer text NOT NULL, subject text NOT NULL,
      status text NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id,issuer,subject), FOREIGN KEY (tenant_id,actor_id) REFERENCES actors(tenant_id,id), UNIQUE (issuer,subject)
    );
    CREATE TABLE IF NOT EXISTS actor_capabilities (
      tenant_id uuid NOT NULL, actor_id uuid NOT NULL, capability text NOT NULL CHECK (capability IN ('case:write','integration:operate','pilot:configure')),
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id,actor_id,capability),
      FOREIGN KEY (tenant_id,actor_id) REFERENCES actors(tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), external_thread_id text NOT NULL,
      connector_id text NOT NULL, subject text NOT NULL, party_name text NOT NULL,
      status text NOT NULL CHECK (status IN ('open','waiting_external','waiting_internal','resolved','closed')) DEFAULT 'open',
      owner_actor_id uuid NULL REFERENCES actors(id), version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, connector_id, external_thread_id), UNIQUE (tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS interactions (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL,
      connector_id text NOT NULL, channel text NOT NULL, direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
      body text NOT NULL, party_name text NOT NULL, provider_event_id text NOT NULL,
      occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id),
      UNIQUE (tenant_id, connector_id, provider_event_id)
    );
    CREATE TABLE IF NOT EXISTS commitments (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL,
      description text NOT NULL, status text NOT NULL CHECK (status IN ('open','fulfilled','cancelled')) DEFAULT 'open',
      assignee_actor_id uuid NOT NULL REFERENCES actors(id), due_at timestamptz NULL,
      source_interaction_id uuid NULL REFERENCES interactions(id), created_by_actor_id uuid NOT NULL REFERENCES actors(id),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS handoffs (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL,
      from_actor_id uuid NOT NULL REFERENCES actors(id), to_actor_id uuid NOT NULL REFERENCES actors(id),
      reason text NOT NULL, next_step text NOT NULL, due_at timestamptz NULL,
      status text NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')) DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz NULL, responded_by_actor_id uuid NULL REFERENCES actors(id),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id),
      CHECK (from_actor_id <> to_actor_id)
    );
    CREATE TABLE IF NOT EXISTS timeline_events (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL,
      event_type text NOT NULL, actor_id uuid NULL, aggregate_version integer NOT NULL,
      data jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations(tenant_id, id)
    );
    CREATE TABLE IF NOT EXISTS domain_events (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL, aggregate_version integer NOT NULL, event_index integer NOT NULL DEFAULT 0,
      event_type text NOT NULL, schema_version integer NOT NULL DEFAULT 1, actor_id uuid NULL,
      correlation_id text NOT NULL, causation_id uuid NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
      recorded_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (tenant_id, aggregate_id, aggregate_version, event_index)
    );
    CREATE TABLE IF NOT EXISTS audit_entries (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, category text NOT NULL, action text NOT NULL,
      actor_id uuid NULL, subject_type text NOT NULL, subject_id uuid NOT NULL,
      result text NOT NULL CHECK (result IN ('success','denied','failure')),
      request_id text NOT NULL, reason_code text NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS outbox_events (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, domain_event_id uuid NOT NULL REFERENCES domain_events(id),
      topic text NOT NULL, partition_key text NOT NULL, payload jsonb NOT NULL,
      attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz NULL, last_error_code text NULL, locked_by text NULL, lease_until timestamptz NULL,
      dead_lettered_at timestamptz NULL, redrive_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (domain_event_id)
    );
    CREATE TABLE IF NOT EXISTS integration_issues (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, connector_id uuid NULL,
      issue_type text NOT NULL CHECK (issue_type IN ('ingress_auth','ingress_validation','ingress_processing')),
      reason_code text NOT NULL, status text NOT NULL CHECK (status IN ('open','resolved')) DEFAULT 'open',
      retry_eligible boolean NOT NULL DEFAULT false, source_ref text NULL, diagnostic jsonb NOT NULL DEFAULT '{}'::jsonb,
      occurred_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz NULL,
      FOREIGN KEY (tenant_id,connector_id) REFERENCES connectors(tenant_id,id)
    );
    CREATE TABLE IF NOT EXISTS pilot_onboarding_requests (
      tenant_id uuid PRIMARY KEY REFERENCES tenants(id), organization_name text NOT NULL, workflow_name text NOT NULL,
      primary_channel text NOT NULL, identity_provider text NOT NULL, system_of_record text NOT NULL, hosting_region text NOT NULL,
      target_start_date date NOT NULL, team_names jsonb NOT NULL, expected_users integer NOT NULL, monthly_cases integer NOT NULL,
      retention_days integer NOT NULL, pilot_owner_name text NOT NULL, pilot_owner_email text NOT NULL,
      technical_contact_name text NOT NULL, technical_contact_email text NOT NULL, access_environment text NOT NULL,
      data_exclusions_confirmed boolean NOT NULL,
      version integer NOT NULL DEFAULT 1, created_by_actor_id uuid NOT NULL, updated_by_actor_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ingress_receipts (
      id uuid PRIMARY KEY, tenant_id uuid NOT NULL, connector_id text NOT NULL, provider_event_id text NOT NULL,
      payload_hash text NOT NULL, conversation_id uuid NULL, interaction_id uuid NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id, connector_id, provider_event_id)
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_attention ON conversations(tenant_id, status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_timeline_case ON timeline_events(tenant_id, conversation_id, occurred_at, id);
    CREATE INDEX IF NOT EXISTS idx_commitments_case ON commitments(tenant_id, conversation_id, status, due_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_handoff_one_pending ON handoffs(tenant_id, conversation_id) WHERE status='pending';
    CREATE INDEX IF NOT EXISTS idx_domain_events_case ON domain_events(tenant_id, aggregate_id, aggregate_version, event_index);
    CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_entries(tenant_id, subject_type, subject_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(published_at, available_at) WHERE published_at IS NULL;
  `);
  await db.exec(`
    ALTER TABLE ingress_receipts ADD COLUMN IF NOT EXISTS connector_id text NOT NULL DEFAULT 'legacy';
    ALTER TABLE interactions ADD COLUMN IF NOT EXISTS connector_id text NOT NULL DEFAULT 'legacy';
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_by text NULL;
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lease_until timestamptz NULL;
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz NULL;
    ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS redrive_count integer NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ingress_connector_event ON ingress_receipts(tenant_id,connector_id,provider_event_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_connector_event ON interactions(tenant_id,connector_id,provider_event_id);
  `);
  await db.query("INSERT INTO tenants (id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING", [ids.tenant, "Relay Demo GmbH"]);
  for (const actor of [
    [ids.editor, "Mara Klein", "editor"],
    [ids.teammate, "David Nguyen", "editor"],
    [ids.viewer, "Lea Hoffmann", "viewer"]
  ]) {
    await db.query("INSERT INTO actors (id,tenant_id,display_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [actor[0], ids.tenant, actor[1], actor[2]]);
  }
  await db.query("INSERT INTO connectors (id,tenant_id,routing_key,connector_key,display_name,status,secret_ref) VALUES ($1,$2,$3,$4,$5,'active',$6) ON CONFLICT DO NOTHING", [ids.connector, ids.tenant, "cn_demo_7f3d9a2c", "demo-adapter", "Demo Fixture Connector", "connector/demo"]);
  const database = db as unknown as Database;
  database.withTenant = async <T>(_tenantId: string, callback: (tx: Queryable) => Promise<T>) => db.transaction(callback as never) as Promise<T>;
  database.lookupConnector = async (routingKey: string) => (await db.query<Record<string, unknown>>("SELECT id,tenant_id,connector_key,secret_ref,status FROM connectors WHERE routing_key=$1", [routingKey])).rows[0] ?? null;
  return database;
}

export async function closeDatabase(db: Database) { await db.close(); }
