ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS connector_tenant_isolation ON connectors;
CREATE POLICY connector_tenant_isolation ON connectors
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE OR REPLACE FUNCTION lookup_connector(p_routing_key text)
RETURNS TABLE (id uuid, tenant_id uuid, connector_key text, secret_ref text, status text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT c.id,c.tenant_id,c.connector_key,c.secret_ref,c.status
  FROM public.connectors c WHERE c.routing_key=p_routing_key
$$;

REVOKE ALL ON FUNCTION lookup_connector(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lookup_connector(text) TO relay_runtime;
REVOKE SELECT ON tenants FROM relay_runtime;
GRANT SELECT ON schema_migrations TO relay_runtime;
