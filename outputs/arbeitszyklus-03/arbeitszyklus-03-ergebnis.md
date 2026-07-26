# Arbeitszyklus 03 — Erster produktiver Vertical Slice

## Ergebnis

Der Workspace enthält jetzt eine lauffähige Anwendung statt ausschließlich Strategieartefakten. **Relay Case Control** führt einen vollständigen Kommunikationsfall von einem providerneutralen Eingangsevent bis zum kontrollierten Abschluss.

## Produktentscheidung

Der erste Slice beweist genau eine These:

> Ein beliebiges Kommunikationsereignis kann zu einem nachvollziehbaren Fall mit Kontext, eindeutigem Owner, kontrolliertem Zustand und überprüfbarer Zusage werden.

Die UI nennt das Objekt „Case“. Im Kern bleibt es eine kanonische `Conversation`; es entsteht keine zweite fachliche Wahrheit.

## Implementierter Happy Path

1. Ein authentifiziertes, kanalneutrales Testevent wird eingespeist.
2. Provider-Retries bleiben fachlich idempotent; veränderter Inhalt mit gleicher Event-ID erzeugt einen Konflikt.
3. Der Case erscheint in der Attention Inbox.
4. Die Detailansicht zeigt Originalinteraktionen und operative Ereignisse getrennt in einer Timeline.
5. Ein Editor weist einen eindeutigen Owner zu.
6. Er erfasst ein strukturiertes Commitment.
7. Ein offenes Commitment blockiert den stillen Abschluss.
8. Nach Erfüllung kann der Case gelöst werden.
9. Ein neues Event desselben externen Threads öffnet einen gelösten Case wieder.

## Technische Entscheidung

- TypeScript als gemeinsames Sprachsystem
- React/Vite als eigener Referenz-Client
- Fastify und Zod für API und Laufzeitverträge
- PostgreSQL-kompatibles Schema auf PGlite für sofortige lokale Ausführbarkeit
- modularer Monolith als Deployment- und Entwicklungsmodell
- tenantgebundene Queries, serverseitige Rollenprüfung und optimistische Versionierung
- unveränderliche operative Timeline zusätzlich zum aktuellen Zustand

PGlite ist eine lokale Laufzeitentscheidung, keine neue langfristige Datenbankstrategie. Vor einem realen Pilot folgen Managed PostgreSQL, Row-Level Security, transaktionale Outbox, produktive OIDC-Integration und Secret Management.

## Diskussion und Widerspruch

### Composer sofort integrieren

Customer Success und Communication Specialist argumentierten, ein Operator müsse sonst ins Quellsystem wechseln. Product und Security widersprachen wegen Sendeberechtigung, Zustellstatus, Templates, Opt-outs und Providersemantik. Entscheidung: Der Slice importiert ein- und ausgehende Interaktionen, sendet aber noch nicht. Send wird der nächste Slice, falls der Toolwechsel der dominante beobachtete Engpass ist.

### Event Sourcing als alleinige Wahrheit

Architecture und Data sahen Vorteile für Replay und Audit. Security und Enterprise warnten vor PII-Retention, Löschung und Schemaevolution. Entscheidung: Current State plus minimale unveränderliche Domain-/Timeline-Events. Vollständige Kommunikationsinhalte bleiben separat löschbar.

### AI-Commitment-Extraktion sofort zeigen

Sales sah den stärkeren Demo-Moment. UX Research, QA und Security widersprachen wegen falscher Zusagen und fehlender Ground Truth. Entscheidung: Commitments werden zunächst bewusst manuell strukturiert; AI darf später nur belegte Vorschläge mit Quelle und Human Confirmation erzeugen.

### Teams statt Personen als Owner

Sales und Customer Success wollten geringere Einführungshürden. Communication Specialist widersprach: „Das Team besitzt es“ löst die Verantwortungslücke nicht. Entscheidung: genau ein menschlicher Owner oder sichtbar nicht zugewiesen.

### Direkt Microservices, Kafka und Kubernetes

DevOps und Future Technologies wollten frühe Skalierungsgrenzen. Architect und Finance widersprachen wegen Betriebs- und Konsistenzkosten. Entscheidung: modularer Monolith mit versionierten API-/Eventgrenzen; Trennung erst bei belegter Last, Datenresidenz oder Teamautonomie.

## Skalierungsprüfung

- Provider-IDs bleiben externe Referenzen und niemals Primärschlüssel.
- Tenant wird aus der authentifizierten Session gebunden, nicht aus einem frei gesetzten Request-Header.
- Writes verwenden Case-Versionen und erkennen parallele Änderungen.
- Status, Ownership und Commitment sind API-fähige Domänenobjekte statt UI-Felder.
- Die eigene Oberfläche benutzt dieselben Verträge wie spätere Integrationen.
- Der lokale Datenbankadapter kann gegen Managed PostgreSQL ersetzt werden, ohne die Produktsemantik zu ändern.

## Verifikation

- TypeScript-Typecheck: bestanden
- Production Build: bestanden
- fünf API-/Datenbank-Integrationstests: bestanden
- Dependency Audit: null bekannte Schwachstellen
- Browser-Happy-Path: Event → Owner → Commitment → Blocked Close → Fulfil → Resolve bestanden
- Produktionsmodus: Web `200`, Health `200`, unauthentifizierter API-Zugriff `401`

## Nächster Entwicklungszyklus

1. Datenzugriff als explizite Repository Ports extrahieren und Managed PostgreSQL bereitstellen.
2. RLS, Composite Foreign Keys, Audit Entry und transaktionale Outbox produktionsnah implementieren.
3. OpenAPI-Vertrag generieren und Adapter-Contract-Tests hinzufügen.
4. Einen echten read-only Provideradapter hinter den kanonischen Ingress-Port setzen.
5. Danach entscheiden, ob Send/Handoff oder Context Links der nächste nutzerseitige Slice werden.

AI, Workflow Builder und Multi-Channel-Send bleiben gesperrt, bis der Kernpfad mit realen Pilotfällen zuverlässig läuft.
