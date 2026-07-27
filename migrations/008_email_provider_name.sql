ALTER TABLE pilot_channel_accounts
  ADD COLUMN email_provider_name text NULL;

UPDATE pilot_channel_accounts
SET email_provider_name = 'Unbekannter Anbieter'
WHERE email_provider = 'other'
  AND email_provider_name IS NULL;

ALTER TABLE pilot_channel_accounts
  ADD CONSTRAINT pilot_channel_accounts_provider_name_check
  CHECK (
    (email_provider = 'other' AND length(trim(email_provider_name)) BETWEEN 2 AND 120)
    OR (email_provider IS DISTINCT FROM 'other' AND email_provider_name IS NULL)
  );
