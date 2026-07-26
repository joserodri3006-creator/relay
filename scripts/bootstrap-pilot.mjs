import crypto from "node:crypto";
import pg from "pg";

const required = ["DATABASE_URL","PILOT_TENANT_ID","PILOT_TENANT_NAME","PILOT_ACTOR_ID","PILOT_ACTOR_NAME","PILOT_OIDC_ISSUER","PILOT_OIDC_SUBJECT","PILOT_CONNECTOR_ID","PILOT_CONNECTOR_KEY","PILOT_CONNECTOR_ROUTING_KEY","PILOT_CONNECTOR_SECRET_REF"];
for (const name of required) if (!process.env[name]) throw new Error(`${name} ist erforderlich.`);
for (const name of ["PILOT_TENANT_ID","PILOT_ACTOR_ID","PILOT_CONNECTOR_ID"]) if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(process.env[name])) throw new Error(`${name} muss eine UUID sein.`);
const capabilities = (process.env.PILOT_CAPABILITIES ?? "case:write,integration:operate,pilot:configure").split(",").map(value => value.trim());
if (capabilities.some(value => !["case:write","integration:operate","pilot:configure"].includes(value))) throw new Error("PILOT_CAPABILITIES enthält einen unbekannten Wert.");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, application_name: "relay-pilot-bootstrap" });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query("INSERT INTO tenants(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name", [process.env.PILOT_TENANT_ID, process.env.PILOT_TENANT_NAME]);
  await client.query("SELECT set_config('app.tenant_id',$1,true)", [process.env.PILOT_TENANT_ID]);
  await client.query(`INSERT INTO actors(id,tenant_id,display_name,role) VALUES($1,$2,$3,'editor')
    ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,role=excluded.role`, [process.env.PILOT_ACTOR_ID,process.env.PILOT_TENANT_ID,process.env.PILOT_ACTOR_NAME]);
  await client.query(`INSERT INTO actor_identities(tenant_id,actor_id,issuer,subject,status) VALUES($1,$2,$3,$4,'active')
    ON CONFLICT(tenant_id,issuer,subject) DO UPDATE SET actor_id=excluded.actor_id,status='active'`, [process.env.PILOT_TENANT_ID,process.env.PILOT_ACTOR_ID,process.env.PILOT_OIDC_ISSUER,process.env.PILOT_OIDC_SUBJECT]);
  await client.query("DELETE FROM actor_capabilities WHERE tenant_id=$1 AND actor_id=$2", [process.env.PILOT_TENANT_ID,process.env.PILOT_ACTOR_ID]);
  for (const capability of capabilities) await client.query("INSERT INTO actor_capabilities(tenant_id,actor_id,capability) VALUES($1,$2,$3)", [process.env.PILOT_TENANT_ID,process.env.PILOT_ACTOR_ID,capability]);
  await client.query(`INSERT INTO connectors(id,tenant_id,routing_key,connector_key,display_name,status,secret_ref)
    VALUES($1,$2,$3,$4,$5,'active',$6) ON CONFLICT(id) DO UPDATE SET routing_key=excluded.routing_key,connector_key=excluded.connector_key,display_name=excluded.display_name,status='active',secret_ref=excluded.secret_ref`,
    [process.env.PILOT_CONNECTOR_ID,process.env.PILOT_TENANT_ID,process.env.PILOT_CONNECTOR_ROUTING_KEY,process.env.PILOT_CONNECTOR_KEY,process.env.PILOT_CONNECTOR_NAME ?? "Pilot Connector",process.env.PILOT_CONNECTOR_SECRET_REF]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ type: "pilot.bootstrap_completed", operationId: crypto.randomUUID(), tenantId: process.env.PILOT_TENANT_ID, actorId: process.env.PILOT_ACTOR_ID, connectorId: process.env.PILOT_CONNECTOR_ID }));
} catch (error) { await client.query("ROLLBACK"); throw error; }
finally { await client.end(); }
