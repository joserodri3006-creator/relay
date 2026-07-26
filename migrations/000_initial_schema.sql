CREATE TABLE tenants (
  id uuid PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE actors (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('editor','viewer')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id)
);
CREATE TABLE connectors (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), routing_key text NOT NULL UNIQUE,
  connector_key text NOT NULL, display_name text NOT NULL, status text NOT NULL CHECK (status IN ('active','disabled')),
  secret_ref text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,connector_key), UNIQUE (tenant_id,id)
);
CREATE TABLE conversations (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id), external_thread_id text NOT NULL,
  connector_id text NOT NULL, subject text NOT NULL, party_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','waiting_external','waiting_internal','resolved','closed')) DEFAULT 'open',
  owner_actor_id uuid NULL REFERENCES actors(id), version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,connector_id,external_thread_id), UNIQUE (tenant_id,id)
);
CREATE TABLE interactions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL, connector_id text NOT NULL,
  channel text NOT NULL, direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NOT NULL, party_name text NOT NULL, provider_event_id text NOT NULL,
  occurred_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id),
  UNIQUE (tenant_id,connector_id,provider_event_id)
);
CREATE TABLE commitments (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL, description text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','fulfilled','cancelled')) DEFAULT 'open',
  assignee_actor_id uuid NOT NULL REFERENCES actors(id), due_at timestamptz NULL,
  source_interaction_id uuid NULL REFERENCES interactions(id), created_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id)
);
CREATE TABLE handoffs (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL,
  from_actor_id uuid NOT NULL REFERENCES actors(id), to_actor_id uuid NOT NULL REFERENCES actors(id),
  reason text NOT NULL, next_step text NOT NULL, due_at timestamptz NULL,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')) DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz NULL,
  responded_by_actor_id uuid NULL REFERENCES actors(id),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id), CHECK (from_actor_id<>to_actor_id)
);
CREATE TABLE timeline_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, conversation_id uuid NOT NULL, event_type text NOT NULL,
  actor_id uuid NULL, aggregate_version integer NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,conversation_id) REFERENCES conversations(tenant_id,id)
);
CREATE TABLE domain_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL, event_index integer NOT NULL DEFAULT 0, event_type text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1, actor_id uuid NULL, correlation_id text NOT NULL,
  causation_id uuid NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,aggregate_id,aggregate_version,event_index), UNIQUE (tenant_id,id)
);
CREATE TABLE audit_entries (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, category text NOT NULL, action text NOT NULL, actor_id uuid NULL,
  subject_type text NOT NULL, subject_id uuid NOT NULL, result text NOT NULL CHECK (result IN ('success','denied','failure')),
  request_id text NOT NULL, reason_code text NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, domain_event_id uuid NOT NULL REFERENCES domain_events(id),
  topic text NOT NULL, partition_key text NOT NULL, payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz NULL, last_error_code text NULL,
  locked_by text NULL, lease_until timestamptz NULL, dead_lettered_at timestamptz NULL,
  redrive_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(domain_event_id)
);
CREATE TABLE integration_issues (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, connector_id uuid NULL,
  issue_type text NOT NULL CHECK (issue_type IN ('ingress_auth','ingress_validation','ingress_processing')),
  reason_code text NOT NULL, status text NOT NULL CHECK (status IN ('open','resolved')) DEFAULT 'open',
  retry_eligible boolean NOT NULL DEFAULT false, source_ref text NULL, diagnostic jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz NULL,
  FOREIGN KEY (tenant_id,connector_id) REFERENCES connectors(tenant_id,id)
);
CREATE TABLE ingress_receipts (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL, connector_id text NOT NULL, provider_event_id text NOT NULL,
  payload_hash text NOT NULL, conversation_id uuid NULL, interaction_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (tenant_id,connector_id,provider_event_id)
);
CREATE INDEX idx_conversations_attention ON conversations(tenant_id,status,updated_at DESC);
CREATE INDEX idx_timeline_case ON timeline_events(tenant_id,conversation_id,occurred_at,id);
CREATE INDEX idx_commitments_case ON commitments(tenant_id,conversation_id,status,due_at);
CREATE UNIQUE INDEX idx_handoff_one_pending ON handoffs(tenant_id,conversation_id) WHERE status='pending';
CREATE INDEX idx_domain_events_case ON domain_events(tenant_id,aggregate_id,aggregate_version,event_index);
CREATE INDEX idx_audit_subject ON audit_entries(tenant_id,subject_type,subject_id,occurred_at DESC);
CREATE INDEX idx_outbox_pending ON outbox_events(tenant_id,available_at) WHERE published_at IS NULL AND dead_lettered_at IS NULL;
