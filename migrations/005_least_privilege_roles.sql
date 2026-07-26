DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='relay_api') THEN CREATE ROLE relay_api NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='relay_worker') THEN CREATE ROLE relay_worker NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM relay_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM relay_runtime;
GRANT USAGE ON SCHEMA public TO relay_api,relay_worker;

GRANT SELECT ON tenants,actors,connectors,conversations,interactions,commitments,handoffs,timeline_events,
  ingress_receipts,domain_events,audit_entries,outbox_events,integration_issues,actor_identities,actor_capabilities,schema_migrations TO relay_api;
GRANT INSERT,UPDATE ON conversations,interactions,commitments,handoffs,timeline_events,ingress_receipts,integration_issues TO relay_api;
GRANT INSERT ON domain_events,audit_entries,outbox_events TO relay_api;
GRANT UPDATE ON outbox_events TO relay_api;
GRANT EXECUTE ON FUNCTION lookup_connector(text) TO relay_api;

GRANT SELECT,UPDATE ON outbox_events TO relay_worker;

ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON FUNCTIONS FROM PUBLIC;
