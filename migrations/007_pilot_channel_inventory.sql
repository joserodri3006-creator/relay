ALTER TABLE pilot_onboarding_requests
  ADD COLUMN brand_name text;

UPDATE pilot_onboarding_requests
SET brand_name = organization_name
WHERE brand_name IS NULL;

ALTER TABLE pilot_onboarding_requests
  ALTER COLUMN brand_name SET NOT NULL,
  ADD COLUMN inventory_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN selected_channel_account_id uuid NULL;

ALTER TABLE pilot_onboarding_requests
  DROP CONSTRAINT pilot_onboarding_requests_primary_channel_check;

ALTER TABLE pilot_onboarding_requests
  ADD CONSTRAINT pilot_onboarding_requests_primary_channel_check
  CHECK (primary_channel IN ('microsoft_365_email','google_email','other_email','whatsapp','api'));

CREATE TABLE pilot_channel_accounts (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  channel_type text NOT NULL CHECK (channel_type IN ('email','instagram','tiktok')),
  identifier text NOT NULL,
  display_label text NOT NULL DEFAULT '',
  email_provider text NULL CHECK (email_provider IN ('microsoft_365','google_workspace','other')),
  activation_status text NOT NULL CHECK (activation_status IN ('inventory','blocked')),
  created_by_actor_id uuid NOT NULL,
  updated_by_actor_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,channel_type,identifier),
  FOREIGN KEY (tenant_id) REFERENCES pilot_onboarding_requests(tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,created_by_actor_id) REFERENCES actors(tenant_id,id),
  FOREIGN KEY (tenant_id,updated_by_actor_id) REFERENCES actors(tenant_id,id),
  CHECK (
    (channel_type='email')
    OR (email_provider IS NULL AND activation_status='blocked')
  )
);

ALTER TABLE pilot_onboarding_requests
  ADD CONSTRAINT pilot_onboarding_selected_account_fk
  FOREIGN KEY (tenant_id,selected_channel_account_id)
  REFERENCES pilot_channel_accounts(tenant_id,id);

CREATE INDEX idx_pilot_channel_accounts_tenant
  ON pilot_channel_accounts(tenant_id,channel_type,created_at);

ALTER TABLE pilot_channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_channel_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON pilot_channel_accounts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT,INSERT,UPDATE,DELETE ON pilot_channel_accounts TO relay_api;

