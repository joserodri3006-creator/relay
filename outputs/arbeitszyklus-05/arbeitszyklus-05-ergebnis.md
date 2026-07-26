# Arbeitszyklus 05 — Pilot Boundary

## Ergebnis

Relay besitzt jetzt erstmals eine realistische technische Eintrittsgrenze für externe Kommunikation: Connectoren werden über einen opaken Routing-Key gefunden, signieren den unveränderten Request Body, und können Tenant oder Connector nicht über den Payload wählen. Fehler werden sanitisiert sichtbar. Ausgehende Domain Events werden mit einer Lease beansprucht, nach begrenzten Versuchen dead-lettered und nur durch einen berechtigten Operator auditiert erneut eingeplant.

Das ist bewusst noch **keine Pilotfreigabe**. Der Codepfad ist implementiert; die Migrationen und RLS-Grenzen wurden mangels PostgreSQL-Dienst nicht gegen den späteren Zielcluster ausgeführt.

## Problem und Vision

Der bisherige Slice bewies Conversation-Steuerung, ließ aber zwei Infrastrukturfragen offen: Wie darf ein fremdes Kanalsystem Daten einliefern, ohne Tenant-Identität zu behaupten? Und wie wird ein fehlgeschlagenes Event operativ beherrscht, ohne daraus eine neue Admin-Suite zu bauen?

Visionstest: Beide Lösungen stärken eine providerneutrale Kommunikationsschicht. Eine allgemeine Dashboard-, Workflow- oder Connector-Konfiguration wäre in diesem Zyklus Feature-Wildwuchs gewesen.

## Diskussionsforum: 18 Rollen, eine Entscheidung

1. CEO: stimmt zu, weil Provider austauschbar bleiben und der sichtbare Scope klein ist.
2. CPO: stimmt nur einer Attention Queue zu, nicht einem Event Explorer.
3. Software Architect: fordert Database Port, tenantgebundene Transaktionen und atomare Leases.
4. AI Architect: stimmt zu; KI bleibt absichtlich außerhalb des sicherheitskritischen Ingress-Pfads.
5. UX Research: fordert verständliche Handlungstexte statt Broker- und HMAC-Jargon.
6. Customer Success: fordert einen klaren Hinweis, dass verworfener Ingress vom Provider neu gesendet werden muss.
7. Sales: bewertet den Nutzen als verkaufbar: „Kanalfehler gehen nicht unsichtbar verloren.“
8. Marketing: warnt davor, Operations als neue Produktkategorie zu positionieren; es ist Vertrauensinfrastruktur.
9. Finance: stimmt wegen geringer UI-Breite und niedriger zusätzlicher Betriebsfläche zu.
10. Enterprise Architect: fordert RLS, getrennte Runtime-Rolle, Audit und Capability statt bloßer Editor-Rolle.
11. Security Officer: widerspricht einem allgemeinen Replay und verlangt Raw-Body-HMAC, Zeitfenster und serverseitige Identität.
12. DevOps: fordert reproduzierbare Migrationen, Checksums, Advisory Lock und Dead-Letter-Beobachtbarkeit.
13. QA Lead: widerspricht einer Pilotfreigabe ohne echten PostgreSQL- und Provider-Test.
14. API Designer: fordert einen eigenen internen Connector-Vertrag und dokumentierte Signatureingabe.
15. Data Engineer: verlangt unveränderliche Domain Events und getrennte Ingress-Issues/Outbox-Zustände.
16. Communication Specialist: stimmt zu, weil Kontext erhalten bleibt, ohne Nutzern technische Rohdaten aufzubürden.
17. Competitor Analyst: sieht die Chance nicht in einem weiteren Inbox-Feature, sondern in einer kontrollierbaren Provider-Grenze.
18. Future Technologies: fordert, dass der Vertrag unabhängig von WhatsApp, E-Mail und künftigen Voice-Agenten bleibt.

Explizite Gegenstimmen gab es damit mindestens von Security (kein pauschales Replay), QA (keine Pilotfreigabe) und CPO/Marketing (keine Admin-Suite beziehungsweise eigene Kategorie). Diese Einwände wurden übernommen.

## Getroffene Architekturentscheidungen

- `Database` ist ein Port; PGlite bleibt lokaler Adapter, `pg` ist der Produktionsadapter.
- Jede fachliche PostgreSQL-Operation läuft in einer Transaktion mit transaktionslokalem `app.tenant_id`.
- Migrationen sind fortlaufende SQL-Dateien mit SHA-256-Ledger und Advisory Lock.
- Tenanttabellen erhalten `ENABLE/FORCE ROW LEVEL SECURITY`; die Runtime-Rolle besitzt die Tabellen nicht und hat kein `BYPASSRLS`.
- Connector-Routing wird über einen opaken Key aufgelöst. Tenant, Connector-Key und Secret-Referenz stammen aus Storage.
- Die Signatur ist `HMAC-SHA256(secret, timestamp + '.' + raw_body)` mit fünf Minuten Zeitfenster.
- Fehlerdiagnosen enthalten nur Code, Request-ID und Routing-Key-Suffix; der eingehende Body wird nicht in der Fehlerqueue gespeichert.
- Outbox Claims besitzen Worker-ID und 30-Sekunden-Lease. Maximal zehn Versuche führen in Dead Letter.
- Redrive setzt Zustandsmetadaten zurück, verändert niemals den Payload und erzeugt einen Audit-Eintrag.

## UX

Die neue Navigation „Integrationen“ erscheint nur mit `integration:operate`. Die Ansicht zeigt drei Aufmerksamkeitszahlen und pro Problem genau eine verständliche Erklärung. Ingress-Probleme besitzen bewusst keinen Replay-Button. Outbox-Ereignisse können nur bei abgelaufener Lease und vorhandenem Fehler erneut eingeplant werden.

## Verifikation

- TypeScript Server und Web: bestanden.
- 11 Integrationstests: bestanden.
- Produktionsbuild: bestanden.
- OpenAPI 3.1: exportiert.
- Browser: Navigation, sauberer Leerzustand, sanitisiertes HMAC-Fehlerereignis und fehlende Console Errors geprüft.
- Dependency Audit: keine bekannten Vulnerabilities zum Installationszeitpunkt.
- Nicht ausführbar in dieser Umgebung: echte PostgreSQL-Migration, RLS-Rollentest, Last-/Lease-Test mit mehreren Worker-Prozessen.

## Skalierungsprüfung

Tenantbindung und RLS skalieren horizontal über stateless API-Instanzen. `FOR UPDATE SKIP LOCKED` plus Leases erlaubt parallele Worker. Connector-Secrets sind nur referenziert und können in KMS/Vault rotieren. Die sichtbare Queue ist abgeleitet und kann später über Read Models materialisiert werden, ohne den Domain-Vertrag zu ändern.

Frühe Grenzen: Die aktuelle Queue hat noch keine Pagination; Connector-Routing liest eine zentrale Tabelle; es existiert noch kein verschlüsselter Quarantänespeicher. Diese Punkte sind für einen kleinen Design-Partner vertretbar, nicht für weltweiten Betrieb.

## Nächster Zyklus

1. Ziel-PostgreSQL bereitstellen und Migration/RLS als CI-Test ausführen.
2. Einen echten, eingehenden Provider-Adapter hinter `ChannelAdapterV1` implementieren.
3. Secret-Resolver an einen verwalteten Store anbinden und Rotation testen.
4. Multi-Worker-Lease-, Retry- und Chaos-Tests ergänzen.
5. Erst danach einen eng begrenzten internen Design-Partner-Pilot mit synthetischen Daten starten.

## Detailreviews

- `work/arbeitszyklus-05/postgres-ingress-adr.md`
- `work/arbeitszyklus-05/security-connector-review.md`
- `work/arbeitszyklus-05/operations-ux-prd.md`
