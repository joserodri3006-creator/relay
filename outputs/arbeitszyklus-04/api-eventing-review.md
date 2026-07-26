# Arbeitszyklus 04 – API-, Adapter- und Eventing-Review

**Rollen:** API Designer, Data Engineer, Chief Software Architect  
**Review-Stand:** 2026-07-21  
**Scope:** kleinster produktionsnaher Adaptervertrag, versionierte OpenAPI-Surface sowie atomarer Domain-Event-/Audit-/Outbox-Schreibpfad  
**Nicht im Scope:** produktiver Versand, Kafka, öffentliche Webhook-Verwaltung, Event Sourcing, SDK-Generierung, neue UI-Funktionen

## 1. Entscheidung

Im Zyklus 04 wird kein neuer Produktumfang gebaut. Der vorhandene Vertical Slice erhält stattdessen eine belastbare Schreib- und Integrationsgrenze:

1. Die öffentliche Ressource bleibt vorerst `case`, damit die bestehende UI nicht gleichzeitig migriert werden muss; die API wird verbindlich unter `/api/v1` versioniert.
2. Provider werden hinter einen internen, versionierten `ChannelAdapterV1` gestellt. Adapter liefern ausschließlich ein kanonisches Ingress-Kommando; sie dürfen keine Domain-Tabellen verändern.
3. Jede fachliche Mutation schreibt **Current State, Domain Event, Audit Entry und Outbox Record in genau einer PostgreSQL-Transaktion**.
4. OpenAPI wird aus denselben Zod-Schemata generiert, die Fastify zur Laufzeit validiert. Eine handschriftliche zweite Vertragswahrheit wird abgelehnt.
5. Die Outbox wird jetzt vollständig auf der Write-Seite implementiert und durch einen kleinen Polling-Worker beweisbar gemacht. Ein externer Broker und öffentliches Webhook-Management bleiben außerhalb dieses Zyklus.

Das ist der kleinste Schritt, der den Kern von „weitere Inbox“ zu „verlässliche Kommunikationsschicht“ bewegt: Zustandsänderung und Integrationssignal können nicht auseinanderfallen.

## 2. Befund im aktuellen Code

### 2.1 Was bereits tragfähig ist

- `/api/v1` ist bereits als URI-Version vorhanden.
- Zod validiert Ingress und Commands.
- Mutationen nutzen `If-Match` und eine monotone Conversation-Version.
- Der Ingress bündelt Conversation, Interaction, Timeline und Receipt bereits in einer DB-Transaktion.
- Provider-Retry mit gleichem Payload und Konflikt bei abweichendem Payload ist im Happy Path getestet.
- Jede Query enthält explizit `tenant_id`; das ist eine brauchbare Vorstufe, aber noch kein RLS-Beweis.

### 2.2 Blockierende Risiken

| Priorität | Befund | Konkrete Stelle | Auswirkung |
|---|---|---|---|
| P0 | Interaktive Mutationen und Timeline-Event sind nicht atomar | `app.ts:145–207` | Zustand kann committed sein, obwohl Event-Schreiben fehlschlägt; Historie, Audit und Integrationen widersprechen dem Current State. |
| P0 | Commitment-Erzeugung/-Abschluss besteht aus drei unabhängigen Writes | `app.ts:187–206` | Version kann steigen, obwohl Commitment fehlt; Commitment kann geändert sein, obwohl Timeline fehlt. |
| P0 | Status-Invariante hat ein Race | `app.ts:167–176` | Zwischen Prüfung offener Commitments und Statusupdate kann parallel ein Commitment entstehen. |
| P0 | Es existieren weder Audit- noch Outbox-Tabellen | `db.ts` | Keine vollständige Nachvollziehbarkeit und kein sicherer Integrationspfad. |
| P1 | Ingress-Deduplizierung ist nicht connector-spezifisch | `ingress_receipts` unique `(tenant_id, provider_event_id)` | Zwei Provider/Connectoren mit gleicher Event-ID kollidieren. Richtig ist `(tenant_id, connector_id, provider_event_id)`. |
| P1 | Duplicate-Check findet vor der Transaktion statt | `app.ts:113–123` | Zwei parallele Retries können beide „neu“ sehen; ein Unique-Fehler wird wahrscheinlich als 500 statt deterministisches Duplicate-Ergebnis sichtbar. |
| P1 | Domain Event und UI-Timeline sind dieselbe Tabelle | `timeline_events` | Externe Verträge, UI-Darstellung, Audit und PII-Retention werden unkontrolliert gekoppelt. |
| P1 | Eventreihenfolge ist nicht eindeutig | `timeline_events` ohne `event_index`, Anzeige nach `occurred_at,id` | Mehrere Events derselben Aggregatversion besitzen keine fachlich garantierte Reihenfolge. |
| P1 | Eventpayload enthält Commitment-Beschreibung | `app.ts:190` | Kommunikationsinhalt landet in unveränderlicher Historie und später in der Outbox. |
| P1 | Ingress verwendet einen Benutzer-Editor als Actor | `/api/v1/ingress/events` plus `requireEditor` | Provider-Aufnahme wird fälschlich einem Menschen zugeschrieben; Connector-Authentisierung und Tenantauflösung fehlen. |
| P1 | API-Routen besitzen keine Fastify Response-/Request-Schemas | alle Routen | OpenAPI kann nicht zuverlässig generiert werden; TS-Casts validieren Query/Params nicht. |
| P2 | `owner_actor_id` und Assignee-FKs sind nicht tenant-komposit | `db.ts:27,42–43` | Die Anwendung filtert zwar, die DB verhindert eine Cross-Tenant-Referenz aber nicht vollständig. |

**Release Gate:** Keine weitere fachliche Mutation hinzufügen, bevor P0 geschlossen und der Fehlerpfad „State-Write erfolgreich, Event-Write fehlschlägt“ durch Rollback-Test bewiesen ist.

## 3. Kleinster versionierter Adaptervertrag

### 3.1 Grenze

Ein Adapter kennt Providerauthentisierung und Providerpayload. Der Core kennt nur ein kanonisches Ingress-Kommando. Der Adapter darf:

- Signatur, Timestamp und Replay-Fenster prüfen,
- Providerfelder normalisieren,
- einen stabilen Deduplizierungsschlüssel ableiten,
- Providerfähigkeiten deklarieren.

Er darf nicht:

- Tenant-IDs aus dem Providerpayload übernehmen,
- Conversations direkt finden oder erzeugen,
- Status, Ownership oder Commitments setzen,
- Domain Events oder Outbox Records selbst schreiben.

### 3.2 TypeScript-Port v1

```ts
export type ChannelAdapterV1 = {
  readonly contractVersion: "1";
  readonly provider: string;
  capabilities(): Readonly<{
    inbound: true;
    outbound: boolean;
    deliveryReceipts: boolean;
    attachments: boolean;
  }>;
  verify(request: RawProviderRequest, connector: ConnectorSecretView): Promise<VerifiedProviderRequest>;
  normalize(request: VerifiedProviderRequest): Promise<CanonicalIngressV1[]>;
};

export type CanonicalIngressV1 = {
  schemaVersion: 1;
  connectorId: string;            // aus Route/gespeichertem Connector, nicht aus Payload
  provider: string;
  providerEventId: string;
  providerThreadId: string;
  providerMessageId?: string;
  occurredAt: string;
  receivedAt: string;
  interaction: {
    direction: "inbound" | "outbound";
    kind: "text" | "voice" | "system";
    channel: "email" | "whatsapp" | "api" | "voice" | "other";
    senderExternalId?: string;
    senderDisplayName?: string;
    subject?: string;
    bodyText?: string;
  };
  source: {
    payloadSha256: string;         // Hash über kanonisch normalisierte relevante Felder
    providerSchema?: string;
  };
};
```

Der Core-Port lautet:

```ts
ingest(command: CanonicalIngressV1, context: {
  tenantId: string;               // aus Connector-Storage
  principal: { type: "connector"; id: string };
  requestId: string;
  correlationId: string;
}): Promise<IngressResultV1>;
```

### 3.3 Versionsregeln

- `contractVersion` versioniert das Adapter-Interface; `schemaVersion` den kanonischen Payload.
- V1-Felder sind additiv erweiterbar. Neue optionale Felder brechen V1 nicht.
- Bedeutungsänderung, Pflichtfeldänderung oder Enum-Entfernung erfordert V2.
- Ein Adapterpaket exportiert explizit `createAdapterV1`; keine dynamischen Importe aus Core-Interna.
- Der Core unterstützt höchstens zwei aufeinanderfolgende Major-Versionen während eines Übergangs.
- Provider-Rohpayload wird standardmäßig nicht dauerhaft gespeichert. Nur Hash, sichere Referenzen und explizit erlaubte Diagnosemetadaten bleiben erhalten.

## 4. OpenAPI-Surface v1

### 4.1 Öffentliche Oberfläche dieses Zyklus

| Methode | Pfad | Zweck | Idempotenz/Konkurrenz | Erfolgsantwort |
|---|---|---|---|---|
| `GET` | `/api/v1/cases` | Attention-/Status-Sicht | Cursor später; bestehende Filter bleiben | `200 CaseSummary[]` |
| `GET` | `/api/v1/cases/{caseId}` | Current State plus eingebettete Timeline für UI v1 | `ETag: "<version>"` | `200 CaseDetail` |
| `PUT` | `/api/v1/cases/{caseId}/owner` | Owner setzen/lösen | Pflicht: `If-Match`; empfohlen: `Idempotency-Key` | `200 MutationResult` |
| `PATCH` | `/api/v1/cases/{caseId}/status` | Status ändern | Pflicht: `If-Match`; empfohlen: `Idempotency-Key` | `200 MutationResult` |
| `POST` | `/api/v1/cases/{caseId}/commitments` | Commitment anlegen | Pflicht: `If-Match` und `Idempotency-Key` | `201 MutationResult` |
| `PATCH` | `/api/v1/cases/{caseId}/commitments/{commitmentId}` | Commitment finalisieren | Pflicht: `If-Match` und `Idempotency-Key` | `200 MutationResult` |
| `GET` | `/api/v1/cases/{caseId}/events` | stabile Domain-Event-Historie | Cursor `(aggregateVersion,eventIndex)` | `200 EventPage` |
| `GET` | `/api/v1/audit-entries` | risikobasierter Audit-Read, Admin/Compliance | Filter nach Subject, Actor, Zeit; Cursor | `200 AuditPage` |

Der bestehende UI-Endpunkt `POST /api/v1/ingress/events` wird als Demo-Fixture markiert und nicht als öffentlicher Kundenvertrag dokumentiert. Der produktionsnahe interne Pfad ist:

| Methode | Pfad | Auth | Ergebnis |
|---|---|---|---|
| `POST` | `/internal/v1/connectors/{connectorId}/events` | Adapter-/Connector-Credential oder interner Adapter-Call | `202` neu, `200` identisches Replay, `409` gleicher Key/anderer Hash |

### 4.2 Einheitliche Mutation Response

```json
{
  "data": {
    "caseId": "019f...",
    "resourceId": "019f...",
    "version": 7
  },
  "meta": {
    "requestId": "req_01...",
    "correlationId": "cor_01..."
  }
}
```

Antwortheader: `ETag: "7"`. Schreibende Clients müssen den neuen ETag übernehmen.

### 4.3 Problem Details

Content-Type: `application/problem+json`.

```json
{
  "type": "https://docs.example.invalid/problems/version-conflict",
  "title": "Version conflict",
  "status": 409,
  "code": "VERSION_CONFLICT",
  "requestId": "req_01...",
  "details": { "expectedVersion": 6, "actualVersion": 7 }
}
```

Stabile Codes in v1: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`, `NOT_FOUND`, `VERSION_REQUIRED`, `INVALID_VERSION`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `OPEN_COMMITMENTS`, `INVALID_STATUS_TRANSITION`, `CONNECTOR_SIGNATURE_INVALID`.

Keine Fehlermeldung darf Bodytext, Token, Secret oder Provider-Rohpayload spiegeln.

### 4.4 OpenAPI als eine Vertragswahrheit

Empfehlung: Zod-Schema → Fastify Route Schema → generiertes OpenAPI 3.1 via `fastify-type-provider-zod` und `@fastify/swagger`.

Pflicht im CI:

1. API startet und schreibt deterministisch `openapi.json`.
2. Repository-Artefakt wird gegen neu generierte Ausgabe verglichen.
3. Spectral-Regeln prüfen `operationId`, Auth, Fehlerantworten, Tags und Beispiele.
4. Breaking-Change-Check vergleicht gegen letzte veröffentlichte v1-Spezifikation.
5. Ein generierter TypeScript-Testclient führt den Happy Path aus.

`/api/v1/session` und `/api/v1/actors` dürfen als UI-/Identity-Hilfsendpunkte dokumentiert sein, sind aber nicht Teil eines zukünftigen Provider-SDKs.

## 5. Event-, Audit- und Outbox-Modell

### 5.1 Trennung der drei Protokolle

| Record | Zweck | Leser | Enthält PII? | Änderbar? |
|---|---|---|---|---|
| Domain Event | fachliche Tatsache und Integrationsvertrag | Timeline Projection, Automationen, Webhooks | nur minimale IDs/Metadaten | append-only |
| Audit Entry | Wer hat was versucht/ausgeführt? | Security, Compliance, Support | keine Kommunikationsinhalte | append-only |
| Outbox Record | zuverlässige Zustellung eines Domain Events | Worker | Event-Envelope | Zustellstatus änderbar; Payload unverändert |

Die UI-Timeline ist eine Projection aus Domain Events plus Interactions, nicht die Quelle des externen Eventvertrags.

### 5.2 Minimale Tabellen

```sql
CREATE TABLE domain_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  aggregate_type text NOT NULL CHECK (aggregate_type = 'case'),
  aggregate_id uuid NOT NULL,
  aggregate_version bigint NOT NULL,
  event_index smallint NOT NULL,
  event_type text NOT NULL,
  schema_version integer NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('user','connector','system','ai_agent')),
  actor_id uuid NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  causation_id uuid NULL,
  data jsonb NOT NULL,
  UNIQUE (tenant_id, aggregate_id, aggregate_version, event_index),
  FOREIGN KEY (tenant_id, aggregate_id) REFERENCES conversations(tenant_id, id)
);

CREATE TABLE audit_entries (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  category text NOT NULL,
  action text NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid NULL,
  subject_type text NOT NULL,
  subject_id uuid NULL,
  result text NOT NULL CHECK (result IN ('success','denied','failed')),
  reason_code text NULL,
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  domain_event_id uuid NOT NULL UNIQUE REFERENCES domain_events(id),
  topic text NOT NULL,
  partition_key text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  leased_until timestamptz NULL,
  published_at timestamptz NULL,
  dead_lettered_at timestamptz NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_ready_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL AND dead_lettered_at IS NULL;
```

Zusätzlich im selben Migration Slice:

- `conversations.version` und `timeline_events.aggregate_version` auf `bigint`.
- Composite FKs für Owner, Assignee, Creator und Source Interaction.
- Receipt unique `(tenant_id, connector_id, provider_event_id)`.
- Optional erst später: Partitionierung. Sie bringt bei MVP-Volumen keinen Nutzen.

### 5.3 Domain Event Envelope v1

```json
{
  "specVersion": "1.0",
  "id": "019f...",
  "type": "case.commitment.created",
  "schemaVersion": 1,
  "tenantId": "019f...",
  "aggregate": {
    "type": "case",
    "id": "019f...",
    "version": 7
  },
  "sequence": 0,
  "occurredAt": "2026-07-21T09:20:14.238Z",
  "recordedAt": "2026-07-21T09:20:14.251Z",
  "actor": {
    "type": "user",
    "id": "019f..."
  },
  "requestId": "req_01...",
  "correlationId": "cor_01...",
  "causationId": null,
  "data": {
    "commitmentId": "019f...",
    "assigneeActorId": "019f...",
    "dueAt": "2026-07-21T14:00:00.000Z"
  }
}
```

Regeln:

- `sequence` ist der Eventindex innerhalb einer Aggregatversion, nicht eine globale Reihenfolge.
- `partition_key = tenantId + ':' + aggregate.id`; dadurch bleibt Aggregatreihenfolge brokerfähig.
- `data` enthält keine Commitment-Beschreibung und keinen Interaction-Body.
- `occurredAt` bezeichnet den fachlichen Zeitpunkt; `recordedAt` den Persistenzzeitpunkt.
- Eine Eventart ändert bestehende Feldbedeutungen nie. Breaking Change: neue `schemaVersion` und Übergangszeit.
- Zustellung ist at least once. Consumers deduplizieren über Event-ID.

Erste veröffentlichbare Typen (die Version steht ausschließlich in `schemaVersion`, nicht zusätzlich im Typnamen):

- `case.opened`
- `case.reopened`
- `case.interaction.recorded`
- `case.owner.assigned`, `case.owner.released`
- `case.status.changed`
- `case.commitment.created`, `case.commitment.fulfilled`, `case.commitment.cancelled`

## 6. Atomarer Write-Pfad

### 6.1 Gemeinsamer Application-Service-Port

Alle HTTP-Handler werden dünn. Sie validieren, authentisieren und rufen einen Command Handler. Nur dieser darf fachlich schreiben:

```ts
executeCaseCommand<T>(context, command, async (tx, lockedCase) => {
  // 1. Invarianten gegen gesperrten Current State prüfen
  // 2. Current State ändern
  // 3. Domain Events erzeugen
  // 4. Audit Success erzeugen
  // 5. pro Domain Event einen Outbox Record erzeugen
  // alles vor COMMIT
  return result;
});
```

### 6.2 Konkrete Transaktionsfolge: Commitment erzeugen

```text
BEGIN
  SET LOCAL app.tenant_id = :tenantId
  SELECT id, version, status
    FROM conversations
   WHERE tenant_id=:tenantId AND id=:caseId
   FOR UPDATE

  wenn nicht gefunden -> ROLLBACK / 404
  wenn version != If-Match -> ROLLBACK / 409
  Assignee unter demselben Tenant validieren

  INSERT commitments (...)
  UPDATE conversations
     SET version=version+1, updated_at=now()
   WHERE tenant_id=:tenantId AND id=:caseId

  INSERT domain_events (... aggregate_version=:oldVersion+1, event_index=0 ...)
  INSERT audit_entries (... result='success', action='commitment.create' ...)
  INSERT outbox_events (... domain_event_id=:eventId, payload=:sameEnvelope ...)
COMMIT
```

Jeder Fehler vor dem Commit rollt alles zurück. Ein 2xx wird erst nach erfolgreichem Commit gesendet.

### 6.3 Denial-/Failure-Audit

Ein denied/failed Audit kann naturgemäß nicht in derselben zurückgerollten Fachtransaktion bleiben. Deshalb:

- **Success Audit:** atomar mit Domainmutation.
- **AuthN-/AuthZ-Denial:** separater, best-effort Security-Audit außerhalb der Fachtransaktion; kein Domain Event/Outbox.
- **Fachlicher Konflikt** (`VERSION_CONFLICT`, `OPEN_COMMITMENTS`): strukturierte Metrik; optional separater Audit nur bei Compliance-Bedarf.
- Audit-Ausfall darf AuthZ niemals öffnen. Für verpflichtende Security-Audits gilt fail closed.

### 6.4 Ingress-Race sicher behandeln

Statt Read-before-Insert außerhalb der Transaktion:

1. Transaktion starten.
2. Receipt mit `(tenant, connector, providerEventId)` insertieren.
3. Bei Unique-Konflikt vorhandenes Receipt lesen:
   - gleicher kanonischer Hash und `status=processed`: deterministisches ursprüngliches Ergebnis zurückgeben;
   - anderer Hash: `409 IDEMPOTENCY_CONFLICT`;
   - `processing`: kurz retryen oder `202 processing` mit Receipt-ID liefern.
4. Thread/Conversationzeile mit eindeutiger Thread-Constraint erzeugen oder sperren.
5. State, Interaction, Events, Audit, Outbox und Receipt-Ergebnis committen.

Ein unkontrollierter Unique-Constraint-Fehler darf niemals als 500 nach außen gelangen.

### 6.5 Outbox Worker v1

Minimaler Worker, gleicher Deployable, separater Prozess:

```sql
SELECT id
FROM outbox_events
WHERE published_at IS NULL
  AND dead_lettered_at IS NULL
  AND available_at <= now()
  AND (leased_until IS NULL OR leased_until < now())
ORDER BY available_at, created_at
FOR UPDATE SKIP LOCKED
LIMIT 50;
```

Lease setzen, Transaktion committen, publizieren, dann `published_at` setzen. Bei Fehler `attempts+1`, exponentielles Backoff mit Jitter; nach z. B. 12 Versuchen Dead Letter plus Alert. Ein Crash nach Publikation und vor Markierung erzeugt ein Duplikat – das ist korrektes at-least-once-Verhalten.

Für diesen Zyklus reicht ein In-Memory-Testtransport oder ein lokaler HTTP-Testconsumer. Der Transport-Port bleibt später gegen Kafka, Pub/Sub oder Webhook Dispatcher austauschbar.

## 7. Erforderliche Tests

### 7.1 P0-Integrationstests mit echtem PostgreSQL

PGlite-Happy-Path bleibt schnell, kann RLS und Produktions-Concurrency aber nicht abschließend beweisen. Folgende Tests laufen zusätzlich über Testcontainers/PostgreSQL:

| Test | Setup | Erwartung |
|---|---|---|
| `mutation_is_atomic_when_event_insert_fails` | Domain-Event-Insert absichtlich per Constraint/Hook fehlschlagen lassen | Conversation-Version und fachlicher State unverändert; kein Audit, keine Outbox. |
| `mutation_is_atomic_when_outbox_insert_fails` | Outbox-Insert fehlschlagen lassen | State, Domain Event und Success Audit vollständig zurückgerollt. |
| `status_and_commitment_race_preserves_invariant` | Parallel „resolve“ und „create commitment“ gegen dieselbe Version | Genau eine Mutation gewinnt; nie resolved plus offenes Commitment. |
| `parallel_identical_ingress_is_effectively_once` | 20 parallele Requests gleicher Connector/Event-ID | Eine Interaction, ein Receipt, ein Eventset; alle Antworten deterministisch 200/202, kein 500. |
| `same_provider_id_on_two_connectors_is_valid` | gleiche Provider-ID, verschiedene Connectoren | Zwei getrennte Receipts/Interactions gemäß Threadmapping. |
| `same_key_different_payload_conflicts` | gleicher Connector/Event-Key, anderer normalisierter Payload | 409; keine zweite Wirkung. |
| `outbox_retries_at_least_once` | Worker nach erfolgreichem Publish vor Ack beenden | Event wird erneut geliefert; Consumer dedupliziert per Event-ID. |
| `aggregate_order_is_stable` | Mutation erzeugt mehrere Events | eindeutig `(version,event_index)`; Consumer sieht Aggregatreihenfolge. |
| `tenant_rls_fails_closed` | Query ohne oder mit fremdem `app.tenant_id` | null/denied; kein Datensatz sichtbar oder änderbar. |
| `cross_tenant_fk_is_rejected` | fremden Owner/Assignee referenzieren | DB-Constraint schlägt unabhängig von Application Check fehl. |

### 7.2 Contract-Tests

- Jede Route validiert Params, Query, Body und Response über dasselbe Schema.
- Jeder dokumentierte Fehlercode besitzt ein OpenAPI-Beispiel.
- Generierte Spezifikation ist deterministisch und im CI unverändert.
- Breaking-Change-Tool blockiert Entfernen/Pflichtverschärfen in v1.
- Adapter-Fixture-Tests pro Provider prüfen Signatur, Normalisierung, fehlende Felder, Replay-Timestamp und PII-Redaktion.
- Envelope-Snapshots prüfen nur Vertrag, keine zufälligen IDs/Timestamps.

### 7.3 Observability-Akzeptanz

- Jeder Request trägt `requestId` und `correlationId` bis Domain Event und Outbox.
- Metriken: ingress accepted/duplicate/conflict, command conflict, outbox backlog age, publish retries, dead letters.
- Logs enthalten IDs und Reason Codes, aber keine Bodies, Authorization Header oder Connector Secrets.

## 8. Gegenpositionen und offene Diskussion

### Gegenposition 1 – Data Engineer: „Volle Outbox erst bei externem Consumer“

**Argument:** Ohne produktiven Broker oder Webhook-Kunden erzeugen Tabelle und Worker nur Betriebscode. Timeline reicht bis zum ersten Integrationskunden.

**Widerspruch:** Der aktuelle Code beweist genau die gefährliche Zwischenform: Mutation und Timeline fallen auseinander. Wird die atomare Ereignisgrenze später nachgerüstet, müssen alle Handler erneut umgebaut und historische Lücken erklärt werden. Die Write-Seite der Outbox ist klein und definiert heute den dauerhaften Integrationsvertrag.

**Entscheidung:** Domain Event plus Outbox-Record jetzt atomar schreiben; Transport zunächst minimal. Keine Brokerplattform und kein öffentliches Subscription-Management.

### Gegenposition 2 – Chief Architect: „Event Sourcing wäre ehrlicher“

**Argument:** Eine Communication Control Plane lebt von Historie. Events sollten die einzige Wahrheit sein, Current State nur Projection.

**Widerspruch von Security/Product:** Löschung und Redaktion von Kommunikationsinhalten, Event-Upcasting, Projection-Rebuilds und Snapshotting würden den MVP dominieren. Für Ownership, Status und Commitments ist normalisierter Current State einfacher, während minimale Events trotzdem Audit und Automationen treiben.

**Entscheidung:** Transactional state plus immutable minimal domain events. Kein Event Sourcing. Der Envelope bleibt hochwertig genug, um später einzelne Module event-sourced zu bauen.

### Gegenposition 3 – API Designer: „OpenAPI handschriftlich zuerst“

**Argument:** Contract-first verhindert, dass interne Zod-/Fastify-Details die API formen; Design kann unabhängig reviewt werden.

**Widerspruch von QA/Engineering:** Im kleinen Team entsteht sofort eine zweite Wahrheit. Der aktuelle Code hat bereits Laufzeitschemata; ein manueller YAML-Vertrag würde ohne Response-Validation leicht driften.

**Entscheidung:** Contract-first im Review, aber executable schemas als Source of Truth. Zod definiert Request/Response, Fastify erzwingt sie, OpenAPI wird generiert und mit Breaking-Change-Gates geschützt.

### Gegenposition 4 – Product/Frontend: „Jetzt von `/cases` auf `/conversations` migrieren“

**Argument:** Das ADR nennt Conversation das Kernaggregat; inkonsistente Begriffe werden später teuer.

**Widerspruch von API/Delivery:** Eine gleichzeitige Ressourcen-, UI- und Datenmigration erhöht Zyklusrisiko, ohne Atomicity oder Providerneutralität zu verbessern. Außerdem ist noch nicht empirisch entschieden, ob „Case“ nur UI-Begriff oder langlebiges Work-Object wird.

**Entscheidung:** v1 bleibt `/cases`; interne Tabelle darf vorerst `conversations` heißen. Vor öffentlicher Beta wird per ADR endgültig entschieden. Keine parallelen Alias-Endpunkte veröffentlichen.

### Gegenposition 5 – Platform/DevOps: „Kafka sofort, weil Events das Produkt sind“

**Argument:** Bursty Channel-Ingress und mehrere zukünftige Consumer benötigen Partitionen, Replay und unabhängige Skalierung.

**Widerspruch von Finance/Architect:** Kafka beseitigt weder DB/Broker-Dual-Write noch Consumer-Deduplizierung. Es erweitert den Betriebsraum, bevor Durchsatz, Replay-Fenster oder mehrere Teams ihn rechtfertigen.

**Entscheidung:** PostgreSQL-Outbox plus Transport-Port. Broker erst bei gemessenem Backlog/Throughput, mehreren unabhängigen Consumer-SLAs oder langem Replaybedarf.

## 9. Umsetzungspakete und Reihenfolge

### Paket A – Atomic Write Kernel (zuerst)

- Migrationen für `domain_events`, `audit_entries`, `outbox_events`, Composite FKs und connector-spezifische Receipts.
- `executeCaseCommand` mit DB-Transaktion und gesperrter Conversation.
- Owner-, Status- und Commitment-Handler darauf migrieren.
- P0-Rollback- und Concurrency-Tests.

**Exit:** Kein fachlicher 2xx ohne Current State + Domain Event + Success Audit + Outbox in derselben Transaktion.

### Paket B – Executable OpenAPI

- Schemas für Params, Query, Headers, Body, Response und Problem Details.
- Response-Validation und ETag.
- OpenAPI 3.1 generieren, CI-Diff und Breaking-Change-Gate.

**Exit:** Jeder vorhandene v1-Endpunkt ist maschinenlesbar dokumentiert und contract-getestet.

### Paket C – Adapter Port und Ingress Race

- Connector-Principal und Connector→Tenant-Auflösung.
- `ChannelAdapterV1`, ein bestehendes Demo-Email-Fixture als erster Adapter.
- Receipt-Claim innerhalb der Transaktion und Parallel-Retry-Test.

**Exit:** Providerformat berührt den Domain Service nicht; 20 parallele Retries wirken einmal und liefern keinen 500er.

### Paket D – Outbox Relay

- kleiner Worker, Lease/Retry/Jitter/Dead Letter.
- Testtransport und idempotenter Testconsumer.
- Backlog-/Retry-Metriken und Alert-Schwellen.

**Exit:** Crash nach Publish vor Ack erzeugt höchstens ein deduplizierbares Duplicate, keinen Eventverlust.

## 10. Skalierungsprüfung

| Dimension | MVP-Entscheidung | Skalierungsweg ohne Vertragsbruch |
|---|---|---|
| Providerzahl | Adapter V1 als Port | neue Adapterpakete; zwei Contract-Majors parallel |
| Write-Volumen | PostgreSQL-Transaktion + Outbox | DB-Indizes, tenant-/zeitbasierte Partitionierung, Read Replicas für Reads |
| Consumerzahl | Transport-Port/Testconsumer | Kafka/PubSub hinter demselben Envelope und Partition Key |
| Mandanten | `tenant_id` überall + Composite FKs; RLS im Produktionsslice | Sharding/Regionen über Tenant-Routing |
| Event-Evolution | schemaVersion, additive Felder | parallele Versionen und Consumer Compatibility Matrix |
| Compliance | minimale Events; Inhalt separat | Retention/Redaction ohne Zerstörung fachlicher Metadaten |
| Teamgröße | modularer Monolith | Module anhand gemessener Last/Ownership extrahierbar |

## 11. Nicht verhandelbare Definition of Done

Der Zyklus ist erst abgeschlossen, wenn:

- alle bestehenden fachlichen Mutationen den atomaren Write Kernel verwenden;
- ein absichtlich fehlschlagender Event- oder Outbox-Insert den fachlichen State vollständig zurückrollt;
- gleiche parallele Ingress-Events genau eine fachliche Wirkung haben;
- jedes veröffentlichte Event eine minimale, versionierte Envelope besitzt;
- OpenAPI aus den produktiv validierten Schemata generiert wird;
- kein Domain Event Bodytext oder Commitment-Beschreibung enthält;
- Outbox-Zustellung explizit at least once ist und ein Consumer-Dedupe-Test besteht;
- mindestens drei Gegenpositionen dokumentiert und entschieden sind.

Danach ist der Kern bereit für den ersten echten **read-only** Provideradapter. Outbound Send, Workflow Engine und AI-Agenten bleiben weiterhin hinter dieser Konsistenzgrenze und dürfen sie nicht umgehen.
