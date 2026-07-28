# Relay — Communication Control Plane

Relay is the first executable vertical slice of a provider-neutral communication control plane. It turns channel-neutral inbound events into operational cases with a canonical timeline, explicit ownership, controlled status and verifiable commitments.

## Run locally

```bash
npm install
npm run dev
```

- Web: `http://localhost:5173`
- API: `http://localhost:3001`
- Demo editor token: `demo-editor`
- Demo viewer token: `demo-viewer`

If port `3001` is occupied, run the API on another port and point Vite at it:

```bash
PORT=3101 npm run dev:api
API_TARGET=http://localhost:3101 npm run dev:web
```

## Production-style local build

```bash
npm run build
NODE_ENV=production npm start
```

The embedded PGlite database keeps local development executable without Docker. Production uses the PostgreSQL adapter when `DATABASE_URL` is present.

```bash
DATABASE_URL=postgres://migrator:...@host/relay npm run migrate:postgres
DATABASE_URL=postgres://runtime:...@host/relay CONNECTOR_SECRET_DEMO=... npm start
```

Migrations are ordered, checksum-protected and serialized through a PostgreSQL advisory lock. The runtime login must inherit `relay_runtime`, must not own tables and must not have `BYPASSRLS`. A real PostgreSQL service was not available in this workspace, so executing the migrations and the cross-tenant RLS suite against the target cluster remains a hard pilot gate.

## What is implemented

- React reference client with Cases Inbox, Case Detail and channel-neutral timeline
- Fastify API with runtime validation and stable problem responses
- authenticated demo roles (`editor`, `viewer`) and server-side mutation authorization
- explicit `integration:operate` capability for the minimal operations surface
- tenant-scoped reads and writes
- idempotent event ingress with payload-conflict detection
- one canonical Conversation aggregate surfaced as “Case” in the UI
- optimistic concurrency through `If-Match`
- explicit owner and five controlled case states
- commitment create, fulfil and cancel lifecycle
- confirmation-required human-to-human handoffs; ownership changes only after acceptance
- closing gate for open commitments
- automatic reopen after a new interaction
- atomic current-state, domain-event, success-audit and outbox writes
- immutable operational timeline and visible audit records
- connector-scoped ingress idempotency and a versioned `ChannelAdapterV1` contract
- connector ingress authenticated from raw request bytes with HMAC-SHA256, opaque routing key and five-minute timestamp window
- server-derived tenant and connector identity; payload fields cannot select either
- leased outbox claims, bounded backoff, dead-letter state and audited operator redrive
- sanitized integration issue queue without stored inbound payloads or inbound replay
- managed PostgreSQL adapter, RLS migration, runtime grants and checksum migration runner
- geschützter Fünf-Schritt-Wizard für Pilot-Ersteinrichtung mit eigener `pilot:configure`-Capability
- tenantgebundenes Kanalinventar mit genau einem ausgewählten E-Mail-Pilotpostfach; Social-Accounts bleiben fail-closed blockiert
- tenantgebundener, versionierter und auditierter Einrichtungsauftrag ohne Secrets oder Kommunikationsinhalte
- Gmail-OAuth-Grundlage mit einmaligem State, PKCE, exaktem Postfach-Match, widerrufbarer Autorisierung und reinen Secret-Referenzen in der Produktdatenbank
- executable OpenAPI 3.1 document at `/api/openapi.json`
- persistent local database under `.data/`

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run openapi:export
npm audit --audit-level=moderate
```

The integration suite covers authentication/RBAC, signed connector ingress, connector-scoped idempotency, conflicting retries, tenant isolation, optimistic concurrency, commitment closure gates, reopen behavior, atomic event/audit/outbox writes, outbox delivery, controlled redrive and handoff acceptance.

## Pilot-Ersteinrichtung

Ein berechtigter Nutzer öffnet in der Navigation **Ersteinrichtung**. Der Wizard sammelt ausschließlich gemeinsam entscheidbare Konfigurationsangaben:

- Unternehmen, Marke, Pilotprozess, zwei Teams und Startziel,
- vollständigen Kanalbestand aus geschäftlichen E-Mail-Adressen und öffentlichen Social-Handles,
- genau ein E-Mail-Pilotpostfach, dessen Provider, Zugangsumgebung und führendes System,
- Identity Provider sowie geschäftliche Pilot- und Technikkontakte,
- EU-Region, Nutzer-/Case-Volumen und Aufbewahrung,
- Bestätigung ausgeschlossener sensibler Datenklassen.

Die Aktion **Einrichtung anfordern** provisioniert nichts und aktiviert keine realen Daten. Die übrigen E-Mail- und Social-Accounts bleiben reines Inventar. Relay zeigt anschließend die getrennten Prüfungen für PostgreSQL/RLS, OIDC, Secret-Rotation, Provideradapter, Shadow Run und Backup/Restore. Passwörter, Tokens, Client Secrets, Datenbank-URLs und Kundennachrichten gehören niemals in das Formular.

Für einen lokalen Google-OAuth-Test werden `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` und
`GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/api/oauth/google/callback` gemeinsam gesetzt. Die lokale
Laufzeit hält Tokenmaterial ausschließlich flüchtig im Prozess. Produktion bleibt absichtlich gesperrt,
bis ein verwalteter `SecretVault`-Adapter konfiguriert ist; `channel_authorizations` speichert nur dessen
opaque Referenz.

Run the local outbox relay separately when needed:

```bash
npm run dev:worker
```

The worker intentionally logs only event IDs, topic and partition key. It does not log communication content.

## Explicit non-goals of this slice

No message sending, live provider connector, AI, workflow builder, automatic identity merge, attachments, search cluster, marketplace or public SDK. Real PII remains blocked until the migrations and RLS isolation tests pass on the actual managed PostgreSQL cluster, production identity replaces demo bearer tokens, secrets move to a managed secret store, and a live provider adapter completes replay/load testing.
