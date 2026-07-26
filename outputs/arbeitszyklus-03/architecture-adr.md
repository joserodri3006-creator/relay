# ADR-003: Architektur des ersten Communication-Runtime-Vertical-Slice

**Stand:** 20. Juli 2026  
**Status:** vorgeschlagene, implementierungsfähige Entscheidung  
**Scope:** Conversation-Aggregat, Teilnehmer, Timeline, Ownership, Commitments, idempotenter Channel-Ingress, Tenant-Grenze und Auditierbarkeit  
**Nicht im Scope:** produktive Provider-Adapter, Versand, Identity Resolution, AI, Workflow Builder, Anhänge, Search Cluster, Marketplace und Benutzeroberfläche

## 1. Entscheidung in einem Satz

Wir bauen einen TypeScript-basierten modularen Monolithen mit PostgreSQL als operativer Wahrheit: `Conversation` ist das einzige fachliche Aggregat, Zustandsänderungen und unveränderliche Domain Events werden in derselben Transaktion geschrieben, eine Outbox publiziert sie mindestens einmal, und jede mandantengebundene Tabelle wird durch explizite Autorisierung plus PostgreSQL Row-Level Security geschützt.

Das ist kein Prototyp zum Wegwerfen. Es ist der kleinste produktionsähnliche Kern, an dem sich die Infrastrukturhypothese beweisen lässt:

> Ein beliebiges Kanalereignis kann genau einmal fachlich wirksam werden und danach mit Teilnehmern, Verantwortung, Zusagen, Herkunft und vollständiger Änderungshistorie rekonstruiert werden.

## 2. Problem und Erfolgsdefinition

Eine Shared Inbox wäre bereits mit Nachricht, Thread und Assignee zufrieden. Die Communication Control Plane muss mehr beweisen:

1. Ein Provider-Retry erzeugt keine zweite Nachricht, Zusage oder Ownership-Änderung.
2. Der Kanal-Thread bleibt eine externe Referenz und wird nicht zum fachlichen Aggregat.
3. Ein Tenant kann weder über API, Hintergrundjob noch direkten Datenbankzugriff Daten eines anderen Tenants lesen oder verändern.
4. Aktueller Zustand und fachliche Historie widersprechen sich nicht.
5. Jeder Schreibvorgang lässt sich auf Actor, Request, Quelle, Zeitpunkt und vorherige Aggregatversion zurückführen.
6. Ein Consumer kann Events erneut empfangen, ohne dass exakt-einmalige Zustellung versprochen werden muss.

Der Slice gilt technisch als abgeschlossen, wenn zwei simulierte Kanäle dieselbe kanonische Ingress-Schnittstelle verwenden, ein vollständiger Fallfluss lokal ausführbar ist und Negativtests Replay, Parallelität, Tenant-Escape und unzulässige Zustandsübergänge abweisen.

## 3. Fachliche Grenze

### 3.1 Eine Entität, nicht `Case` plus `Conversation`

Der Aggregatname im Kern lautet **Conversation**. „Case“, „Vorgang“ oder „Anliegen“ sind Produkt- und Branchenbegriffe für eine Sicht auf dasselbe Aggregat, keine zweite Kernentität. Die öffentliche API verwendet deshalb `/v1/conversations`.

Eine Conversation ist ein langlebiger fachlicher Koordinationskontext. Sie kann mehrere Kanal-Threads enthalten. Im ersten Slice wird bei unbekanntem Kanal-Thread zunächst eine Conversation erzeugt; diese 1:1-Anfangsabbildung ist nur eine Ingress-Regel. Das Modell erlaubt später Link, Unlink, Merge-Vorschlag und Split, ohne Provider-IDs umzuschreiben.

### 3.2 Aggregate-Invarianten

- Jede Conversation gehört genau einem Tenant.
- Jede Conversation besitzt eine monoton steigende `version`.
- Sie hat höchstens einen aktuellen Owner; Owner ist ein tenantgebundener Actor vom Typ `user`, `team`, `ai_agent` oder `system`.
- Eine Participant-Mitgliedschaft verweist auf einen Actor und eine Rolle im Kontext; dieselbe aktive Actor-/Rollen-Kombination ist nur einmal vorhanden.
- Ein Commitment gehört genau einer Conversation, hat einen verantwortlichen Actor, einen nachvollziehbaren Ursprung und einen kontrollierten Statusübergang.
- Jede fachliche Mutation erzeugt genau ein oder mehrere Domain Events in derselben Datenbanktransaktion.
- Domain Events werden nie geändert oder fachlich gelöscht. Löschpflichtiger Inhalt liegt nicht im Eventpayload, sondern in separat löschbaren Records; das Event behält nur minimale Metadaten und Referenzen.
- Die Reihenfolge innerhalb einer Conversation ist über `(aggregate_version, event_index)` eindeutig. Globale Reihenfolge wird nicht versprochen.

### 3.3 Erlaubte erste Zustände

`conversation.status`: `open | waiting_external | waiting_internal | resolved | closed`

`commitment.status`: `open | fulfilled | cancelled | overdue`

`participant.role`: `customer | requester | collaborator | watcher | system`

Diese Werte sind bewusst klein. Segmentbegriffe wie Auftrag, Gerät, Ticket oder Account werden später über Context Links referenziert und nicht in diese Zustandsmaschine aufgenommen.

## 4. Systemstruktur

```text
Provider Fixture / Adapter
          |
          v
  Channel Ingress API ---- Signatur/Auth, Schema, Idempotency
          |
          v
  Conversation Application Service
          |
          +---- AuthZ/Capability Check
          |
          +---- PostgreSQL Transaction ----------------------+
          |      ingress_receipt                             |
          |      conversation + participants/commitments     |
          |      interaction/content reference               |
          |      domain_event + audit_entry + outbox          |
          |                                                   |
          +---------------------------------------------------+
                                      |
                                      v
                               Outbox Worker
                                      |
                            Webhook/Test Consumer
```

Module im selben Deployable:

- `tenancy-auth`: Authentisierung, Tenant-Kontext, Capabilities, Actors.
- `channel-ingress`: Adaptervertrag, Provider-Herkunft, Replay- und Idempotency-Kontrolle.
- `conversation-runtime`: Aggregate, Commands, Invarianten und Transaktionen.
- `eventing`: Domain-Event-Envelope, Outbox-Relay und Consumer-Deduplizierung.
- `audit`: sicherheits- und fachlich relevante Audit-Einträge sowie Export.
- `api`: REST, OpenAPI, Fehlervertrag und Cursor-Pagination.

Module importieren ausschließlich öffentliche Modulports. Direkte Fremdtabellenzugriffe aus einem anderen Modul sind durch Konvention, Tests und Query-Repositories verboten. Ein Prozess und eine Datenbank sind hier eine bewusste Deployment-Entscheidung, keine Aufhebung der Domänengrenzen.

## 5. Konkreter kleiner Stack

| Bereich | Entscheidung | Begründung |
|---|---|---|
| Runtime | Node.js 24 LTS, TypeScript strict | Einfache lokale Entwicklung, ein Sprachsystem für API, Worker und spätere SDKs |
| HTTP | Fastify 5 | Schlank, schemaorientiert, gute Hooks für Tenant-Kontext und Observability |
| Vertrag | Zod 4 plus OpenAPI-Generierung | Ein validierter Laufzeitvertrag; generiertes OpenAPI ist Ergebnis, nicht handgeschriebene zweite Wahrheit |
| Datenzugriff | Kysely plus `pg`, SQL-Migrationen | Typisierte Queries, aber transparente SQL-, Locking- und RLS-Kontrolle |
| Datenbank | PostgreSQL 17 | Transaktionen, JSONB, Constraints, RLS, `SKIP LOCKED` und Partitionierungsweg ohne Zusatzsystem |
| Auth lokal | `jose`, lokal signierte OIDC-kompatible JWT-Fixtures | Produktionsvertrag bleibt OIDC; Tenant stammt aus verifiziertem Claim, nie aus frei gesetztem Header |
| Background Jobs | eigener dünner Outbox-Worker mit `FOR UPDATE SKIP LOCKED` | Für Relay und Retry ausreichend; kein Workflow-Orchestrator vor Workflow-Scope |
| Tests | Vitest, Testcontainers, Fastify inject | Echte PostgreSQL-RLS-, Transaktions- und Concurrency-Tests statt SQLite-Ersatz |
| Telemetrie | OpenTelemetry, Pino, Prometheus-kompatible Metriken | Correlation vom Ingress bis zur Outbox; keine Kommunikationsinhalte in Logs |
| Lokalbetrieb | Docker Compose: `api`, `worker`, `postgres` | Ein Befehl, produktionsähnliche DB, keine Kubernetes-Abhängigkeit |

Nicht gewählt: NestJS, Prisma, Redis, Kafka, Temporal, GraphQL, Elasticsearch und Kubernetes. Keines davon ist für diesen Slice erforderlich; Ports und Eventverträge halten ihre spätere Einführung offen.

## 6. Datenmodell v0

Alle IDs sind UUIDv7-Anwendungs-IDs; Provider-IDs sind ausschließlich externe Schlüssel. Alle Zeitstempel sind `timestamptz`. Jede mandantengebundene Tabelle enthält `tenant_id NOT NULL`, auch wenn dieser über einen Join ableitbar wäre. Diese kontrollierte Redundanz ermöglicht RLS, Partitionierung und lokale Konsistenzprüfungen.

### 6.1 Tabellen

| Tabelle | Wesentliche Spalten / Regeln |
|---|---|
| `tenants` | `id`, `slug`, `status`, `region`, `created_at`; globale Administration getrennt vom Tenant-Pfad |
| `actors` | `id`, `tenant_id`, `type`, `display_name`, `external_ref`, `status`; unique `(tenant_id,id)` und optional `(tenant_id,external_ref)` |
| `conversations` | `id`, `tenant_id`, `status`, `subject`, `owner_actor_id`, `version bigint`, `opened_at`, `resolved_at`, `created_at`, `updated_at`; FK `(tenant_id,owner_actor_id)` |
| `conversation_participants` | `id`, `tenant_id`, `conversation_id`, `actor_id`, `role`, `joined_at`, `left_at`, `added_by_actor_id`; partielle Unique-Regel für aktive `(tenant_id,conversation_id,actor_id,role)` |
| `channel_threads` | `id`, `tenant_id`, `connector_id`, `provider_thread_id`, `conversation_id`, `linked_at`; unique `(tenant_id,connector_id,provider_thread_id)` |
| `interactions` | `id`, `tenant_id`, `conversation_id`, `direction`, `kind`, `author_actor_id`, `content_id`, `provider_occurred_at`, `recorded_at`, `source_receipt_id`; immutable nach Anlage |
| `contents` | `id`, `tenant_id`, `media_type`, `body_text`, `retention_until`, `redacted_at`, `content_hash`; fachlicher Inhalt ist separat lösch-/redigierbar |
| `commitments` | `id`, `tenant_id`, `conversation_id`, `description`, `status`, `assignee_actor_id`, `due_at`, `source_interaction_id`, `version`, `created_by_actor_id`, `created_at`, `updated_at`; erlaubte Transitionen im Domain Service |
| `ingress_receipts` | `id`, `tenant_id`, `connector_id`, `provider_event_id`, `payload_hash`, `schema_version`, `received_at`, `processed_at`, `status`, `failure_code`; unique `(tenant_id,connector_id,provider_event_id)` |
| `idempotency_records` | `tenant_id`, `scope`, `key`, `request_hash`, `status`, `response_code`, `response_body`, `expires_at`; unique `(tenant_id,scope,key)` |
| `domain_events` | `id`, `tenant_id`, `aggregate_type`, `aggregate_id`, `sequence`, `event_type`, `schema_version`, `actor_id`, `occurred_at`, `recorded_at`, `correlation_id`, `causation_id`, `data jsonb`; unique `(tenant_id,aggregate_id,sequence,event_type)` nur wenn eine Eventart je Sequence vorkommt, ansonsten eigener `event_index` |
| `audit_entries` | `id`, `tenant_id`, `category`, `action`, `actor_id`, `subject_type`, `subject_id`, `result`, `reason_code`, `request_id`, `source_ip_hash`, `occurred_at`, `metadata jsonb`; append-only, keine Nachrichtentexte oder Tokens |
| `outbox_events` | `id`, `tenant_id`, `domain_event_id`, `topic`, `partition_key`, `payload`, `attempts`, `available_at`, `published_at`, `last_error_code`; unique `domain_event_id` |
| `consumer_receipts` | `tenant_id`, `consumer_name`, `event_id`, `processed_at`; unique `(tenant_id,consumer_name,event_id)` |

Für mehrere Domain Events in einer Mutation erhält `domain_events` die Felder `aggregate_version` und `event_index`; unique ist dann `(tenant_id, aggregate_id, aggregate_version, event_index)`. Das ist gegenüber künstlich mehrfach hochgezählten Aggregatversionen vorzuziehen.

### 6.2 Event-Envelope

```json
{
  "id": "019...",
  "type": "commitment.created",
  "schemaVersion": 1,
  "tenantId": "019...",
  "aggregate": { "type": "conversation", "id": "019...", "version": 7 },
  "occurredAt": "2026-07-20T10:15:30.000Z",
  "recordedAt": "2026-07-20T10:15:30.143Z",
  "actor": { "type": "user", "id": "019..." },
  "correlationId": "req_...",
  "causationId": "019...",
  "data": {
    "commitmentId": "019...",
    "assigneeActorId": "019...",
    "dueAt": "2026-07-21T15:00:00.000Z"
  }
}
```

Eventdaten enthalten keine vollständigen Inhalte. Ein Event referenziert `interactionId`, `contentId` oder `commitmentId`. Events sind additiv versioniert; bestehende Felder ändern ihre Bedeutung nicht. Breaking Changes erzeugen eine neue Eventart oder Schema-Version mit parallelem Übergangsfenster.

### 6.3 Erste Eventarten

- `conversation.opened`, `conversation.status_changed`
- `participant.joined`, `participant.left`
- `interaction.recorded`
- `ownership.assigned`, `ownership.released`
- `commitment.created`, `commitment.fulfilled`, `commitment.cancelled`, `commitment.overdue`
- `channel_thread.linked`

`ingress.received`, Signaturfehler, AuthZ-Denials und Exporte sind Audit-/Betriebsereignisse, nicht zwingend Conversation-Timeline-Events.

## 7. Schreibpfad und Konsistenz

### 7.1 Idempotenter Channel-Ingress

1. Adapter authentisiert den Provider-Request, prüft Signatur, Zeitfenster und Replay-Nonce und erzeugt ein kanonisches `IngressCommand`.
2. Tenant wird aus dem gespeicherten Connector bestimmt, niemals aus dem Payload übernommen.
3. In einer Transaktion wird `ingress_receipts` per eindeutigem Provider-Event-Key angelegt.
4. Existiert derselbe Key mit gleichem Hash bereits erfolgreich, liefert die API die ursprüngliche Wirkung zurück. Existiert derselbe Key mit anderem Hash, wird `409 IDEMPOTENCY_CONFLICT` erzeugt und auditiert.
5. Der Application Service findet den `channel_thread` oder erzeugt eine neue Conversation und verknüpft den Thread.
6. Interaction, Teilnehmeränderungen, Conversation-Version, Domain Event, Audit und Outbox werden atomar geschrieben.
7. Erst nach Commit wird `202 Accepted` beziehungsweise das deterministische Ergebnis zurückgegeben.

Provider-Event-ID ist der primäre Deduplizierungsschlüssel. Fehlt sie, darf der Adapter einen dokumentierten deterministischen Fingerprint aus stabilen Providerfeldern bilden; ein reiner Hash des gesamten JSON ist wegen variabler Felder nicht zulässig.

### 7.2 Konkurrenz

Commands können `If-Match: <conversation-version>` verwenden. Interner Ingress sperrt die Conversation-Zeile kurz mit `SELECT ... FOR UPDATE`; alle Mutationen prüfen die erwartete Version. Ein Konflikt wird nicht still überschrieben. Out-of-order-Kommunikation darf als Interaction aufgezeichnet werden, aber zustandsverändernde abgeleitete Aktionen werden nur gegen die aktuelle Version angewandt.

### 7.3 Outbox

Der Worker reserviert fällige Zeilen in kleinen Batches mit `FOR UPDATE SKIP LOCKED`, erhöht atomar `attempts` und publiziert. Publikation ist **at least once**. Consumers deduplizieren über `consumer_receipts`. Exponentieller Retry mit Jitter, maximale Versuche und Dead-Letter-Status sind verpflichtend. „Exactly once“ wird weder intern noch extern versprochen.

## 8. Tenant- und Sicherheitsgrenze

Defense in depth:

1. JWT wird gegen festen Issuer, Audience, Signaturalgorithmus und Uhrtoleranz geprüft.
2. `tenant_id` und Actor stammen aus verifizierten Claims; ein Request darf sie nicht überschreiben.
3. Application Authorization prüft Capability und Ressourcenzugehörigkeit.
4. Jede DB-Transaktion setzt `SET LOCAL app.tenant_id = '<uuid>'`; bei fehlendem Tenant-Kontext schlagen RLS-Policies geschlossen fehl.
5. Der Runtime-DB-User ist nicht Tabellenbesitzer, besitzt kein `BYPASSRLS`, und Tabellen verwenden `ENABLE` plus `FORCE ROW LEVEL SECURITY`.
6. Composite Foreign Keys `(tenant_id, referenced_id)` verhindern Cross-Tenant-Beziehungen auch bei Programmierfehlern.
7. Worker-Jobs tragen nur eine interne opaque ID. Vor Verarbeitung wird der Tenant aus vertrauenswürdigem Storage geladen und erneut im DB-Kontext gebunden.
8. Logs und Traces enthalten IDs, Status, Größen und Reason Codes, aber keine Bodies, Authorization Header, Secrets oder JWTs.

Serviceweite Wartungsrollen sind physisch getrennte Credentials, standardmäßig deaktiviert und jeder Zugriff wird gesondert auditiert. Support-Impersonation gehört nicht in diesen Slice.

### Audit statt Überwachung

Das Audit beantwortet: wer hat wann welche Aktion auf welchem Objekt versucht, mit welchem Ergebnis und über welchen Request? Reads werden risikobasiert auditiert: Detailansicht, Export und administrative Abfragen ja; jeder interne Listen-Query nein. Fachliche Veränderungen stehen zusätzlich im Domain Event Log. Audit und Timeline sind getrennt, weil Zugriffsversuche keine fachliche Conversation-Historie sind.

## 9. API-Schnittfläche des Slice

```text
POST   /v1/conversations
GET    /v1/conversations/{id}
GET    /v1/conversations/{id}/timeline?after=<cursor>&limit=50
POST   /v1/conversations/{id}/participants
DELETE /v1/conversations/{id}/participants/{participantId}
PUT    /v1/conversations/{id}/owner
POST   /v1/conversations/{id}/commitments
PATCH  /v1/conversations/{id}/commitments/{commitmentId}
POST   /internal/v1/channel-ingress/{connectorId}/events
GET    /v1/audit?subjectType=conversation&subjectId=<id>
```

Schreibrequests verwenden `Idempotency-Key`; mutationsgefährdete Updates zusätzlich `If-Match`. Timeline-Pagination basiert auf `(aggregate_version,event_index)`, nicht Offset. Fehler folgen einem stabilen Problem-Details-Vertrag mit `code`, `requestId` und sicheren `details`. Interne Ingress-Routen werden nicht Teil des öffentlichen Kunden-SDKs; Adapter implementieren einen versionierten Port.

Webhooks publizieren das Domain-Event-Envelope. Subscription, Signatur und Delivery-Log können im Slice zunächst ein Test-Consumer sein; der Outbox-Vertrag muss trotzdem durch Integrationstests belegt werden.

## 10. Gegenpositionen und Diskussion

### Gegenposition 1 – Chief Architect/Data: „Volles Event Sourcing ab Tag eins“

**Argument:** Die Plattform verkauft Historie, Replay und Audit. Der Event Stream sollte daher alleinige Wahrheit sein; Projection Rebuild und Temporal Queries wären strukturell sauber.

**Widerspruch von Security/Enterprise:** Kommunikationsinhalte unterliegen Berichtigung, Löschung und unterschiedlichen Retentionsregeln. Vollständige Zustandsrekonstruktion aus evolvierenden PII-Events erhöht Datenschutz- und Migrationsrisiko. Das Team müsste Upcaster, Snapshotting, Rebuild-Isolation und Event-Löschkonzepte bauen, bevor Nutzen bewiesen ist.

**Entscheidung:** kein volles Event Sourcing. Normalisierte Current-State-Tabellen sind operative Wahrheit; unveränderliche minimale Domain Events dokumentieren Veränderungen und treiben Integrationen. Event-Sourcing bleibt eine spätere, modulweise Option, aber nicht implizites Ziel.

### Gegenposition 2 – Future Technologies/API: „Conversation und Case getrennt modellieren“

**Argument:** KI-Agenten, Voice Sessions und Marketingkontakte können Conversations führen, ohne dass bereits ein Case existiert. Ein Case könne mehrere Conversations bündeln und ein langlebiges Outcome tragen.

**Widerspruch von Product/Architect:** Zwei Aggregate vor beobachteter Semantik erzeugen Zuordnungslogik, Lifecycle-Fragen und API-Komplexität. „Case“ wäre in Service, Sales und Customer Success unterschiedlich und droht vertikale Semantik in den Kern zu ziehen.

**Entscheidung:** nur Conversation als fachlicher Koordinationskontext. Ein späteres Outcome-/Work-Object kann via Context Link oder als eigenes Aggregat ergänzt werden, sobald mehrere reale Workflows dieselbe Grenze belegen. Die API reserviert den Begriff Case nicht.

### Gegenposition 3 – DevOps/Data: „Kafka und getrennte Services sofort“

**Argument:** Channel-Ingress ist bursty, Events sind der Plattformvertrag, unabhängige Skalierung und Replay werden sicher gebraucht. Ein Broker sei keine vorzeitige Optimierung, sondern die Infrastruktur selbst.

**Widerspruch von Finance/QA/Architect:** Kafka löst keine fachliche Idempotenz und keine DB/Broker-Dual-Write-Konsistenz. Es vervielfacht lokale Betriebs-, Test- und Observability-Flächen, bevor Last oder Teamgrenzen existieren.

**Entscheidung:** transaktionale PostgreSQL-Outbox und separater Worker. Das Event-Envelope, die Partitionierungsregel und Consumer-Idempotenz sind brokerfähig. Kafka/PubSub wird eingeführt, wenn gemessener Durchsatz, unabhängige Consumer-SLAs, lange Replay-Fenster oder organisatorische Servicegrenzen es verlangen.

### Gegenposition 4 – Enterprise Architect: „Database-per-tenant als echte Isolation“

**Argument:** RLS ist fehlkonfigurierbar; Großkunden erwarten Datenresidenz, Restore pro Tenant und stärkere Blast-Radius-Grenzen.

**Widerspruch von DevOps/Finance:** Tausende kleine Datenbanken verteuern Migrationen, Connection Management und Betrieb. Der MVP braucht zunächst messbare Isolation, nicht dedizierte Infrastruktur für hypothetische Verträge.

**Entscheidung:** shared schema mit `tenant_id`, RLS, Composite FKs und automatisierten Escape-Tests. `tenant.region` und ein tenantunabhängiger Routing-Layer werden früh vorgesehen. Derselbe Schema-/Migrationssatz muss später Shared Shards, regionale Zellen und dedizierte Datenbanken bedienen können.

### Gegenposition 5 – Security: „Raw Provider Envelope vollständig und unveränderlich speichern“

**Argument:** Ohne Originalpayload sind Mappingfehler, Streitfälle und Adaptermigrationen nicht vollständig nachvollziehbar.

**Widerspruch von Privacy/Data:** Raw Payloads enthalten unnötige PII, flüchtige URLs, Tokens oder unbekannte Sonderdaten. Unbegrenzte Immutable Storage widerspricht Datenminimierung und Löschbarkeit.

**Entscheidung:** kanonische relevante Felder, Payload-Hash, Mapping-/Schema-Version und erlaubte redigierte Source-Metadaten speichern. Raw Envelopes sind optionaler, verschlüsselter Quarantäne-/Debug-Store mit kurzer tenantbezogener Retention, nicht Bestandteil des permanenten Domain Event Log.

### Gegenposition 6 – API Designer: „GraphQL für flexible Timeline und Cliententwicklung“

**Argument:** Timeline, Participants, Commitments und wechselnde Seitenleisten sind graphartig; Clients könnten exakt benötigte Felder laden.

**Widerspruch von Security/Platform:** Field-Level-Autorisierung, Cost Limits, Caching, Persisted Queries und öffentliche Schema-Evolution erhöhen die Oberfläche. Der Slice braucht wenige Commands und deterministische Event-/Webhook-Verträge.

**Entscheidung:** REST plus OpenAPI und Webhooks. GraphQL kann später als Read-Fassade auf stabilen Application Services entstehen, nicht als Domain- oder Integrationsvertrag.

### Gegenposition 7 – DevOps/Future Tech: „Temporal für Commitments und Fristen“

**Argument:** Overdue-Fristen, Handoffs und zukünftige Policies sind langlebige Workflows. PostgreSQL-Polling werde später ersetzt und erzeuge Migrationskosten.

**Widerspruch von Architect/Product:** Der Slice benötigt nur persistente Commitments und einen deterministischen Overdue-Sweeper; keine Saga, Human Task Orchestration oder frei konfigurierbare Workflow Engine.

**Entscheidung:** Fristenscan über indizierte `commitments(status,due_at)` und idempotente Status-Commands. Ein späterer Workflow Runtime Port kann Temporal oder einen anderen Orchestrator aufnehmen; Commitment bleibt fachliche Wahrheit und wird nicht in Workflow-History eingeschlossen.

## 11. Skalierungsprüfung

| Wachstumsproblem | Heute | Evolutionspfad ohne Kernbruch | Trigger |
|---|---|---|---|
| Mehr Ingress-Last | ein API-Deployable, mehrere Worker | Worker horizontal; Queue-Relay zu Broker | anhaltende Outbox-Lag oder Provider-Bursts verletzen SLO trotz DB-Tuning |
| Große Timeline | Postgres-Index nach Tenant/Conversation/Sequence | zeit-/hashpartitionierte Events, Read Model | einzelne Conversations/Retention beeinträchtigen P95 |
| Viele Tenants | Shared DB + RLS | tenantbasierte Shards/regionale Zellen | DB-Working-Set, Residenz oder Blast Radius verlangen Trennung |
| Enterprise-Isolation | logische Isolation | dedizierte Zell- oder DB-Platzierung | bezahlter Vertrag/Security Requirement, nicht Vertriebswunsch allein |
| Neue Kanäle | Adapterport + Channel Capability Metadata | eigenständige Adapter-Deployables | divergierende Releasezyklen, Secrets oder Lastprofile |
| Viele Consumer | DB-Outbox/Test-Webhooks | Kafka/PubSub und Schema Registry | Replay, Fan-out oder unabhängige Consumer-SLAs werden real |
| Analytics | operative Queries, Events exportierbar | CDC/Event Sink ins Warehouse | analytische Queries belasten OLTP |
| Globale Ordnung | keine | weiterhin vermeiden; Ordnung pro Conversation/Partition | es gibt keinen legitimen Trigger für globale Totalordnung |

Die stabile Skalierungseinheit ist `(tenant_id, conversation_id)`. Eventpartitionen, Workerverteilung, Cache Keys und spätere Broker Keys verwenden diese Grenze. Es gibt keine tenantübergreifende fachliche Transaktion.

## 12. Implementierungsstruktur

```text
src/
  modules/
    tenancy-auth/{domain,application,infrastructure,api}
    channel-ingress/{domain,application,infrastructure,api}
    conversation-runtime/{domain,application,infrastructure,api}
    eventing/{domain,application,infrastructure}
    audit/{application,infrastructure,api}
  platform/
    db/
    observability/
    http/
  app.ts
  worker.ts
migrations/
test/
  contract/
  integration/
  security/
  concurrency/
```

Domaincode importiert weder Fastify noch Kysely noch Provider-SDKs. Application Commands tragen `TenantContext`, `ActorContext`, `requestId`, `idempotencyKey` und gegebenenfalls `expectedVersion`. Infrastruktur implementiert Repositories und Transaction Boundary.

## 13. Reihenfolge der Umsetzung

### Paket 1 – Walking Skeleton

- TypeScript/Fastify/Postgres/Docker-Compose, Health Checks, strukturierte Logs.
- SQL-Migrationsrunner und produktionsähnliche DB-Rollen.
- OIDC-kompatible Testtokens und Tenant-Kontext.

**Abnahme:** ein Request schreibt und liest ausschließlich im eigenen Tenant; Cross-Tenant-Negativtest schlägt an API und DB fehl.

### Paket 2 – Conversation Runtime

- Actors, Conversations, Participants, Ownership, Commitments.
- Domain-Invarianten, optimistic concurrency und REST/OpenAPI.
- Current State plus Domain Events/Audit atomar.

**Abnahme:** vollständiger manueller Lifecycle mit stabiler Timeline und mindestens 409-Test bei konkurrierender Mutation.

### Paket 3 – Channel Ingress

- kanonischer Adapterport und zwei Fixture-Adapter mit unterschiedlicher Providerform.
- Connector→Tenant-Bindung, Thread Link, Receipt, Payload Hash, Replay.
- Interaction und Participant-Auflösung nur mit deterministischen Fixture-Regeln.

**Abnahme:** zehn gleiche Events erzeugen eine Interaction; gleicher Key mit anderem Payload erzeugt Konflikt; Out-of-order wird sichtbar, ohne Zustand zu korrumpieren.

### Paket 4 – Outbox und Audit

- Worker, Retry, Dead Letter, Consumer Receipt.
- Audit Query und sicherer Export.
- End-to-end Tracing und SLO-Metriken.

**Abnahme:** Crash nach Publish/vor Mark-as-published führt zu doppelter Zustellung, aber nur einer Consumer-Wirkung; vollständige Correlation ist rekonstruierbar.

### Paket 5 – Hardening

- RLS-Mutationstests, Cross-Tenant-FK-Tests, Fuzzing der Schemas.
- Parallelitäts-, Replay-, Lösch-/Redaktions- und Outbox-Lasttests.
- Threat Model und Restore Drill.

**Abnahme:** definierte Quality Gates in Abschnitt 14.

## 14. Quality Gates

- 0 erfolgreiche Cross-Tenant-Lese-, Schreib- oder Verknüpfungsversuche in automatisierten Negativtests.
- 10.000 Replays desselben Provider-Events erzeugen genau eine fachliche Interaction.
- 100 parallele Ownership-Commands mit derselben erwarteten Version erzeugen genau einen Erfolg und nachvollziehbare Konflikte.
- Jede fachliche Mutation hat Domain Event, Audit Entry und Outbox Record oder gar keine dieser Wirkungen.
- Outbox-Crash-/Retry-Test verliert kein committed Event.
- Timeline-Cursor liefert stabile, nicht doppelte Reihenfolge.
- Kein Kommunikationsinhalt, JWT oder Secret in Test-Logs und Traces.
- Löschung/Redaktion eines Content Records lässt minimale, nicht inhaltliche Ereignis- und Auditnachweise bestehen.
- OpenAPI-Contract Tests und Event-Schema-Fixtures sind versionskontrolliert.
- Lokaler Start, Migration, Seed und vollständiger Testlauf sind dokumentiert und reproduzierbar.

Leistungsziel für den lokalen Slice, kein Produktions-SLA: 100 kanonische Ingress-Events pro Sekunde für fünf Minuten auf Entwicklerhardware ohne Verlust; P95 Commit-to-Outbox-ready unter 250 ms bei kleinen Textpayloads. Das Ziel prüft Architekturfehler, nicht Marketing-Skalierung.

## 15. Bewusste Risiken

- PostgreSQL-Outbox kann bei großem Fan-out zum Engpass werden; die Messpunkte für Ablösung sind definiert.
- RLS schützt nicht vor falsch ausgestellten JWTs oder fehlerhaften Service-Credentials; deshalb bleibt Application AuthZ Pflicht.
- Current State plus Event Log verlangt sorgfältige Transaktionen und Schema-Evolution; Contract- und Atomizitätstests sind nicht optional.
- Conversation als einziger Koordinationskontext kann später zu breit sein; neue Aggregate dürfen erst nach empirischer Grenzbeobachtung entstehen.
- Redigierte statt vollständiger Raw Payloads begrenzen Debugging; kurze, kontrollierte Quarantäne-Retention ist der Kompromiss.
- Ein modularer Monolith kann ohne Importregeln erodieren; Architecture Tests und Modulownership müssen vor dem zweiten Produktteam eingeführt werden.

## 16. Endentscheidung

Der Vertical Slice wird gebaut, aber als **Conversation Runtime**, nicht als Inbox. Er beweist die schwierigen Infrastruktur-Eigenschaften zuerst: Tenant-Isolation, fachliche Idempotenz, explizite Verantwortung, strukturierte Zusagen, überprüfbare Historie und replayfähige Events.

Wir investieren noch nicht in verteilte Infrastruktur. Wir investieren in Verträge, Invarianten und Beweise, die auch nach einer späteren Verteilung bestehen bleiben. Damit ist die Architektur klein genug für ein kleines Team und zugleich ein glaubwürdiger Anfang einer globalen Communication Control Plane.
