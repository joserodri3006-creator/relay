CREATE TABLE actor_identities (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  issuer text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,issuer,subject),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES actors(tenant_id,id),
  UNIQUE (issuer,subject)
);
CREATE TABLE actor_capabilities (
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  capability text NOT NULL CHECK (capability IN ('case:write','integration:operate')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,actor_id,capability),
  FOREIGN KEY (tenant_id,actor_id) REFERENCES actors(tenant_id,id)
);

ALTER TABLE actor_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_identities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON actor_identities
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
ALTER TABLE actor_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE actor_capabilities FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON actor_capabilities
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT ON actor_identities,actor_capabilities TO relay_runtime;
