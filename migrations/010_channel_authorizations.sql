CREATE TABLE channel_authorizations (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  channel_account_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('google')),
  status text NOT NULL CHECK (status IN ('not_connected','pending','connected','error','revoked')),
  expected_identifier text NOT NULL,
  authorized_identifier text NULL,
  provider_subject text NULL,
  secret_ref text NULL,
  granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code text NULL,
  version integer NOT NULL DEFAULT 1,
  created_by_actor_id uuid NOT NULL,
  updated_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,channel_account_id,provider),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,channel_account_id)
    REFERENCES pilot_channel_accounts(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by_actor_id) REFERENCES actors(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_actor_id) REFERENCES actors(tenant_id,id),
  CHECK (
    (status='connected' AND authorized_identifier IS NOT NULL AND provider_subject IS NOT NULL AND secret_ref IS NOT NULL)
    OR status<>'connected'
  )
);

CREATE TABLE oauth_authorization_flows (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  state_hash text NOT NULL UNIQUE,
  pkce_secret_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','consumed','expired')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz NULL,
  FOREIGN KEY (tenant_id,authorization_id)
    REFERENCES channel_authorizations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,actor_id) REFERENCES actors(tenant_id,id)
);

CREATE INDEX idx_channel_authorizations_account
  ON channel_authorizations(tenant_id,channel_account_id,status);
CREATE INDEX idx_oauth_flows_expiry
  ON oauth_authorization_flows(expires_at) WHERE status='pending';

ALTER TABLE channel_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_authorizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON channel_authorizations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE oauth_authorization_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_flows FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON oauth_authorization_flows
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON channel_authorizations TO relay_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON oauth_authorization_flows TO relay_api;
