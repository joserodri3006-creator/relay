# Vertical-Slice-PRD v0.1 — Case Control

**Stand:** 20. Juli 2026  
**Status:** Implementierbare Produktentscheidung für Arbeitszyklus 03  
**Perspektiven:** CPO, UX Research, Communication Specialist, Customer Success, Sales  
**Scope:** Echte nutzbare UI für Cases-Inbox, Case-Detail, kanalneutrale Timeline, Owner, Status, Commitments und Event-Eingang

## 1. Executive Decision

Wir bauen als ersten produktiven Vertical Slice **Case Control**:

> Ein eingehendes Kommunikationsereignis wird zu einem sichtbaren Fall, dessen Verlauf, Verantwortung, Zustand und offene Zusagen ein Team zuverlässig steuern kann.

Der Slice beginnt bei einem authentifizierten, kanalneutralen Event-Eingang und endet bei einem nachvollziehbar abgeschlossenen Case. Er enthält genau einen operativen Arbeitsbereich:

1. Event trifft ein.
2. Ein Case wird idempotent angelegt oder aktualisiert.
3. Der Case erscheint in der Cases-Inbox.
4. Ein Nutzer versteht den bisherigen Verlauf in einer kanalneutralen Timeline.
5. Er übernimmt oder weist Verantwortung zu.
6. Er erfasst und erfüllt ein Commitment.
7. Er setzt den Case auf den fachlich richtigen Status.
8. Jede Änderung bleibt in der Timeline nachvollziehbar.

Der Slice enthält **keinen Composer, keinen Channel-Send, keine AI, keine Automation und keinen Workflow-Builder**. Er ist trotzdem nutzbar: als verlässliche Kontrolloberfläche über Kommunikationsereignisse, die aus bestehenden Systemen eingehen. Importierte ein- und ausgehende Interaktionen können dargestellt werden; das Produkt sendet selbst noch nichts.

### Warum dies Infrastruktur und nicht nur SaaS ist

- Der Event-Eingang ist kanal- und providerneutral.
- Case-Zustand, Ownership und Commitments sind über API-fähige Domänenprimitive statt UI-only-Felder modelliert.
- Die eigene UI ist ein Referenz-Client auf denselben Verträgen, die später Integrationen und Agenten verwenden.
- Timeline-Einträge verbinden Kommunikation und operative Zustandsänderungen in einem gemeinsamen, auditierbaren Verlauf.
- Der Kernnutzen bleibt bestehen, wenn später E-Mail, WhatsApp, Voice, AI-Agenten oder Fremdprodukte Events liefern.

## 2. Problemdefinition

Ein Team kann heute oft sehen, **dass** eine Nachricht eingegangen ist, aber nicht zuverlässig:

- ob daraus ein bearbeitungswürdiger Fall entstanden ist,
- wer den nächsten Schritt besitzt,
- ob eine Zusage offen oder überfällig ist,
- welche Statusänderung nach einer Übergabe gilt,
- was über verschiedene Quellen hinweg tatsächlich passiert ist.

Shared Inboxes beantworten primär „Welche Nachricht ist ungelesen?“. Case Control beantwortet „Welcher fachliche Vorgang braucht warum wessen Handlung?“

### Zu validierende Kernhypothese

Wenn eingehende Kommunikationsereignisse als Cases mit explizitem Owner, Status und Commitment geführt werden, können operative Teams verlorene Verantwortung und vergessene Zusagen reduzieren, ohne ihr Quellsystem sofort zu ersetzen.

## 3. Nutzer und Nutzungskontext

### Primärer Nutzer

Service- oder Customer-Operations-Mitarbeiter, der täglich eingehende Fälle triagiert und bearbeitet.

### Sekundäre Nutzer

- Teamleiter, der unzugewiesene, wartende und überfällige Fälle erkennt.
- Spezialist, der einen Fall nach Übergabe mit vollständigem Verlauf übernimmt.
- Pilot-Administrator, der einen Event-Eingang konfiguriert beziehungsweise Testevents einspeist.

### Nicht primäre Nutzer dieses Slice

- Endkunde als Portalnutzer,
- Marketing- oder Sales-Campaign-Teams,
- autonome AI-Agenten,
- externe Partner ohne Tenant-Zugang,
- Enterprise-Auditoren mit eigenem Reporting-Arbeitsplatz.

## 4. Jobs-to-be-done

### JTBD 1 — Aufmerksamkeit erkennen

**Wenn** neue oder veränderte Kundenkommunikation eingeht,  
**möchte ich** sofort sehen, welche Cases neu, unzugewiesen oder zeitkritisch sind,  
**damit** kein relevanter Vorgang durch ein kanalbezogenes Postfach fällt.

**Erfolgssignal:** Der Nutzer findet einen neu eingegangenen, unzugewiesenen Case ohne Suche und öffnet ihn mit einem Klick.

### JTBD 2 — Kontext verstehen

**Wenn** ich einen Case öffne oder übernehme,  
**möchte ich** den chronologischen Verlauf aus Interaktionen und operativen Änderungen verstehen,  
**damit** ich nicht in mehreren Tools oder bei Kollegen nachfragen muss.

**Erfolgssignal:** Der Nutzer kann Absender, Quelle, letzte relevante Interaktion, Owner, Status und offene Zusage innerhalb von 30 Sekunden benennen.

### JTBD 3 — Verantwortung festlegen

**Wenn** ein Case Handlung benötigt,  
**möchte ich** genau einen verantwortlichen Owner festlegen,  
**damit** der nächste Schritt nicht implizit beim gesamten Team liegt.

**Erfolgssignal:** Jeder aktive Pilot-Case hat entweder einen expliziten Owner oder ist sichtbar als „Nicht zugewiesen“ markiert; Teamzugehörigkeit ersetzt keinen individuellen Owner.

### JTBD 4 — Zusagen kontrollieren

**Wenn** wir eine konkrete Handlung oder Antwort bis zu einem Zeitpunkt schulden,  
**möchte ich** diese Zusage strukturiert am Case erfassen und abschließen,  
**damit** sie nicht im Nachrichtentext verschwindet.

**Erfolgssignal:** Offene und überfällige Commitments sind in Liste und Detail sichtbar; ihre Erfüllung ist zeitlich und durch Actor nachvollziehbar.

### JTBD 5 — Fall sauber abschließen

**Wenn** der fachliche Vorgang erledigt ist,  
**möchte ich** prüfen, ob noch offene Commitments bestehen, und den Case lösen,  
**damit** „erledigt“ einen belastbaren Zustand statt nur ein leeres Postfach bezeichnet.

**Erfolgssignal:** Ein Case mit offenem Commitment kann nicht unbemerkt als gelöst gelten; der Nutzer muss Commitment erfüllen, abbrechen oder die bewusste Ausnahme bestätigen.

## 5. Produktmodell und Begriffe

### Case

Ein **Case** ist das operative Read Model eines fachlichen Kommunikationszusammenhangs. Im Slice entspricht ein Case genau einer kanonischen `Conversation`, wird aber in der UI als „Case“ bezeichnet. Es entsteht **keine zweite konkurrierende Kernentität**.

Ein Case besitzt mindestens:

- stabile interne ID,
- Tenant,
- kurzen Betreff beziehungsweise Fallback-Titel,
- Teilnehmeranzeige aus vorhandenen Actor-/Identity-Daten,
- Erstellungs- und Aktualisierungszeit,
- aktuellen Status,
- optional genau einen menschlichen Owner,
- null bis viele Commitments,
- chronologische Timeline,
- Source References zu den eingegangenen Events.

### Interaction

Eine aus einem Quellsystem normalisierte Kommunikationshandlung, zum Beispiel eingehende Nachricht, importierte ausgehende Nachricht oder Systemnotiz. Providerfelder erscheinen nicht als Kernsemantik; der originale Source-Verweis bleibt erhalten.

### Operational Event

Eine unveränderliche Tatsache über eine Änderung im Produkt, zum Beispiel `case.owner_assigned`, `case.status_changed`, `commitment.created` oder `commitment.completed`.

### Commitment

Eine explizite, überprüfbare Zusage im Kontext des Case:

- Beschreibung als notwendiger Freitext,
- verantwortlicher Owner; Standard ist aktueller Case Owner,
- optionales Fälligkeitsdatum mit Zeitzone,
- Zustand `open`, `completed` oder `cancelled`,
- `overdue` als abgeleiteter Anzeigezustand, nicht als schreibbarer Status,
- Created/Completed/Cancelled Actor und Zeitpunkt,
- optionaler Verweis auf die Interaction, aus der die Zusage stammt.

Ein Commitment ist bewusst **keine generische Aufgabe**: keine Checklisten, Unteraufgaben, Abhängigkeiten, Schätzungen oder Projektplanung.

## 6. Informationsarchitektur

Der Slice hat zwei primäre Routen und eine technische Eingangsmöglichkeit:

1. `/cases` — Cases-Inbox
2. `/cases/:caseId` — Case-Detail
3. authentifizierter Event-Eingang über API; für lokale Demo und Pilot zusätzlich eine klar als Testwerkzeug markierte Event-Input-Oberfläche oder Seed-Aktion

### Cases-Inbox

Die Inbox ist eine Arbeitsliste, kein Kanalpostfach. Jede Zeile zeigt:

- Case-Titel,
- externe Partei beziehungsweise verständlichen Fallback,
- letzte Timeline-Aktivität als Vorschau,
- Quellen-/Kanalindikator der letzten Interaction,
- Status,
- Owner oder deutlich „Nicht zugewiesen“,
- nächstes offenes Commitment mit Fälligkeit,
- relative letzte Aktualisierung.

Minimal erforderliche Ansichten/Filter:

- **Meine offenen Cases** — Standard für eingeloggte Nutzer,
- **Nicht zugewiesen**,
- **Alle aktiven**,
- **Gelöst**,
- Filter nach Status und Owner,
- Sortierung standardmäßig nach Aufmerksamkeit: überfälliges Commitment, unzugewiesen, neueste Aktivität.

Keine frei konfigurierbaren Views, gespeicherten Filter, Tags oder Volltextsuche im ersten Slice.

### Case-Detail

Desktop-first, responsiv bis Tablet; kein separates Mobile-Produkt. Zwei Hauptbereiche:

- **Hauptbereich:** kanalneutrale Timeline.
- **Kontextbereich:** Status, Owner, Commitments und minimale Quellenmetadaten.

Der Kopf zeigt Case-Titel, externe Partei/Fallback, Status, Owner und letzte Aktualisierung. Status und Owner sind direkt änderbar, ohne einen separaten Edit-Modus.

### Kanalneutrale Timeline

Alle Einträge werden chronologisch dargestellt, aber visuell nach Typ unterschieden:

- eingehende Interaction,
- importierte ausgehende Interaction,
- interne/systemische Interaction,
- Owner-Änderung,
- Statusänderung,
- Commitment erstellt, erfüllt oder abgebrochen,
- Ingestion-Hinweis bei redigiertem oder nicht darstellbarem Inhalt.

Jeder Eintrag zeigt, sofern vorhanden:

- Actor beziehungsweise Quelle,
- absolute Zeit im Tenant-Kontext und relative Zeit,
- Richtung und Kanal als Metadaten, nicht als Navigationsstruktur,
- Inhalt oder sichere Fallback-Beschreibung,
- Event-Herkunft/Source Reference in einer sekundären Detailansicht.

Originalinteraktionen und manuelle/abgeleitete Zustandsänderungen dürfen visuell nicht verwechselt werden.

## 7. Zustandsmodelle

### Case-Status

| Status | Bedeutung | Erlaubte Übergänge |
|---|---|---|
| `new` | durch Event neu erzeugt, noch nicht triagiert | `open`, `waiting_internal`, `waiting_external`, `resolved` |
| `open` | aktiver nächster Schritt liegt beim eigenen Team | `waiting_internal`, `waiting_external`, `resolved` |
| `waiting_internal` | wartet auf interne Person oder Team | `open`, `waiting_external`, `resolved` |
| `waiting_external` | wartet auf Kunde/Partner/externes System | `open`, `waiting_internal`, `resolved` |
| `resolved` | fachlicher Vorgang abgeschlossen | `open` |

Regeln:

- Neuer Case startet als `new` und ohne Owner.
- Ownership und Status sind unabhängig. Ein Case kann `waiting_external` bleiben und trotzdem einen Owner besitzen.
- Jede Änderung benötigt Actor und Zeitpunkt und erzeugt ein Timeline-Event.
- Neue eingehende Interaction auf `resolved` setzt den Case im Slice automatisch auf `open` und protokolliert `case.reopened`; das verhindert unsichtbare Kommunikation in geschlossenen Fällen.
- Wechsel auf `resolved` mit offenen Commitments öffnet eine Bestätigung mit drei expliziten Möglichkeiten: zurückgehen, Commitments einzeln erfüllen/abbrechen oder bewusst trotzdem lösen. Die Ausnahme wird als Event protokolliert.

### Ownership

| Zustand | Darstellung | Verhalten |
|---|---|---|
| nicht zugewiesen | Warnlabel „Nicht zugewiesen“ | erscheint in eigener Inbox-Ansicht |
| mir zugewiesen | Avatar/Name plus „Mir“ | erscheint in „Meine offenen Cases“ |
| anderer Nutzer | Avatar/Name | auswählbar aus aktiven Tenant-Mitgliedern |
| ehemaliger/deaktivierter Nutzer | Name plus „Deaktiviert“ | bestehende Historie bleibt; neue Zuweisung nötig |

Im Slice gibt es genau einen menschlichen Case Owner. Teams können angezeigt werden, sind aber noch keine verantwortlichen Owner. Gemeinsame Verantwortlichkeit würde die Kernhypothese verwässern.

### Commitment-Zustände

| Zustand | Bedeutung | Folgeaktion |
|---|---|---|
| offen, ohne Frist | gültige Zusage ohne Termin | kann erfüllt oder abgebrochen werden |
| offen, zukünftig fällig | terminierte Zusage | Fälligkeit sichtbar |
| überfällig | `open` und Fälligkeit liegt in Vergangenheit | höchste Aufmerksamkeitsstufe |
| erfüllt | Handlung wurde erledigt | unveränderlicher Abschlusszeitpunkt |
| abgebrochen | Zusage gilt bewusst nicht mehr | Abbruch bleibt nachvollziehbar |

## 8. Happy Path

### Ausgangslage

Ein authentifizierter Adapter sendet eine eingehende Interaction mit Tenant, Source, externer Conversation-Referenz, Actor-Anzeige, Zeit, Richtung, Inhalt und Idempotency Key.

### Ablauf

1. Das System validiert Tenant, Event-Version, Pflichtfelder und Idempotency Key.
2. Existiert noch keine Zuordnung zur externen Conversation-Referenz, wird ein Case angelegt; sonst wird der bestehende Case aktualisiert.
3. Die Interaction erscheint einmal in der Timeline. Ein Replay erzeugt keinen doppelten fachlichen Eintrag.
4. Der neue Case erscheint als `new` und „Nicht zugewiesen“ in der Cases-Inbox.
5. Eine Nutzerin öffnet den Case mit einem Klick.
6. Sie versteht Inhalt, Quelle und Zeitpunkt der Interaction und übernimmt den Case über „Mir zuweisen“.
7. Das System protokolliert die Zuweisung in der Timeline und setzt `new` auf `open`.
8. Sie legt das Commitment „Kostenvoranschlag bis morgen 16:00 senden“ an; Owner und Fälligkeit werden sichtbar.
9. Ein importiertes ausgehendes Event aus dem Quellsystem ergänzt später die Timeline.
10. Die Nutzerin markiert das Commitment als erfüllt.
11. Sie setzt den Case auf `resolved`.
12. Der Case verschwindet aus „Meine offenen Cases“, bleibt in „Gelöst“ auffindbar und behält den vollständigen Verlauf.

### Zeitbudget für UX-Abnahme

- Neuen Case finden und öffnen: höchstens 10 Sekunden.
- Owner übernehmen: höchstens 2 Interaktionen.
- Commitment anlegen: höchstens 4 Felder, davon nur Beschreibung verpflichtend.
- Case-Status ändern: höchstens 2 Interaktionen.
- Verlauf aus Interaction, Ownership und Commitment verstehen: höchstens 30 Sekunden in einem fünfteiligen Usability-Test.

## 9. Funktionale Anforderungen

### FR-1 Event-Eingang

- Nimmt versionierte kanonische Interaction-Events authentifiziert entgegen.
- Verlangt Tenant-Bindung, Source, External Event ID/Idempotency Key, External Conversation Reference, Occurred-at, Richtung und Payload beziehungsweise zulässigen Content-Fallback.
- Verarbeitet mindestens Textinhalt; Anhänge werden nur als sichere Metadaten/Placeholder dargestellt.
- Gibt eindeutiges Accepted-, Duplicate- oder Validation-Fehlerergebnis zurück.
- Ordnet Events idempotent einem Case zu.
- Bewahrt Source Reference und Ingestion-Zeit.
- Unterstützt Out-of-order-Anzeige nach `occurred_at`; die tatsächliche Ingestion-Reihenfolge bleibt als Metadatum nachvollziehbar.

### FR-2 Cases-Inbox

- Listet Cases tenantisoliert und paginiert.
- Unterstützt die vier definierten Ansichten und zwei Filter.
- Aktualisiert sich nach erfolgreichem Event-Eingang ohne manuellen Reload oder zeigt spätestens nach kurzer Polling-Latenz den neuen Case.
- Bewahrt die gewählte Ansicht beim Zurücknavigieren.
- Zeigt niemals nur Farbe als Statusinformation.

### FR-3 Case-Detail und Timeline

- Lädt Case-Kopf, aktuelle Projektion, Commitments und paginierte Timeline.
- Sortiert fachlich nach `occurred_at` und löst Gleichstände deterministisch.
- Unterscheidet Originalinteraktion, importierte Aktion und lokale Zustandsänderung.
- Zeigt unbekannte Actors, leere Inhalte und redigierte Inhalte mit verständlichem Fallback.
- Ein nicht darstellbarer Timeline-Eintrag darf nicht die gesamte Seite blockieren.

### FR-4 Ownership

- Nutzer kann sich selbst zuweisen, einen aktiven Tenant-Nutzer auswählen oder Ownership entfernen.
- Paralleländerung darf nicht still überschrieben werden; Konflikt zeigt aktuellen Stand und bietet erneutes Anwenden.
- Änderung erzeugt ein Operational Event und aktualisiert Inbox/Detail konsistent.

### FR-5 Status

- Nutzer kann nur definierte Übergänge auslösen.
- System protokolliert alten und neuen Status, Actor und Zeitpunkt.
- `resolved` mit offenen Commitments erfordert bewusste Behandlung oder dokumentierte Ausnahme.
- Neue eingehende Interaction öffnet einen gelösten Case wieder.

### FR-6 Commitments

- Erstellen, erfüllen und abbrechen; kein hartes Löschen.
- Beschreibung verpflichtend, 1–500 Zeichen.
- Owner standardmäßig aktueller Case Owner, aber änderbar auf aktiven Tenant-Nutzer.
- Fälligkeit optional; Speicherung als Zeitpunkt mit Zeitzone.
- Überfälligkeit wird serverseitig konsistent abgeleitet.
- Änderungen erscheinen in Timeline und Inbox-Projektion.

### FR-7 Aktualität und Konflikte

- Mutationen zeigen optimistischen Ladezustand nur, wenn Fehler zuverlässig zurückgerollt werden.
- Jede Projektion besitzt eine Version oder ETag für Konflikterkennung.
- Nach Fehler bleibt die Nutzereingabe erhalten, sofern sicher möglich.

## 10. Leere, Lade-, Fehler- und Randzustände

### Cases-Inbox

| Zustand | Nutzertext/Verhalten | Primäre Aktion |
|---|---|---|
| Tenant hat noch keine Cases | „Noch keine Cases. Sobald ein Event eingeht, erscheint es hier.“ | Testevent öffnen, nur für berechtigte Pilot-Admins |
| Ansicht hat keine Treffer | „Keine Cases in dieser Ansicht.“ | Filter zurücksetzen beziehungsweise Alle aktiven öffnen |
| Laden | Zeilen-Skeleton mit stabiler Geometrie | keine |
| Laden fehlgeschlagen | Fehler mit Correlation ID; bestehende Daten nicht als aktuell ausgeben | Erneut versuchen |
| nächste Seite fehlgeschlagen | vorhandene Zeilen bleiben sichtbar | Mehr erneut laden |
| Echtzeit/Polling unterbrochen | nicht-blockierender Hinweis „Aktualisierung pausiert“ | Neu verbinden |

### Case-Detail

| Zustand | Nutzertext/Verhalten | Primäre Aktion |
|---|---|---|
| Case nicht gefunden | neutral, ohne Existenz über Tenantgrenzen zu verraten | Zur Cases-Inbox |
| Case gelöscht/gesperrt | im Slice kein Hard Delete; bei fehlender Berechtigung generischer Zugriffshinweis | Zur Cases-Inbox |
| keine Timeline-Interaktion | Fallkopf bleibt sichtbar; „Noch keine darstellbare Interaktion“ | keine |
| Inhalt redigiert | „Inhalt gemäß Richtlinie nicht verfügbar“ plus erlaubte Metadaten | keine |
| unbekannter Actor | „Unbekannter Absender“ plus Source, keine erfundene Identität | keine |
| Teilfehler in Timeline | betroffener Eintrag als Fehlerkarte; Rest bleibt nutzbar | Eintrag erneut laden |
| veraltete Version beim Speichern | aktueller Serverstand wird erklärt | Änderungen prüfen und erneut anwenden |

### Owner und Mitglieder

- Kein aktives Mitglied außer aktuellem Nutzer: nur „Mir zuweisen“ oder „Nicht zugewiesen“.
- Deaktivierter aktueller Owner: sichtbar, aber nicht neu auswählbar.
- Nutzer verliert während Bearbeitung die Berechtigung: Mutation schlägt sicher fehl; kein Local-only-Erfolg.

### Commitments

- Keine Commitments: „Keine offenen Zusagen“ plus „Commitment anlegen“.
- Fälligkeit in Vergangenheit bei Erstellung: erlaubt, aber vor Speicherung deutlich als bereits überfällig markiert.
- Ungültige Zeitzone/Datum: Inline-Fehler, Eingabe bleibt erhalten.
- Commitment parallel erfüllt: aktueller Zustand wird geladen; doppelte Erfüllung erzeugt keine zweite fachliche Wirkung.

### Event-Eingang

- Duplicate: Erfolg als idempotentes Ergebnis, kein zweiter Timeline-Eintrag.
- Unbekannte Event-Version: abweisen, nichts teilweise schreiben.
- Unbekannter Kanal: akzeptieren, wenn kanonischer Vertrag erfüllt ist; Anzeige als „Andere Quelle“.
- Fehlender Inhalt: akzeptieren, wenn ein zulässiger Content-Status wie `redacted` oder `unavailable` vorliegt.
- Unbekannte Conversation Reference ohne Erstellbarkeit: klare Ablehnung statt Orphan-Interaction.
- Event für falschen Tenant: generische Ablehnung und Security-Log, keine Existenzinformation.

## 11. Berechtigungen im Slice

Minimal drei Rollen:

- **Pilot Admin:** Event-Testwerkzeug sehen, Mitglieder als Owner auswählen, alle Cases lesen und ändern.
- **Operator:** Cases lesen, Owner/Status ändern, Commitments verwalten; keine Event-Konfiguration.
- **Viewer:** Cases und Timeline lesen; keine Mutationen.

Alle Abfragen und Mutationen sind tenantgebunden. Die UI darf fehlende Berechtigung nicht nur durch versteckte Buttons behandeln; der Server erzwingt sie.

## 12. Nicht-funktionale Produktanforderungen

- Desktop First ab 1280 px; Tablet ab 768 px funktionsfähig.
- Tastaturfokus, semantische Labels und Kontrast mindestens nach WCAG 2.1 AA als Abnahmekriterium.
- P95 Cases-Liste und Case-Detail unter Pilotlast < 2 Sekunden, exklusive externer Event-Zustellung.
- Ein akzeptiertes Event wird unter normaler Pilotlast innerhalb von 5 Sekunden sichtbar.
- Keine unbemerkten doppelten Timeline-Einträge bei Replay.
- Absolute Zeit ist zugänglich; relative Zeit allein reicht nicht.
- Alle Mutationen haben sichtbares Erfolgs- oder Fehlerfeedback.
- Personenbezogene Inhalte erscheinen nicht in Frontend-Fehlertelemetrie.

## 13. Analytics und Validierung

### Produktmetriken

- Anteil aktiver Cases ohne Owner nach 15/60 Minuten.
- Zeit von erstem Event bis erster Owner-Zuweisung.
- Anteil aktiver Cases mit mindestens einem expliziten Commitment.
- Anzahl und Alter überfälliger Commitments.
- Anteil gelöster Cases mit dokumentiert behandeltem Commitment.
- Reopen-Rate nach neuer eingehender Interaction.
- Duplicate- und Ingestion-Fehlerrate.

### Validierungsmetriken, nicht Vanity Metrics

- Mindestens 80 % der Testnutzer können einen neuen unzugewiesenen Case ohne Hilfe finden.
- Mindestens 80 % können nach 30 Sekunden Owner, Status und nächste Zusage korrekt wiedergeben.
- Mindestens 70 % der beobachteten realen Fälle benötigen tatsächlich eine explizite Ownership- oder Commitment-Handlung.
- Pilotteam bestätigt mindestens drei reale Fälle, in denen die strukturierte Zusage oder sichtbare Verantwortung ein heutiges Risiko reduziert hätte.
- Kein Nutzer interpretiert `waiting_external` als „niemand verantwortlich“.

Page Views, Klickzahlen und Anzahl erzeugter Cases belegen allein keinen Produktwert.

## 14. Nicht-Ziele

- Nachrichten verfassen oder versenden.
- E-Mail-, WhatsApp- oder Voice-Provider vollständig anbinden; ein kanonischer Event-Vertrag und Test-/Pilot-Adapter reichen.
- Threading oder Identity Resolution über mehrere Quellen perfektionieren.
- mehrere Conversations automatisch zu einem Case zusammenführen.
- Case Split/Merge.
- AI-Zusammenfassung, Klassifikation, Commitment-Extraktion oder Antwortentwurf.
- autonome Agents oder Tool Calls.
- Regeln, SLA-Engine, Eskalationen oder Workflow-Builder.
- Tags, Custom Fields, Saved Views oder flexible Tabellenkonfiguration.
- internes Kommentarsystem, Mentions oder kollaborativer Editor.
- Anhänge anzeigen, herunterladen oder scannen; nur Metadaten/Placeholder.
- Customer Portal, Knowledge Base, Reporting Suite oder CRM.
- Bulk Actions.
- Mobile App.
- öffentliche SDKs, Marketplace, White Label oder GraphQL.

Diese Nicht-Ziele sind keine Aussage gegen die langfristige Roadmap. Sie verhindern, dass der erste Slice seinen Beweis durch Komfort- und Integrationsumfang verschleiert.

## 15. Teamdiskussion mit begründeten Widersprüchen

### Widerspruch 1 — Ohne Antworten ist es keine nutzbare Inbox

- **Customer Success:** Ein Operator muss ohnehin ins Quellsystem wechseln; ohne Composer entsteht Doppelarbeit und der Case kann nicht vollständig erledigt werden.
- **Communication Specialist:** Kommunikation wird erst dann wirklich einfacher, wenn Empfang, Kontext, Antwort und Commitment in einem Fluss liegen.
- **CPO:** Eine Sendestrecke verdoppelt den Risikoraum durch Auth, Zustellung, Templates, Opt-outs, Anhänge und kanalabhängige Regeln. Sie würde verdecken, ob Case Control selbst Wert erzeugt.
- **Entscheidung:** Kein Composer im Slice. Ein- und ausgehende Interactions aus Quellsystemen dürfen eingelesen werden, sodass der Verlauf vollständig sichtbar ist. Der nächste Slice darf Send nur ergänzen, wenn Nutzer den Wechsel ins Quellsystem als größten verbleibenden Engpass belegen.
- **Skalierungsprüfung:** Die Timeline kennt Richtung und Source, aber keine UI-Logik setzt einen bestimmten Send-Provider voraus.

### Widerspruch 2 — Case als neue Entität oder nur Conversation?

- **Sales:** „Case“ ist in 30 Sekunden verständlicher und näher am Budget als eine abstrakte Conversation Runtime.
- **UX Research:** Nutzer unterscheiden fachlichen Vorgang und Kanal-Thread; „Conversation“ wird leicht als Chatverlauf missverstanden.
- **Produkt-/Architekturrisiko:** Ein separates Case-Objekt könnte eine zweite Wahrheit neben Conversation schaffen und später branchenspezifische Semantik in den Kern ziehen.
- **Entscheidung:** „Case“ ist die UX-Sprache und ein operatives Read Model einer kanonischen Conversation, keine zweite Kernentität. Im Slice gilt 1:1; das UI darf diese technische Einschränkung nicht als ewige Fachregel darstellen.
- **Skalierungsprüfung:** Spätere Projektionen können mehrere Source Threads abbilden, ohne Case-Felder in Provideradapter einzubauen.

### Widerspruch 3 — Team-Ownership reicht für den MVP

- **Customer Success:** Viele Serviceorganisationen arbeiten real mit Gruppenpostfächern; Einzelzuweisung kann als zusätzliche Bürokratie abgelehnt werden.
- **Sales:** Teamzuweisung senkt Einführungswiderstand und passt zu existierenden Prozessen.
- **Communication Specialist/UX Research:** „Das Team besitzt es“ lässt die zentrale Unklarheit bestehen. Ein Team kann Routingkontext sein, aber niemand schuldet sichtbar den nächsten Schritt.
- **Entscheidung:** Aktive Cases haben höchstens einen menschlichen Owner; „Nicht zugewiesen“ bleibt sichtbar. Teamzugehörigkeit darf gefiltert oder angezeigt werden, ersetzt aber Ownership nicht.
- **Skalierungsprüfung:** Das Actor-Modell kann später Menschen, Teams, Systeme und AI als ausführende Actors aufnehmen; Verantwortungssemantik wird erst nach beobachteter Evidenz erweitert.

### Widerspruch 4 — Commitments automatisch aus Text extrahieren

- **Sales:** AI-Extraktion demonstriert den Differenzierungswert sofort und erzeugt den stärkeren Demo-Moment.
- **Communication Specialist:** Manuelle Erfassung ist Reibung; gerade vergessene Zusagen werden dann möglicherweise weiterhin nicht erfasst.
- **UX Research/Security:** Eine automatisch erfundene oder falsch datierte Zusage ist gefährlicher als eine fehlende. Ohne reale Ground Truth lernen wir außerdem nicht, welche Aussagen Nutzer überhaupt als Commitment ansehen.
- **Entscheidung:** Commitments werden im Slice manuell und strukturiert angelegt; optional kann eine Interaction als Quelle verlinkt werden. AI-Extraktion kommt erst als kontrollierter Vorschlag mit Source Span und Human Confirmation.
- **Skalierungsprüfung:** Commitment bleibt ein deterministisches Domainobjekt; sein Erzeuger kann später Mensch, Regel oder AI Actor sein.

### Widerspruch 5 — SLA, Eskalation und Dashboard sofort ergänzen

- **Customer Success/Teamleitung:** Ohne Eskalation werden überfällige Commitments zwar sichtbar, aber weiterhin übersehen.
- **Sales:** Ein Dashboard erleichtert den Executive Pitch und die ROI-Erzählung.
- **CPO:** Sichtbarkeit und manuelle Steuerung müssen zuerst verlässlich funktionieren. SLA- und Reportinglogik ohne validierten Prozess führt zu Custom Fields, Ausnahmen und Feature-Wildwuchs.
- **Entscheidung:** Überfälligkeit beeinflusst Sortierung und Darstellung; keine Benachrichtigung, Eskalation oder BI im Slice. Die operativen Events und Metriken werden so erzeugt, dass spätere Policies und Reports ohne Modellbruch möglich sind.
- **Skalierungsprüfung:** Ableitbare Events statt fest codierter E-Mail-Erinnerungen halten die spätere Automation kanalneutral.

## 16. Abnahmekriterien für „echter Vertical Slice“

Der Slice gilt nur als fertig, wenn ein Reviewer ohne Datenbank- oder Codeeingriff den vollständigen Happy Path demonstrieren kann:

1. Ein gültiges Testevent über den vorgesehenen Event-Eingang senden.
2. Accepted-Antwort erhalten und denselben Event erneut als Duplicate verarbeiten.
3. Den exakt einmal erzeugten Case in „Nicht zugewiesen“ sehen.
4. Case öffnen und die Interaction mit Source und Zeit in der Timeline erkennen.
5. „Mir zuweisen“ und die Owner-Änderung in Liste und Timeline sehen.
6. Ein terminiertes Commitment anlegen und dessen Darstellung in Liste und Detail sehen.
7. Commitment erfüllen und Case lösen.
8. Ein neues eingehendes Event derselben External Conversation senden und den automatisch wieder geöffneten Case sehen.
9. Einen Validierungsfehler, einen Berechtigungsfehler und einen Paralleländerungskonflikt verständlich behandeln.
10. Mit Viewer-Rolle keine Mutation serverseitig ausführen können.

Zusätzlich müssen automatisierte Tests mindestens Idempotency, Tenant-Isolation, erlaubte Statusübergänge, Reopen, Commitment-Überfälligkeit und Konflikterkennung abdecken.

## 17. Empfohlene Implementierungsreihenfolge

Diese Reihenfolge beschreibt Produktinkremente, keine Architekturvorgabe:

1. Kanonischer Event-Vertrag, Validierung, Tenant-Bindung und idempotente Persistenz.
2. Case-Projektion und read-only Cases-Inbox.
3. Case-Detail mit kanalneutraler read-only Timeline.
4. Owner-Mutation inklusive Audit-/Timeline-Event.
5. Status-Mutation inklusive Reopen-Regel.
6. Commitment-Lifecycle und Inbox-Aufmerksamkeit.
7. Rollen, Konflikte, Fehler- und Leerzustände.
8. Instrumentierung, Accessibility, Performance und End-to-End-Abnahme.

Nach jedem Schritt muss die UI auf realistischen Fixtures nutzbar bleiben. Kein UI-Screen wird nur gegen lokale Mock-Daten als „fertig“ akzeptiert, wenn sein Write-/Read-Pfad Teil des Slice ist.

## 18. Go-/No-Go nach Pilotnutzung

### Go für den nächsten Produkt-Slice

- Nutzer führen reale Cases mindestens fünf Arbeitstage über Owner, Status und Commitments.
- Die JTBD-Verständnistests werden erreicht.
- Mindestens drei belegte Risiko- oder Zeitersparnisse entstehen.
- Der größte verbleibende Engpass ist ein klarer nächster Schritt wie Antwort-Send, Handoff oder Context Link – nicht grundlegende Ablehnung des Case-Modells.

### Rework

- Cases werden genutzt, aber Status oder Commitment-Semantik wird regelmäßig falsch verstanden.
- Owner wird als reine Administration empfunden und außerhalb des realen Workflows gepflegt.
- Timeline mischt Fakten und lokale Änderungen so, dass Nutzer ihr nicht vertrauen.

### No-Go

- Nutzer bleiben vollständig in kanalbezogenen Postfächern und sehen keinen zusätzlichen Wert in Case Control.
- Mehr als 30 % der realen Fälle benötigen vor jeder sinnvollen Nutzung kundenspezifische Kernfelder oder Sonderstatus.
- Der Nutzen entsteht ausschließlich durch ein noch nicht vorhandenes AI-Feature oder vollständigen Channel-Ersatz.
- Das Team kann nicht erklären, welcher messbare Schaden durch Ownership oder Commitments reduziert wird.

## 19. Produktentscheidung in einem Satz

Wir entwickeln jetzt keinen breiten Helpdesk, sondern den kleinsten vollständigen Beweis der Plattformthese: **Ein providerneutrales Event wird zu einem steuerbaren Kommunikationsfall mit verständlichem Verlauf, eindeutigem Owner, explizitem Zustand und überprüfbarer Zusage.**
