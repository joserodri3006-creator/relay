import { z } from "zod";
import { commitmentSchema, commitmentUpdateSchema, connectorIngressSchema, handoffDecisionSchema, handoffSchema, ingressSchema, ownerSchema, pilotSetupSchema, statusSchema } from "./domain.js";

const schema = (value: z.ZodType) => z.toJSONSchema(value, { target: "draft-7" });
const problem = {
  type: "object", required: ["title", "status", "code", "requestId"],
  properties: { type: { type: "string" }, title: { type: "string" }, status: { type: "integer" }, code: { type: "string" }, requestId: { type: "string" }, details: {} }
};
const auth = [{ bearerAuth: [] }];
const jsonBody = (bodySchema: object) => ({ required: true, content: { "application/json": { schema: bodySchema } } });
const response = (description: string, bodySchema: object = { type: "object" }) => ({ description, content: { "application/json": { schema: bodySchema } } });
const mutationHeaders = [{ name: "If-Match", in: "header", required: true, schema: { type: "integer" }, description: "Aktuelle Aggregate-Version" }];

export const openapiDocument = {
  openapi: "3.1.0",
  info: { title: "Relay Communication Control Plane API", version: "1.0.0", description: "Providerneutrale Conversation Runtime. Case ist die UX-Sicht einer Conversation." },
  servers: [{ url: "/", description: "Current deployment" }],
  tags: [{ name: "Ingress" }, { name: "Cases" }, { name: "Commitments" }, { name: "Handoffs" }, { name: "Audit" }, { name: "Operations" }, { name: "Pilot Onboarding" }],
  paths: {
    "/api/v1/ingress/events": { post: { tags: ["Ingress"], summary: "Kanonisches Kommunikationsereignis idempotent verarbeiten", security: auth, requestBody: jsonBody(schema(ingressSchema)), responses: { "202": response("Verarbeitet"), "200": response("Idempotentes Duplicate"), "400": response("Validierungsfehler", problem), "409": response("Idempotenzkonflikt", problem) }, "x-relay-adapter-contract": "ChannelAdapterV1" } },
    "/api/internal/v1/channel-ingress/{routingKey}/events": { post: { tags: ["Ingress"], summary: "Signiertes Connector-Ereignis verarbeiten", parameters: [{ name: "routingKey", in: "path", required: true, schema: { type: "string" } }, { name: "X-Relay-Timestamp", in: "header", required: true, schema: { type: "integer" } }, { name: "X-Relay-Signature", in: "header", required: true, schema: { type: "string", pattern: "^sha256=[a-f0-9]{64}$" } }], requestBody: jsonBody(schema(connectorIngressSchema)), responses: { "202": response("Verarbeitet"), "200": response("Idempotentes Duplicate"), "401": response("Signatur ungültig", problem), "404": response("Routing-Key unbekannt", problem) }, "x-relay-signature-input": "timestamp + '.' + raw_request_body" } },
    "/api/v1/integration-issues": { get: { tags: ["Operations"], summary: "Sanitisierte Integrationsfehler lesen", security: auth, responses: { "200": response("Integrationsfehler", { type: "array", items: { type: "object" } }), "403": response("Capability fehlt", problem) } } },
    "/api/v1/integration-issues/outbox/{id}/redrive": { post: { tags: ["Operations"], summary: "Fehlgeschlagenes Outbox-Event kontrolliert erneut einplanen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "202": response("Wiederanlauf eingeplant"), "403": response("Capability fehlt", problem), "409": response("Nicht wiederanlauffähig", problem) } } },
    "/api/v1/pilot-onboarding": {
      get: { tags: ["Pilot Onboarding"], summary: "Pilot-Einrichtungsauftrag und offene Relay-Gates lesen", security: auth, responses: { "200": response("Einrichtungsstand"), "403": response("Capability fehlt", problem) } },
      put: { tags: ["Pilot Onboarding"], summary: "Pilot-Einrichtung anfordern oder aktualisieren", security: auth, parameters: mutationHeaders, requestBody: jsonBody(schema(pilotSetupSchema)), responses: { "201": response("Einrichtung angefordert"), "200": response("Einrichtung aktualisiert"), "400": response("Ungültige Angaben", problem), "409": response("Versionskonflikt", problem) } }
    },
    "/api/v1/cases": { get: { tags: ["Cases"], summary: "Cases nach Attention View auflisten", security: auth, parameters: [{ name: "view", in: "query", schema: { type: "string", enum: ["mine", "unassigned", "active", "resolved"] } }], responses: { "200": response("Case-Liste", { type: "array", items: { type: "object" } }) } } },
    "/api/v1/cases/{id}": { get: { tags: ["Cases"], summary: "Case mit Timeline lesen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": response("Case"), "404": response("Nicht gefunden", problem) } } },
    "/api/v1/cases/{id}/owner": { put: { tags: ["Cases"], summary: "Owner setzen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(ownerSchema)), responses: { "200": response("Geändert"), "409": response("Versionskonflikt", problem) } } },
    "/api/v1/cases/{id}/status": { patch: { tags: ["Cases"], summary: "Status ändern", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(statusSchema)), responses: { "200": response("Geändert"), "409": response("Fachlicher Konflikt", problem) } } },
    "/api/v1/cases/{id}/commitments": { post: { tags: ["Commitments"], summary: "Commitment anlegen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(commitmentSchema)), responses: { "201": response("Angelegt"), "409": response("Versionskonflikt", problem) } } },
    "/api/v1/cases/{id}/commitments/{commitmentId}": { patch: { tags: ["Commitments"], summary: "Commitment abschließen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "commitmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(commitmentUpdateSchema)), responses: { "200": response("Geändert"), "409": response("Konflikt", problem) } } },
    "/api/v1/cases/{id}/handoffs": { post: { tags: ["Handoffs"], summary: "Bestätigungspflichtige Übergabe anfordern", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(handoffSchema)), responses: { "201": response("Angefordert"), "409": response("Konflikt", problem) } } },
    "/api/v1/cases/{id}/handoffs/{handoffId}": { patch: { tags: ["Handoffs"], summary: "Übergabe annehmen, ablehnen oder abbrechen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "handoffId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, ...mutationHeaders], requestBody: jsonBody(schema(handoffDecisionSchema)), responses: { "200": response("Entschieden"), "403": response("Falscher Actor", problem), "409": response("Konflikt", problem) } } },
    "/api/v1/cases/{id}/audit": { get: { tags: ["Audit"], summary: "Minimale Änderungshistorie lesen", security: auth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { "200": response("Audit Entries", { type: "array", items: { type: "object" } }) } } }
  },
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } }, schemas: { Problem: problem, CanonicalIngressV1: schema(ingressSchema) } }
} as const;
