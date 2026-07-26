# Arbeitszyklus 04 — Security-, Enterprise- und DevOps-Review

**Stand:** 21. Juli 2026  
**Scope:** aktueller Vertical Slice in `src/server`; atomare Audit-/Outbox-Grenze, Tenant Isolation/RLS, Authentisierung/Autorisierung, PII, Replay und Failure Handling  
**Review-Modus:** Code- und Architekturprüfung; keine Implementierungsdateien verändert

## 1. Entscheidung

Der Slice ist eine gute lokale Produktdemo, aber **nicht pilotfähig mit realen Kommunikationsdaten**. Der nächste Zyklus darf nicht als breites „Produktionshärtungs“-Programm verstanden werden. Er muss eine engere Sicherheitsinvariante beweisen:

> Jede autorisierte Mutation eines Tenants schreibt Current State, minimales Domain Event, Audit Entry und Outbox Record entweder vollständig in genau einer PostgreSQL-Transaktion oder gar nicht; die Datenbank verhindert tenantfremde Reads und Beziehungen unabhängig vom Anwendungscode.

**Freigabeentscheidung:**

- Lokale Demo mit synthetischen Daten: **freigegeben**.
- Interner Test mit anonymisierten Fixtures: **freigegeben**.
- Reale PII, externer Provider-Ingress oder Design-Partner-Zugang: **gesperrt**, bis die P0-Gates in Abschnitt 7 erfüllt sind.
- Kubernetes, Kafka, SOC-2-Artefaktproduktion und vollständige Enterprise-SSO-Oberfläche: **nicht Teil dieses Zyklus**.

## 2. Befunde nach Risiko

### Kritisch — Fachlicher Zustand und Historie sind nicht atomar

Der Ingress nutzt bereits eine Transaktion (`app.ts:123–140`). Die übrigen Mutationen tun das nicht:

- Owner-Update committet vor Timeline-Eintrag (`app.ts:155–157`).
- Statusänderung committet vor Timeline-Eintrag (`app.ts:174–176`).
- Commitment-Erstellung erhöht zuerst die Conversation-Version, schreibt danach Commitment und Timeline in separaten Statements (`app.ts:187–190`).
- Commitment-Abschluss erhöht zuerst die Version, ändert danach Commitment und Timeline (`app.ts:203–206`).

Ein Fehler zwischen diesen Statements erzeugt beispielsweise eine erhöhte Version ohne Commitment oder einen geänderten Status ohne Historie. Eine nachträglich ergänzte Outbox würde nur einen Teil dieses inkonsistenten Zustands zuverlässig verteilen. Es fehlen außerdem `domain_events`, `audit_entries` und `outbox_events` vollständig, obwohl ADR-003 sie als atomaren Schreibpfad festlegt.

**Konsequenz:** kein Audit-Versprechen, kein zuverlässiger Eventvertrag und kein belastbarer Replay-Pfad.

### Kritisch — Tenant Isolation beruht nur auf korrekten WHERE-Klauseln

Die Queries filtern überwiegend explizit nach `tenant_id`; die Datenbank setzt die Grenze aber nicht durch:

- keine Row-Level-Security-Policies,
- kein `SET LOCAL app.tenant_id`,
- kein separater Runtime-DB-User ohne `BYPASSRLS`,
- kein `FORCE ROW LEVEL SECURITY`,
- PGlite-Test statt eines echten PostgreSQL-RLS-Tests.

Der vorhandene Cross-Tenant-Test (`app.test.ts:76–83`) beweist nur einen API-Read-Pfad. Er beweist weder direkte Repository-Queries, Subqueries, Mutationen, Worker noch RLS-Fail-Closed-Verhalten.

Mehrere Foreign Keys sind zudem nur auf globale IDs gebunden: `conversations.owner_actor_id`, `commitments.assignee_actor_id`, `source_interaction_id` und `created_by_actor_id` (`db.ts:27`, `42–43`). Dadurch kann die Datenbank tenantfremde Beziehungen nicht verhindern. Die Listen-Sortierung enthält sogar eine Subquery ohne Tenant-Prädikat (`app.ts:94`); globale Conversation-UUIDs verhindern heute meist einen sichtbaren Leak, sind aber keine Sicherheitsgrenze.

**Konsequenz:** Ein einziger vergessener Filter oder ein späterer Worker kann Daten tenantübergreifend lesen oder verknüpfen.

### Hoch — Auth ist eine Demo-Verzweigung, keine Vertrauensgrenze

`sessionFrom` akzeptiert zwei statische Bearer-Strings und erzeugt Tenant, Actor und Rolle aus Code (`app.ts:40–46`). Es gibt keine Prüfung von Signatur, Issuer, Audience, Ablauf, Token-ID oder Actor-Status. Die Rolle wird nicht pro Request gegen Tenant-Mitgliedschaft und Deaktivierung geprüft.

Der Provider-Ingress verwendet dieselbe menschliche Editor-Session (`app.ts:108–110`). Damit fehlen Connector-Credential, Provider-Signatur, Timestamp-Fenster, Nonce/Replay-Schutz und eine vertrauenswürdige Connector→Tenant-Zuordnung. `connectorId` stammt aktuell aus dem Payload.

Zusätzlich ist CORS für beliebige Origins aktiviert (`app.ts:60–61`), Rate Limiting fehlt, Logging/Tracing ist deaktiviert und `/api/health` prüft nicht die Datenbank.

**Konsequenz:** Die Demo-API darf nicht öffentlich erreichbar sein. AuthN, Connector-AuthN und Tenant-Auflösung sind derzeit vermischt.

### Hoch — Idempotenz ist bei Konkurrenz und mehreren Connectoren unvollständig

Der Deduplizierungsschlüssel lautet nur `(tenant_id, provider_event_id)` (`db.ts:53–56`), obwohl Provider-IDs nur innerhalb eines Connectors stabil eindeutig sein müssen. Zwei Connectoren desselben Tenants können deshalb kollidieren.

Der Existing-Check liegt vor der Ingress-Transaktion (`app.ts:114–118`). Zwei gleichzeitige erste Requests können beide „neu“ sehen; einer läuft danach auf einen Unique-Constraint und wird voraussichtlich als generischer `500` statt als deterministisches Duplicate/Conflict beantwortet. Es werden weder Verarbeitungsstatus noch ursprünglicher Response gespeichert, sodass sichere Wiederaufnahme nach unklarem Client-Timeout nicht vollständig definiert ist.

`occurredAt` aus dem Payload wird als `created_at` und `updated_at` der Conversation verwendet (`app.ts:122`, `129`, `134`). Ein fehlerhafter, zukünftiger oder alter Provider-Zeitstempel kann Attention-Sortierung und Reihenfolge manipulieren oder zurückdrehen. Außerdem reopenet derzeit auch ein importiertes **outbound** Event einen geschlossenen Case, obwohl das Event als `new_inbound_interaction` begründet wird (`app.ts:133–135`).

**Konsequenz:** Retries funktionieren im seriellen Happy Path, nicht als garantierter Ingress-Vertrag unter Parallelität, Clock Skew und Multi-Connector-Betrieb.

### Hoch — PII ist ungetrennt und ohne Lifecycle gespeichert

Nachrichtenbody, Party-Name, Betreff und Commitment-Beschreibung liegen direkt in operativen Tabellen (`db.ts:24–25`, `34`, `41`). Commitment-Beschreibungen werden zusätzlich vollständig in `timeline_events.data` kopiert (`app.ts:190`). Damit vervielfacht sich löschpflichtiger Inhalt in einer als Historie gedachten Struktur.

Es fehlen:

- separate, redigierbare Content Records,
- Retention-/Deletion-Zustand,
- Datenklassifikation,
- Export-/Löschpfad,
- Schutz vor PII in Logs/Traces und Outbox-Payloads,
- dokumentierte Backup-Retention und Restore-Löschung.

Die API gibt bei Case-Details `SELECT *` für Interactions, Commitments und Events zurück (`app.ts:102–105`). Das erschwert Datenminimierung und macht spätere interne Spalten unbeabsichtigt Teil des API-Vertrags.

**Konsequenz:** Kein Einsatz realer Kommunikationsinhalte, bevor Content-Lifecycle und Event-Minimierung existieren.

### Mittel — Audit ist nicht dasselbe wie Timeline

Die Timeline besitzt weder `request_id`, `correlation_id`, `causation_id`, Ergebnis noch Reason Code. Sie ist nicht gegen Update/Delete geschützt und erfasst abgewiesene Zugriffe nicht. AuthZ-Denials, Idempotency Conflicts, Detail-Reads und Exporte sind für Enterprise-Audit relevant, gehören aber nicht in die fachliche Conversation-Timeline.

**Konsequenz:** Die aktuelle Timeline ist ein Produktverlauf, kein Security- oder Compliance-Audit.

## 3. Drei echte Gegenpositionen gegen die geplante Produktionshärtung

### Gegenposition A — „Outbox-Worker jetzt bauen“ ist die falsche Reihenfolge

**Befürworterargument:** Der Eventvertrag ist Plattformkern; ein Worker demonstriert früh asynchrone Skalierung.

**Widerspruch Security/QA:** Solange Current State, Timeline/Domain Event und Audit nicht in derselben Transaktion entstehen, macht ein Worker Inkonsistenz nur schneller extern sichtbar. Der erste Fehler ist nicht Delivery, sondern Write Atomicity.

**Entscheidung:** Zuerst einen atomaren Command-Pfad für alle vier Mutationen bauen und per Failure Injection beweisen. Danach Outbox Relay. Kein Webhook und kein Broker in diesem Zyklus.

### Gegenposition B — „App-Filter plus spätere RLS-Migration reichen für den Pilot“

**Befürworterargument:** Alle aktuellen Queries tragen `tenant_id`; RLS erhöht lokale Komplexität und kann später ergänzt werden.

**Widerspruch Enterprise/Security:** Die Kommunikationsschicht wird privilegierte, mandantenübergreifend ähnlich strukturierte PII speichern. Genau hier ist ein vergessener Filter ein systemischer Vorfall. Nachträglich RLS einzubauen ist riskanter, weil Repositories und Worker dann bereits implizit auf globale Sicht vertrauen.

**Entscheidung:** Vor realer PII auf echten PostgreSQL wechseln und RLS plus Composite FKs als automatisiertes Gate etablieren. PGlite darf schnelle Unit-/UI-Tests behalten, ist aber keine Sicherheitsqualifikation.

### Gegenposition C — „Vollständiges Enterprise OIDC/SSO zuerst“ überdehnt den Zyklus

**Befürworterargument:** Ohne produktive Identity gibt es keinen sicheren Pilotzugang; SSO ist ein Enterprise-Kaufsignal.

**Widerspruch Architect/Finance:** Vollständige SSO-Konfiguration, SCIM und Admin-UX würden den Zyklus dominieren, lösen aber weder DB-Isolation noch atomare Writes. Ein falsch ausgestelltes Token bliebe trotz SSO gefährlich, wenn die Datenbank global lesen darf.

**Entscheidung:** Jetzt einen kleinen `AuthVerifier`-Port mit strikt verifizierten OIDC-kompatiblen JWT-Fixtures, DB-gebundener Membership und Capability Checks implementieren. Einen realen IdP erst für den konkreten Pilot konfigurieren; SCIM bleibt außerhalb des Slice.

### Gegenposition D — „Unveränderliche Events sollen zur vollständigen Rekonstruktion alle Inhalte tragen“

**Befürworterargument:** Vollständige Payloads erleichtern Replay, Debugging und neue AI-Consumer.

**Widerspruch Privacy/Security:** Unveränderliche PII vervielfacht Lösch-, Retention- und Breach-Flächen. AI-Consumer brauchen erlaubnisgebundene Content-Auflösung, nicht dauerhafte Datenkopien in jedem Event.

**Entscheidung:** Domain Events und Outbox enthalten IDs, Zustände und minimale Metadaten. Nachrichtentext und Commitment-Freitext verbleiben in separat redigierbaren Content-/Fachdaten. Audit enthält niemals Bodies oder Tokens.

### Gegenposition E — „Kubernetes/Kafka beweisen Skalierbarkeit“

**Befürworterargument:** Kommunikationsinfrastruktur muss Lastspitzen und viele Consumer tragen.

**Widerspruch DevOps/Security:** Orchestrator und Broker vervielfachen Secrets, Netzwerkpfade, IAM und Failure Modes, bevor der Transaktionsvertrag stimmt. Skalierbarkeit beginnt hier mit stabiler Partitionierung, Backpressure und Idempotenz, nicht mit Deploymentsymbolik.

**Entscheidung:** Ein API-Prozess, ein separater Outbox-Worker und Managed PostgreSQL reichen. Container, Health/Readiness, Metriken und sichere Konfiguration werden produktionsnah; Kubernetes/Kafka erhalten messbare Einführungstrigger.

## 4. Zielbild der atomaren Grenze

Jeder schreibende Application Service führt innerhalb **einer** Datenbanktransaktion aus:

1. Tenant-Kontext fail-closed setzen.
2. Conversation laden/sperren und erwartete Version prüfen.
3. Capability und tenantgebundene Referenzen prüfen.
4. Fachliche Invarianten prüfen.
5. Current State ändern.
6. Minimales `domain_event` mit `(aggregate_version, event_index)` schreiben.
7. Separates `audit_entry` mit Actor, Request, Result und Reason Code schreiben.
8. `outbox_event` mit eindeutiger `domain_event_id` schreiben.
9. Commit; erst danach HTTP-Erfolg senden.

Bei erwarteten Ablehnungen, die keinen fachlichen State verändern, wird ein sicherheitsrelevantes Audit Entry in einer eigenen kurzen Audit-Transaktion geschrieben. Ein Audit-Ausfall darf eine sensible Aktion fail-closed blockieren; reine öffentliche Health-Checks benötigen kein Audit.

### Erforderliche Datenbankregeln

- Unique Domain Sequence: `(tenant_id, aggregate_id, aggregate_version, event_index)`.
- Unique Outbox: `domain_event_id`.
- Tenantgebundene Composite FKs für Owner, Assignee, Creator, Source Interaction und alle Conversation-Referenzen.
- Ingress Unique: `(tenant_id, connector_id, provider_event_id)`.
- Audit und Domain Events append-only für den Runtime-User (`INSERT/SELECT`, kein `UPDATE/DELETE`).
- Outbox-Status darf nur der Worker ändern; fachliche Payload bleibt unverändert.

## 5. RLS- und Auth-Pfad

### RLS

Für jede tenantgebundene Tabelle:

- `ENABLE ROW LEVEL SECURITY` plus `FORCE ROW LEVEL SECURITY`.
- Policy auf `tenant_id = current_setting('app.tenant_id', true)::uuid` für `USING` und `WITH CHECK`.
- Leerer/ungültiger Tenant-Kontext liefert keine Zeile beziehungsweise schlägt Mutation fehl.
- Runtime-Rolle ist nicht Owner, kein Superuser, kein `BYPASSRLS`.
- Eine DB-Transaktionshilfe setzt `set_config('app.tenant_id', tenantId, true)`; rohe Query-Nutzung außerhalb dieser Grenze wird nicht exportiert.
- Migrationsrolle und Break-Glass-Administration verwenden getrennte Credentials und Auditpfade.

### Human Auth

- JWT nur über festen Algorithmus, Issuer, Audience, `exp`, `nbf` und geringe Clock Tolerance akzeptieren.
- `tenant_id`/Organization und Subject aus verifizierten Claims; keine frei setzbaren Tenant-Header.
- Actor/Membership und Status aus DB laden; Token-Rollen werden nicht alleinige Autorisierungsquelle.
- Capability statt nur `editor/viewer`: mindestens `case:read`, `case:write`, `ingress:test`.
- Kurze Tokenlaufzeit; keine Tokens in Logs oder Responses; sichere Cache-Header für Session/PII-Antworten.

### Connector Auth

- Öffentlichen Provider-Ingress physisch/logisch von Human APIs trennen.
- Connector aus authentisierter Route/Credential bestimmen; Payload darf Tenant/Connector nicht wählen.
- Provider-spezifische HMAC-/Signaturprüfung auf **Raw Body**, Timestamp-Fenster und Replay-Identifier vor Parsing.
- Secret-Version, Rotation und Widerruf über Secret Manager; niemals Datenbank-Klartext oder Umgebungsdump.
- Das aktuelle Editor-basierte Event-Input bleibt ausschließlich ein klar markierter, nicht produktiver Testendpoint.

## 6. Replay-, Failure- und Outbox-Vertrag

### Ingress

- Receipt wird innerhalb der Transaktion zuerst atomar reserviert (`INSERT ... ON CONFLICT`).
- Gleicher Key + gleicher kanonischer Hash + `processed`: ursprünglichen Status und IDs deterministisch zurückgeben.
- Gleicher Key + anderer Hash: `409 IDEMPOTENCY_CONFLICT` plus Audit.
- Receipt `processing` nach Crash: Lease/Timeout und sichere Wiederaufnahme definieren; kein blindes zweites Apply.
- Providerzeit bleibt `provider_occurred_at`; `recorded_at` und Conversation-`updated_at` stammen vom Server. Plausibilitätsgrenzen markieren extreme Clock Skews.
- Nur neue relevante inbound Interaction darf resolved/closed automatisch reopenen.

### Outbox

- At-least-once explizit; niemals exactly-once versprechen.
- Worker claimed kleine Batches mit `FOR UPDATE SKIP LOCKED`, Lease und `locked_by/locked_at` oder transaktionaler Claim-Strategie.
- Exponentieller Retry mit Jitter, maximales Attempt-Limit, `last_error_code`, Dead-Letter-Zustand und manuelles Replay mit Audit.
- Consumer deduplizieren über `event_id`; Event-ID und Payload eines Retries bleiben identisch.
- Metriken: oldest unpublished age, ready count, retry count, dead-letter count, publish latency; Alert auf Alter statt nur Queue-Länge.

### Failure-Injection-Tests

Für jede Mutation Fehler unmittelbar nach State-, Event-, Audit- und Outbox-Insert injizieren. Nach jedem Fehler müssen alle vier Bereiche unverändert sein. Weitere Pflichtfälle:

- zwei parallele identische Ingress-Requests,
- gleiche Provider-ID auf zwei Connectoren,
- gleicher Key mit anderem Payload,
- Crash nach Publish vor `published_at` und anschließender Duplicate Delivery,
- RLS ohne Tenant-Kontext,
- RLS mit Tenant A gegen jede Tabelle von Tenant B,
- Cross-Tenant-FK für Owner/Assignee/Source,
- deaktivierter Actor trotz formal gültigem JWT,
- abgelaufenes/falsche Audience/falscher Algorithmus JWT,
- alte und zukünftige Provider-Timestamps,
- outbound Event auf resolved Case darf nicht reopenen.

## 7. Priorisierte Änderungen dieses Zyklus

### P0 — Muss vor realen Daten abgeschlossen sein

1. **Alle Mutationen atomarisieren.** Gemeinsame Transaction Boundary für State + Domain Event + Audit + Outbox; Failure-Injection-Tests für Rollback.
2. **Echten PostgreSQL-Pfad einführen.** Versionierte SQL-Migrationen, separater Runtime-User, `ENABLE/FORCE RLS`, transaktionaler Tenant-Kontext und Testcontainers-RLS-Suite.
3. **Composite Tenant FKs schließen.** Owner, Assignee, Creator, Source Interaction, Timeline/Event/Outbox/Audit; negative Cross-Tenant-Insert-Tests.
4. **Ingress-Race und Scope korrigieren.** Schlüssel um `connector_id` erweitern, atomare Reservation, deterministische gespeicherte Response, Connector→Tenant aus vertrauenswürdigem Storage, Serverzeit für operative Aktualisierung, inbound-only Reopen.
5. **PII aus Events/Audit/Outbox entfernen.** Commitment-Description nicht kopieren; explizite Response-Felder statt `SELECT *`; Content-/Retention-Minimum mit Redaction-Timestamp definieren.
6. **Auth-Vertrag ersetzen.** Verifizierte OIDC-kompatible JWTs, DB-Membership, Capability Check; Test-Ingress klar trennen. Solange nicht erfüllt: Bind nur localhost oder private Entwicklungsumgebung.

### P1 — In diesem Zyklus, nachdem P0 technisch grün ist

7. **Outbox Worker implementieren.** Claim, Retry/Jitter, DLQ, idempotenter Test-Consumer und Betriebsmetriken.
8. **Audit-Lesevertrag und Schutz.** Append-only DB-Rechte, sichere Metadaten, risikobasierte Detail-Reads/Denials, cursorbasierter Export; keine PII-Bodies.
9. **API-Abwehr.** CORS-Allowlist, Body-/Route-Rate-Limits, Security Headers, `Cache-Control: no-store` für PII, generische 5xx ohne interne Details.
10. **Betriebsfähigkeit.** strukturierte redigierte Logs, Request/Correlation ID, DB-Readiness, graceful shutdown mit Draining, Secret-Manager-Vertrag, verschlüsselte Backups und Restore-Test.

### P2 — Bewusst verschoben

- produktive SCIM-/SSO-Admin-UX,
- SIEM-Integration und WORM-Archiv,
- per-Tenant Schlüssel/Field-Level Encryption ohne bestätigtes Threat Model,
- Kafka/PubSub,
- Kubernetes,
- Database-per-Tenant,
- vollständiger DSAR-/Legal-Hold-Workflow.

## 8. Cycle-04 Exit Gates

Der Zyklus ist erst abgeschlossen, wenn automatisierte Evidenz Folgendes zeigt:

1. **Atomicity:** Kein Failure Point hinterlässt State ohne Event/Audit/Outbox oder umgekehrt.
2. **Isolation:** Tenant A kann über API, rohe Runtime-DB-Verbindung und Workerpfad keine Zeile von Tenant B lesen, ändern oder referenzieren.
3. **Auth:** ungültige Signatur, Issuer, Audience, Ablauf, deaktivierte Membership und fehlende Capability werden abgewiesen.
4. **Ingress:** 20+ parallele gleiche Deliveries erzeugen genau eine fachliche Interaction; alle Antworten sind deterministisch 202/200 statt zufälligem 500.
5. **Delivery:** Crash nach externer Publikation kann ein Duplicate erzeugen, aber der Consumer wirkt fachlich einmal.
6. **Privacy:** automatisierter Scan von Audit, Domain Events, Outbox und Logs findet keinen Nachrichtenbody, Token oder Secret.
7. **Operations:** Readiness fällt bei nicht nutzbarer DB aus; Outbox-Alter und DLQ sind messbar; Shutdown verliert keine neu akzeptierten Requests.

## 9. Skalierungsprüfung

Diese Priorisierung skaliert, weil sie nicht auf frühe Infrastrukturprodukte setzt, sondern auf unveränderliche Systemverträge:

- Tenant-Kontext und Composite FKs funktionieren in Shared DB, regionalen Zellen und dedizierten Datenbanken.
- Der atomare Outbox-Vertrag bleibt bei PostgreSQL Relay, Pub/Sub und Kafka identisch.
- Minimale Eventpayloads reduzieren Datenbewegung und ermöglichen später erlaubnisgebundene AI-Consumer.
- At-least-once plus Consumer-Deduplizierung funktioniert auch bei horizontalen Workern.
- Ein AuthVerifier-Port erlaubt neue IdPs, ohne Domänencode oder Tenant-Auflösung neu zu entwerfen.

Die Plattform wird dadurch nicht „enterprise“ wegen einer langen Featureliste. Sie wird belastbar, weil Daten-, Identitäts- und Ereignisgrenzen technisch erzwungen und unter Fehlern beweisbar sind.
