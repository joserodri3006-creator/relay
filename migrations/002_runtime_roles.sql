DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='relay_runtime') THEN CREATE ROLE relay_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='relay_migrator') THEN CREATE ROLE relay_migrator NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO relay_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON actors,conversations,interactions,commitments,handoffs,timeline_events,
  ingress_receipts,domain_events,audit_entries,outbox_events,integration_issues TO relay_runtime;
GRANT SELECT ON tenants,connectors TO relay_runtime;

-- Login roles receive membership outside migrations. The table owner/migrator is never the runtime login.
-- Worker and HTTP runtimes may use separate login roles, both inheriting relay_runtime and always binding app.tenant_id.
