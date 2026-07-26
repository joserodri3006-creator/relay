# Arbeitszyklus 04 — Pilot-Safe Handoff und Atomic Write Kernel

## Ergebnis

Relay wurde gleichzeitig auf zwei Ebenen weiterentwickelt:

1. **Sichtbarer Produktwert:** eine bestätigungspflichtige Human-to-Human-Übergabe mit Grund, nächstem Schritt, optionaler Frist und kontrolliertem Lebenszyklus.
2. **Plattformhärtung:** jede erfolgreiche fachliche Mutation schreibt Current State, minimales Domain Event, Success Audit und Outbox Record atomar.

## Warum diese Kombination

Eine reine Infrastrukturiteration hätte das technische Risiko reduziert, aber keinen neuen operativen Nutzen bewiesen. Eine reine Handoff-UI auf dem alten Schreibpfad hätte dagegen genau die Verantwortungslücken reproduziert, die Relay verhindern soll. Der Zyklus durfte deshalb nur als Kombination abgeschlossen werden.

## Implementierter Produktpfad

- Ein Editor fordert eine Übergabe an einen anderen Editor an.
- Grund und nächster klarer Schritt sind Pflichtfelder; eine Übernahmefrist ist optional.
- Pro Case darf höchstens eine Übergabe offen sein.
- Der bisherige Owner bleibt vollständig verantwortlich, solange die Übergabe `pending` ist.
- Nur der benannte Empfänger darf annehmen oder ablehnen.
- Nur der Absender darf abbrechen.
- Erst `accepted` setzt den Empfänger atomar als neuen Owner.
- Angefordert, angenommen, abgelehnt und abgebrochen erscheinen in Timeline, Domain Event, Audit und Outbox.
- Die UI zeigt eine offene Übergabe und deren Annahmestatus prominent im Case-Kontext.

## Atomic Write Kernel

Jede erfolgreiche Mutation erzeugt in derselben Datenbanktransaktion:

1. den neuen Aggregate-Zustand,
2. ein minimales versioniertes Domain Event,
3. einen Success-Audit-Eintrag ohne Kommunikationsinhalt,
4. einen Outbox Record mit neutralem Event-Envelope,
5. den operativen Timeline-Eintrag.

Die Outbox liefert mindestens einmal. Der Worker reserviert Records mit `FOR UPDATE SKIP LOCKED`, markiert erfolgreiche Publikation und führt Fehler mit Backoff und begrenzten Versuchen zurück.

## Adapter- und API-Vertrag

- `ChannelAdapterV1` trennt Providerverifikation, Idempotency Key und kanonische Normalisierung.
- Der kanonische Ingress-Vertrag bleibt providerneutral.
- Provider-Event-IDs werden je Tenant und Connector dedupliziert.
- Derselbe Schlüssel mit verändertem Payload erzeugt einen expliziten Konflikt.
- Der OpenAPI-3.1-Vertrag wird aus denselben Zod-Schemata erzeugt und als Artefakt exportiert.
- Manipulierte Providerzeit beeinflusst nicht die operative Attention-Sortierung.
- Importierte Outbound-Interaktionen öffnen gelöste Cases nicht automatisch wieder.

## Teamdiskussion und Widersprüche

### 1. Nur Produktionshärtung

Security, Enterprise und DevOps priorisierten RLS, Auth und Outbox. Product, Customer Success und Finance widersprachen: Eine unsichtbare Iteration liefert keine neue Nutzerevidenz. Entscheidung: Produktionshärtung ist Pflichtgate, aber Handoff ist der sichtbare Slice.

### 2. Send vor Handoff

Communication Specialist argumentierte, Kommunikation werde erst mit einer Antwortstrecke vollständig. Security und API widersprachen wegen Providerberechtigung, Zustellstatus, Templates, Opt-outs und Kanalpolitik. Entscheidung: Send bleibt gesperrt. Verantwortung wird zuerst intern zuverlässig übertragen.

### 3. Owner sofort beim Weitergeben ändern

Sales und einige Customer-Success-Perspektiven bevorzugten einen schnellen Ein-Klick-Transfer. UX Research und Communication Specialist widersprachen: Eine unbestätigte Zuweisung verschiebt Verantwortung nur unsichtbar. Entscheidung: Ownerwechsel ausschließlich nach Annahme.

### 4. Kafka oder Event Sourcing sofort

Data und Future Technologies sahen langfristige Replay- und Skalierungsvorteile. Architecture, Security und Finance widersprachen wegen PII-Retention, Schemaevolution und Betriebskosten. Entscheidung: Current State plus minimale Domain Events und PostgreSQL-Outbox; kein Kafka und kein volles Event Sourcing.

### 5. OpenAPI handschriftlich pflegen

API Design wollte früh vollständige Dokumentation. QA widersprach einer zweiten Wahrheit neben Laufzeitvalidierung. Entscheidung: OpenAPI wird programmatisch aus den ausführbaren Zod-Schemata aufgebaut und automatisiert exportiert.

### 6. Lokale Tenant-Filter reichen

Product argumentierte, App-Filter seien für die Demo ausreichend. Security und Enterprise widersprachen: Ein einzelner vergessener Filter wäre ein Cross-Tenant-Incident. Entscheidung: App-Validierungen wurden verstärkt und eine PostgreSQL-RLS-/Composite-FK-Migration erstellt. Reale PII bleiben gesperrt, bis diese Migration auf echtem PostgreSQL ausgeführt und negativ getestet wurde.

## Sicherheitsentscheidung

Der Slice ist für lokale Produktentwicklung und synthetische Daten freigegeben. Er ist **nicht** für echten Provider-Ingress oder reale PII freigegeben.

Vor Pilotbetrieb bleiben folgende Gates offen:

- Managed PostgreSQL statt eingebetteter Laufzeit,
- RLS mit Non-Owner-Runtime-Role und `FORCE ROW LEVEL SECURITY`,
- Composite Tenant Foreign Keys praktisch migriert,
- OIDC für Menschen und getrennte Connector-Credentials,
- Secret Management und Rotation,
- signierte Provider-Webhooks mit Replay-Fenster,
- RLS-, Concurrency- und Failure-Injection-Tests gegen echtes PostgreSQL.

## Verifikation

- TypeScript-Typecheck: bestanden
- Production Build: bestanden
- 9 Integrationsfälle: bestanden
- Connector-scoped Idempotency: bestanden
- Atomic Domain Event/Audit/Outbox Counts: bestanden
- Outbox-Deduplizierung nach erfolgreicher Publikation: bestanden
- Handoff bleibt pending ohne Ownerwechsel: bestanden
- Annahme durch falschen Actor: serverseitig blockiert
- Annahme durch Empfänger: Owner atomar übertragen
- OpenAPI-Export: bestanden
- Browser: Handoff-Anforderung, sichtbarer Pending-State, unveränderter Owner und Audit-Anzeige bestanden
- Browser-Konsole: keine Warnungen oder Fehler

Der Dependency-Baum wurde in diesem Zyklus nicht verändert. Der letzte erfolgreiche Audit dieses Baums meldete null bekannte Schwachstellen; eine erneute Registry-Abfrage war zeitweise nicht erreichbar.

## Nächster Entwicklungszyklus

Arbeitszyklus 05 sollte keinen neuen breiten Produktbereich öffnen. Er sollte den lokalen Sicherheitsvertrag auf echtes PostgreSQL und getrennte Connector-Authentisierung heben:

1. PostgreSQL-Adapter und Migration Runner,
2. RLS-/Composite-FK-Negativtests,
3. OIDC- und Connector-Principal-Grenze,
4. signierter Fixture-Webhook hinter `ChannelAdapterV1`,
5. Dead-Letter-/Replay-Ansicht für fehlgeschlagene Ingress- und Outbox-Ereignisse.

Erst danach darf ein realer Read-only-Provideradapter mit zweckgebundenen Pilotdaten aktiviert werden.
