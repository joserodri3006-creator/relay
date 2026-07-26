-- Production PostgreSQL migration. Do not run against the embedded PGlite demo.
-- Runtime transactions must execute: SET LOCAL app.tenant_id = '<verified-tenant-uuid>';

ALTER TABLE actors ADD CONSTRAINT actors_tenant_id_unique UNIQUE (tenant_id, id);
ALTER TABLE interactions ADD CONSTRAINT interactions_tenant_id_unique UNIQUE (tenant_id, id);

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_owner_actor_id_fkey,
  ADD CONSTRAINT conversations_owner_tenant_fk
    FOREIGN KEY (tenant_id, owner_actor_id) REFERENCES actors (tenant_id, id);

ALTER TABLE commitments
  DROP CONSTRAINT IF EXISTS commitments_assignee_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS commitments_created_by_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS commitments_source_interaction_id_fkey,
  ADD CONSTRAINT commitments_assignee_tenant_fk
    FOREIGN KEY (tenant_id, assignee_actor_id) REFERENCES actors (tenant_id, id),
  ADD CONSTRAINT commitments_creator_tenant_fk
    FOREIGN KEY (tenant_id, created_by_actor_id) REFERENCES actors (tenant_id, id),
  ADD CONSTRAINT commitments_source_tenant_fk
    FOREIGN KEY (tenant_id, source_interaction_id) REFERENCES interactions (tenant_id, id);

ALTER TABLE handoffs
  DROP CONSTRAINT IF EXISTS handoffs_from_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS handoffs_to_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS handoffs_responded_by_actor_id_fkey,
  ADD CONSTRAINT handoffs_from_tenant_fk
    FOREIGN KEY (tenant_id, from_actor_id) REFERENCES actors (tenant_id, id),
  ADD CONSTRAINT handoffs_to_tenant_fk
    FOREIGN KEY (tenant_id, to_actor_id) REFERENCES actors (tenant_id, id),
  ADD CONSTRAINT handoffs_responder_tenant_fk
    FOREIGN KEY (tenant_id, responded_by_actor_id) REFERENCES actors (tenant_id, id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'actors','conversations','interactions','commitments','handoffs','timeline_events',
    'ingress_receipts','domain_events','audit_entries','outbox_events','integration_issues'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;

-- The application runtime role must not own these tables and must not have BYPASSRLS.
-- Connector, worker and HTTP transactions all bind the verified tenant with SET LOCAL.
