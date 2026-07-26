ALTER TABLE actor_capabilities DROP CONSTRAINT actor_capabilities_capability_check;
ALTER TABLE actor_capabilities ADD CONSTRAINT actor_capabilities_capability_check
  CHECK (capability IN ('case:write','integration:operate','pilot:configure'));

CREATE TABLE pilot_onboarding_requests (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  organization_name text NOT NULL,
  workflow_name text NOT NULL,
  primary_channel text NOT NULL CHECK (primary_channel IN ('microsoft_365_email','google_email','whatsapp','api')),
  identity_provider text NOT NULL CHECK (identity_provider IN ('entra','google','okta','other')),
  system_of_record text NOT NULL CHECK (system_of_record IN ('salesforce','hubspot','zendesk','dynamics','custom','none','other')),
  hosting_region text NOT NULL CHECK (hosting_region IN ('eu_germany','eu_ireland','eu_other')),
  target_start_date date NOT NULL,
  team_names jsonb NOT NULL CHECK (jsonb_typeof(team_names)='array' AND jsonb_array_length(team_names)=2),
  expected_users integer NOT NULL CHECK (expected_users BETWEEN 2 AND 50),
  monthly_cases integer NOT NULL CHECK (monthly_cases BETWEEN 1 AND 10000),
  retention_days integer NOT NULL CHECK (retention_days IN (30,60,90)),
  pilot_owner_name text NOT NULL,
  pilot_owner_email text NOT NULL,
  technical_contact_name text NOT NULL,
  technical_contact_email text NOT NULL,
  access_environment text NOT NULL CHECK (access_environment IN ('sandbox','test_account','production_approved')),
  data_exclusions_confirmed boolean NOT NULL CHECK (data_exclusions_confirmed),
  version integer NOT NULL DEFAULT 1,
  created_by_actor_id uuid NOT NULL,
  updated_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,created_by_actor_id) REFERENCES actors(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_actor_id) REFERENCES actors(tenant_id,id)
);

ALTER TABLE pilot_onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_onboarding_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_onboarding_requests
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT,INSERT,UPDATE ON pilot_onboarding_requests TO relay_api;
