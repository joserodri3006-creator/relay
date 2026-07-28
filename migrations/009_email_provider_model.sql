ALTER TABLE pilot_channel_accounts
  ADD COLUMN provider_key text NULL,
  ADD COLUMN mail_product_key text NULL;

UPDATE pilot_channel_accounts
SET provider_key = CASE email_provider
      WHEN 'google_workspace' THEN 'google'
      WHEN 'microsoft_365' THEN 'microsoft'
      WHEN 'other' THEN 'other'
    END,
    mail_product_key = CASE email_provider
      WHEN 'google_workspace' THEN 'google_workspace'
      WHEN 'microsoft_365' THEN 'microsoft_365'
      WHEN 'other' THEN 'other'
    END
WHERE email_provider IS NOT NULL;

ALTER TABLE pilot_channel_accounts
  ADD CONSTRAINT pilot_channel_accounts_provider_model_check
  CHECK (
    (channel_type <> 'email' AND provider_key IS NULL AND mail_product_key IS NULL)
    OR
    (channel_type = 'email' AND (
      (provider_key IS NULL AND mail_product_key IS NULL)
      OR (provider_key = 'google' AND mail_product_key IN ('gmail','google_workspace'))
      OR (provider_key = 'microsoft' AND mail_product_key = 'microsoft_365')
      OR (provider_key = 'other' AND mail_product_key = 'other')
    ))
  );
