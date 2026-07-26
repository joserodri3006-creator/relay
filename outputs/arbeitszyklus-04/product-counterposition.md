# Arbeitszyklus 04 — Produktgegenposition zur Produktionshärtung

**Perspektiven:** CPO, Communication Specialist, Customer Success, Finance  
**Entscheidungsfrage:** Ist Produktionshärtung jetzt wichtiger als Handoff, Context Links oder Send?  
**Status:** verbindliche Scope-Empfehlung, keine Implementierung

## 1. Problemdefinition

Der vorhandene Vertical Slice beweist technisch und visuell bereits:

- ein providerneutrales Event wird zu einem Case,
- ein Case besitzt Status, genau einen Owner und Commitments,
- der Verlauf bleibt sichtbar,
- offene Commitments blockieren den Abschluss,
- ein neues Ereignis öffnet einen gelösten Case wieder.

Er beweist noch nicht, dass **Kommunikationskontext beim Wechsel der Verantwortung erhalten bleibt**. Ein Owner kann heute per Dropdown ersetzt werden. Dabei fehlen Übergabegrund, erwarteter nächster Schritt, Annahme durch den Empfänger und die Antwort auf die zentrale Frage: „Hat die nächste Person die Verantwortung tatsächlich übernommen?“

Gleichzeitig ist PGlite mit Demo-Token, anwendungsseitigem Tenant-Filter und ohne transaktionale Outbox kein vertretbarer Unterbau für reale Pilotdaten. Nur Produktfunktionen weiterzubauen würde auf einer Sicherheits- und Konsistenzschuld aufsetzen. Nur Infrastruktur zu bauen würde dagegen einen ganzen Zyklus ohne neue Kundenevidenz verbrauchen.

## 2. Visionstest

| Option | Beitrag zur Kommunikations-Infrastruktur | Risiko, nur weiteres SaaS zu bauen | Evidenzgewinn in diesem Zyklus |
|---|---|---|---|
| nur Produktionshärtung | schafft belastbaren Runtime-Unterbau | gering | gering; Nutzer erleben keinen neuen Outcome |
| Send | erweitert die Plattform zum ausführenden Kanal | sehr hoch: Composer, Templates und Zustellung ziehen in Shared-Inbox-Logik | unklar; Toolwechsel wird noch nicht durch reale Nutzung belegt |
| generische Context Links | verbindet Kommunikation mit Geschäftssystemen | mittel | gering ohne realen Auftrag, Gerät oder Ticket aus einem Pilotsystem |
| expliziter Handoff | macht Verantwortungswechsel zu einer überprüfbaren Kommunikationsprimitive | gering | hoch; testet den Kernschmerz „Kontext und Verantwortung gehen bei Übergaben verloren“ |

**Visionurteil:** Produktionshärtung ist als Eintrittskarte für echte Daten wichtiger als Send oder generische Context Links. Sie darf aber nicht das alleinige Ergebnis des Zyklus sein. Der kleinste neue Produktbeweis ist ein kontrollierter Handoff.

## 3. Diskussion mit Widersprüchen

### Widerspruch 1 — Finance: „Erst vollständig pilotfähig härten, dann wieder Produkt bauen“

**Argument:** Jeder UI-Tag vor RLS, Audit, Outbox, Restore und produktiver Authentisierung erhöht Rework. Ein Sicherheitsvorfall oder verlorenes Event zerstört mehr Unternehmenswert als ein fehlendes Handoff-Formular.

**CPO-Widerspruch:** „Vollständig pilotfähig“ ist keine geschlossene Definition und kann Monate absorbieren. Ohne neuen beobachtbaren Workflow lernen wir nicht, ob Kunden für die Plattformprimitive statt für eine bessere Inbox zahlen. Infrastruktur ohne Produktbeweis senkt technisches Risiko, aber nicht das größere Marktrisiko.

**Entscheidung:** Nur die Infrastruktur, die den bereits vorhandenen Schreibpfad und den neuen Handoff zuverlässig schützt, ist P0. Kein allgemeines Enterprise-Hardening-Programm.

### Widerspruch 2 — Customer Success: „Send zuerst, sonst bleibt der Operator im Quellsystem“

**Argument:** Ein Nutzer, der nach der Bearbeitung zu Outlook, WhatsApp oder Zendesk zurückwechseln muss, erlebt Relay als zusätzliche Oberfläche. Der Nutzen ist in einer Demo schwerer erklärbar und Adoption leidet.

**Communication-Specialist-Widerspruch:** Senden ist nicht eine Schaltfläche. Es erzeugt Providerberechtigungen, Zustellzustände, Retry-Semantik, Reply- und Threading-Regeln, Templates, Opt-outs, Anhänge, Signaturen und Verantwortung für Fehlversand. Dieser Scope testet „noch eine Inbox“ stärker als „verlässliche Kommunikationskoordination“.

**Entscheidung:** Kein Send in Zyklus 04. Importierte ein- und ausgehende Interaktionen bleiben sichtbar. Send wird erst priorisiert, wenn Workflow-Beobachtungen den Systemwechsel als dominanten Engpass gegenüber Übergabeverlust belegen und ein konkreter erster Kanal feststeht.

### Widerspruch 3 — Enterprise/Integration: „Context Links zuerst, sonst ist der Case vom Geschäft isoliert“

**Argument:** Eine infrastrukturelle Kommunikationsschicht muss Auftrag, Gerät, Standort, Vertrag oder Ticket referenzieren. Sonst bleibt der Case ein schöner Thread und kann keinen organisationsweiten Kontext tragen.

**CPO-/Finance-Widerspruch:** Ein generischer Linkeditor ohne reale System-of-Record-Integration produziert Demo-Metadaten, keinen wirtschaftlichen Outcome. Die richtige Identität, Kardinalität, Berechtigung und Aktualität eines Context Links hängt vom ersten Pilotworkflow ab. Ein vorschnelles generisches Modell kann vertikale Annahmen als Plattformstandard zementieren.

**Entscheidung:** Context-Link-Port und spätere Referenzierbarkeit dürfen architektonisch nicht blockiert werden, aber es gibt in diesem Zyklus weder Context-Link-UI noch frei definierbare Linktypen. Der erste sichtbare Context Link entsteht zusammen mit einem realen Read-only-Adapter und einem belegten Geschäftsobjekt.

### Widerspruch 4 — UX Research: „Handoff ist nur Ownership mit mehr Formularfeldern“

**Argument:** Nutzer könnten einfach Owner wechseln und ein Commitment anlegen. Ein neues Objekt erhöht Begriffe, Zustände und Supportfälle, bevor der Unterschied empirisch bewiesen ist.

**Communication-Specialist-/Customer-Success-Widerspruch:** Owner-Wechsel dokumentiert nur einen administrativen Zustand. Ein Handoff ist eine soziale und operative Vereinbarung zwischen Absender und Empfänger: warum wird übergeben, was ist als Nächstes zu tun, bis wann, und wurde übernommen? Ohne Annahme bleibt Verantwortung stillschweigend verschoben – genau das zu lösende Problem.

**Entscheidung:** Handoff wird nicht als generischer Workflow Builder gebaut, sondern als schmale, überprüfbare Verantwortungstransaktion. Seine Nutzung und Annahmequote werden gemessen. Wenn Teams weiterhin nur das Owner-Dropdown verwenden, wird die Primitive nicht erweitert.

### Widerspruch 5 — Sales: „AI-Zusammenfassung macht den Handoff erst verkaufbar“

**Argument:** Eine automatisch erzeugte Übergabezusammenfassung liefert den stärksten Demo-Moment und reduziert Bearbeitungszeit sichtbar.

**Customer-Success-/Finance-Widerspruch:** Ohne reale Korrekturdaten verschiebt AI das Experiment von Verantwortungsübergabe zu Modellqualität. Falsche oder ausgelassene Zusagen erhöhen Haftung und Support. Zudem entstehen Modellkosten, Evaluation und Datenschutzumfang vor belegter Nutzung der Primitive.

**Entscheidung:** Kein AI-generierter Handoff in diesem Zyklus. Die Struktur wird bewusst manuell erfasst; sie erzeugt später Ground Truth für quellengestützte Vorschläge mit Human Confirmation.

## 4. Entscheidung

Arbeitszyklus 04 liefert **Pilot-Safe Handoff**:

1. Der bestehende Runtime-Schreibpfad wird auf echtes PostgreSQL mit erzwungener Tenant-Isolation, transaktionalem Audit und transaktionaler Outbox gehärtet.
2. Darauf wird genau eine sichtbare Produktprimitive umgesetzt: eine explizite, bestätigungspflichtige Übergabe zwischen zwei aktiven menschlichen Nutzern desselben Tenants.

Das ist kein 50/50-Kompromiss. Die Infrastruktur ist das Sicherheitsgate; Handoff ist das Produktgate. Der Zyklus ist nur abgeschlossen, wenn beide Gates bestanden sind.

## 5. Sichtbare Produktverbesserung

### Nutzerfluss

1. Der aktuelle Owner wählt „Übergeben“.
2. Er wählt einen Empfänger und erfasst zwingend einen **Übergabegrund** sowie den **erwarteten nächsten Schritt**; eine Frist ist optional.
3. Der Case zeigt sichtbar „Übergabe ausstehend an …“. Der bisherige Owner bleibt bis zur Annahme verantwortlich.
4. Der Empfänger sieht den Case in **„Übergaben an mich“** und kann annehmen oder mit Begründung ablehnen.
5. Bei Annahme wechseln Ownership und Handoff-Status atomar; die Timeline zeigt Absender, Empfänger, Grund, nächsten Schritt und Zeitpunkt.
6. Bei Ablehnung bleibt der bisherige Owner verantwortlich; Grund und Zeitpunkt bleiben in der Timeline.

### Minimales Handoff-Modell

- `id`, `tenant_id`, `conversation_id`
- `from_actor_id`, `to_actor_id`
- `reason`, `next_action`, optional `due_at`
- `status`: `pending | accepted | declined | cancelled`
- `created_at`, `decided_at`, `decided_by_actor_id`
- `conversation_version` beziehungsweise erwartete Version für Konkurrenzkontrolle

### Fachliche Invarianten

- Maximal ein ausstehender Handoff je Case.
- Absender ist zum Erstellzeitpunkt aktueller Owner.
- Empfänger ist ein aktiver menschlicher Editor im selben Tenant und nicht der Absender.
- Der Owner wechselt erst bei Annahme.
- Nur Empfänger darf annehmen oder ablehnen; nur Absender darf vor Entscheidung abbrechen.
- Jede Transition ist auditierbar und erzeugt ein minimales Domain-/Timeline-Event.
- Ein gelöster oder geschlossener Case kann keinen neuen Handoff erhalten.

### Erfolgssignale

- Ein neuer Nutzer erkennt in höchstens 30 Sekunden, wer bis zur Annahme verantwortlich ist.
- 100 Prozent angenommener Handoffs wechseln Ownership und erzeugen Audit, Timeline und Outbox atomar.
- Kein abgelehnter oder abgebrochener Handoff verliert den bisherigen Owner.
- In Pilotbeobachtungen können Empfänger den Übergabegrund und nächsten Schritt ohne Rückfrage wiedergeben.
- Metriken: `handoff.created`, Annahmequote, Zeit bis Entscheidung, Ablehnungsgrund und Zahl paralleler Rückfragen; keine Nachrichtentexte in Logs.

## 6. Harte Scope-Grenze

### In Scope — verpflichtend

**Produkt**

- ein ausstehender Human-to-Human-Handoff innerhalb eines Tenants,
- Übergabegrund, nächster Schritt, optional Frist,
- Annahme, Ablehnung und Abbruch,
- Inbox-Ansicht „Übergaben an mich“,
- klare Anzeige der fortbestehenden Verantwortung,
- Timeline- und Auditdarstellung.

**Pilot-Sicherheit**

- PostgreSQL als produktionsnaher Adapter mit Migrationen,
- `FORCE ROW LEVEL SECURITY` und Negativtests für Tenant-Escape,
- Composite Foreign Keys für tenantgebundene Referenzen,
- Audit Entry und Outbox in derselben Transaktion wie fachliche Mutationen,
- Retry- und Consumer-Deduplizierungsvertrag für Outbox,
- stabiler API-Vertrag für bestehende Commands und Handoff-Commands,
- keine Kommunikationsinhalte, Tokens oder Secrets in Logs/Audit/Outbox.

### Out of Scope — gesperrt

- Senden, Composer, Drafts, Templates, Zustellstatus und Anhänge,
- echte WhatsApp-, E-Mail- oder Voice-Sendestrecke,
- generische Context Links oder frei definierbare Geschäftsobjekte,
- externe, organisationsübergreifende oder Partner-Handoffs,
- Team-, Queue-, Schicht- oder AI-Agent-Empfänger,
- automatische Routingregeln, Eskalationen, Reminder oder SLA-Engine,
- mehrere parallele Handoffs, Delegationsketten, Bulk-Handoffs,
- AI-Zusammenfassung, AI-Empfängerwahl oder autonome Annahme,
- Kubernetes, Kafka, Microservice-Trennung, Data Warehouse oder Marketplace,
- vollständiges SOC-2-/ISO-Programm, Enterprise-SSO-Admin-UI und globale Datenresidenz.

Ein späterer Bedarf darf diese Grenze nicht durch „nur noch ein Feld“ umgehen. Neue Empfängertypen oder Automationen verändern Policy, Zustandsmodell und Haftung und benötigen eine eigene Entscheidung.

## 7. Reihenfolge und Abbruchregeln

### Reihenfolge

1. Handoff-Invarianten und API-Vertrag festschreiben.
2. PostgreSQL-, Tenant-, Audit- und Outbox-Gate für den bestehenden Kern schließen.
3. Handoff-Command und atomare Events auf demselben Schreibpfad implementieren.
4. minimale UI und Ansicht „Übergaben an mich“ ergänzen.
5. Tenant-, Rollen-, Konkurrenz-, Retry- und Browser-Happy-Path testen.

### Abbruchregeln

- Keine Handoff-UI auf einem Schreibpfad, dessen RLS-/Transaktions-Negativtests fehlschlagen.
- Kein weiterer Infrastrukturbaustein, wenn er weder aktuellen Core noch Handoff für einen abgegrenzten Pilot schützt.
- Kein Send- oder Context-Link-Scope durch technische Vorarbeit als faktische Produktentscheidung einschleusen.
- Wenn Handoff den Zyklus gefährdet, wird nicht sein Zustandsmodell erweitert; gestrichen werden zuerst Komfortfunktionen, nicht Annahme und Verantwortungswahrheit.

## 8. Skalierungsprüfung

- Handoff ist eine kanonische Domänenprimitive und unabhängig von UI oder Provider.
- Ereignisse und Commands sind versionierbar; der Empfänger bleibt ein Actor-Port, auch wenn spätere Policy andere Actor-Typen erlaubt.
- Die Entscheidung wechselt Ownership atomar und verhindert widersprüchliche Read Models unter Parallelität.
- Outbox ermöglicht spätere Benachrichtigungen, Webhooks und Analytics, ohne diese jetzt in den Kern einzubauen.
- Der Scope skaliert organisatorisch: Er liefert eine klare Verantwortungssemantik, bevor Teams, AI-Agenten oder externe Partner die Zahl möglicher Übergaben vervielfachen.
- Er skaliert wirtschaftlich: Produkt- und Infrastrukturarbeit erzeugen gemeinsam eine testbare Pilotstory, ohne die Kostenfläche von Multi-Channel-Send oder Workflow Automation zu eröffnen.

## 9. Abschlusskriterium

Der Zyklus gilt nicht als erfolgreich, wenn lediglich PostgreSQL, RLS oder Outbox vorhanden sind. Er gilt ebenfalls nicht als erfolgreich, wenn eine Übergabemaske auf Demo-Isolation aufgesetzt wurde.

**Definition of Done:** Ein Editor kann einen Case mit Grund und nächstem Schritt an einen zweiten Editor übergeben; der zweite sieht die ausstehende Übergabe, nimmt sie an oder lehnt sie ab; Ownership, Timeline, Audit und Outbox bleiben dabei tenantisoliert, atomar, idempotent beziehungsweise konfliktfest und durch Integrations- sowie Browser-Tests belegt.

