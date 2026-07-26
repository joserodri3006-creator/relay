# Technical Discovery & Pilot Readiness v0.1

**Stand:** 20. Juli 2026  
**Zweck:** Beide Beachhead-Hypothesen vor Produktbau mit identischen technischen Gates prüfen.  
**Geltungsbereich:** Discovery und zeitlich begrenzte Proofs; keine produktive Plattform, keine Migration und kein autonomes externes Senden.

## 1. Executive Decision

Die technische Discovery beantwortet nur vier Fragen:

1. Können wir innerhalb von zehn Arbeitstagen ein reales Kommunikationsereignis sicher, nachvollziehbar und wiederholbar in das kanonische Modell überführen?
2. Reichen die verfügbaren Identitäts- und Kontextdaten, um einen messbaren Prozessnutzen ohne gefährliche Fehlzuordnungen zu erzeugen?
3. Darf und kann autorisierter Kontext für AI Assist genutzt werden, ohne Security, Datenschutz oder Käufervertrauen zu brechen?
4. Bleiben mindestens 80 % der technischen Arbeit für beide Beachheads und spätere Kunden wiederverwendbar?

Ein **erstes Event** ist erst erreicht, wenn eine reale oder freigegebene historische Interaction über einen echten Quellzugang eingelesen, einem Tenant zugeordnet, in ein versionsfixiertes kanonisches Schema normalisiert, mit Herkunft und Zeitstempeln gespeichert, im Audit nachgewiesen und idempotent erneut verarbeitet werden kann. Ein manuell hochgeladenes JSON-Beispiel oder ein Provider-Webhook ohne sichere Speicherung zählt nicht.

Die Discovery baut keine Inbox, keine produktive Channel-Sendestrecke, keine Workflow Engine und keine autonome KI. Sie erzeugt Beweise, Entscheidungsdaten und Integrationsverträge.

## 2. Zwei Beachhead-Hypothesen, ein technischer Kern

| Prüfbereich | Hypothese A: technische Serviceorganisation | Hypothese B: AI-reife B2B Customer Operations |
|---|---|---|
| Wahrscheinliche Quellen | Shared Mailbox, WhatsApp Business, CRM/ERP, Ticket-/Field-Service-System, CSV-Stammdaten | Helpdesk, CRM, Produkt-/Agent-Events, Data Warehouse, Identity Provider, AI-Agent-Logs |
| Kritischer Context Link | Auftrag, Gerät, Standort, Termin, Partnerbetrieb | Account, Vertrag, Ticket, Produktinstanz, SLA |
| Identity-Risiko | Geteilte Telefonnummern, Angehörige, Geräte-/Standortbezug, wechselnde Techniker | Mehrere Domains, Aliase, Bots, Service Accounts, Nutzer über mehrere Workspaces |
| Security-Schwerpunkt | private WhatsApp-Nutzung, Medien/EXIF, Freitext mit personenbezogenen Daten, heterogene Partner | Agent Tool Calls, Prompt-/Kontextabfluss, feinere RBAC, SSO, bestehende Audit-/DLP-Anforderungen |
| Erster messbarer Nutzen | Übergabe, Verantwortlicher und nächster Schritt über E-Mail/WhatsApp | Policy-konformer Human-AI-Handoff und vollständige Entscheidungsprovenienz |
| Typischer Integrationsblocker | kein offizieller WhatsApp-Zugang oder unklare Datenverantwortung | Security Review, fehlende Agent-Telemetrie oder nicht exportierbare Systemdaten |

**Gemeinsamer Plattformkern:** Tenant, Actor, Identity, Conversation, Interaction, Content Reference, Context Link, Commitment, Capability und Event. Vertikale Objekte bleiben externe Context Links; `repair_order`, `ticket` oder `account` werden nicht zu Kernentitäten.

## 3. Integration Readiness Assessment

### 3.1 Bewertungsverfahren

Jede Quelle wird in einem 90-minütigen technischen Workshop und durch mindestens einen realen Read-only-Test bewertet. Aussagen ohne Screenshot, API-Antwort, Exportbeispiel, Vertrag oder benannten Owner gelten als **unbelegt**.

Bewertung je Kriterium:

- **0 – blockiert:** nicht vorhanden, rechtlich unklar oder nicht testbar.
- **1 – riskant:** manuell, unvollständig, nicht stabil oder nur durch Sonderbau lösbar.
- **2 – pilotfähig:** dokumentiert, zugänglich und mit begrenztem Workaround nutzbar.
- **3 – wiederverwendbar:** standardisiert, automatisierbar, beobachtbar und klar verantwortet.

| Kriterium | Zu belegende Frage | Gewicht |
|---|---|---:|
| Geschäftlicher Prozess | Ist ein konkreter Anfang, ein Outcome und ein Owner benannt? | 10 % |
| Quellzugang | Gibt es offizielle API, Webhook oder stabilen Export mit Testzugang? | 15 % |
| Datenrechte | Darf der Kunde die Daten für Pilot, AI-Verarbeitung und Evaluation bereitstellen? | 15 % |
| Eventqualität | Sind stabile IDs, Zeitstempel, Teilnehmer, Thread-/Reply-Bezüge und Zustellstatus vorhanden? | 10 % |
| Identity-Signale | Existieren verlässliche Schlüssel und eine autoritative Korrekturquelle? | 10 % |
| Kontextzugang | Kann mindestens ein relevantes Geschäftsobjekt verknüpft werden? | 10 % |
| Security | Sind Zugang, Secrets, IP-/Scope-Begrenzung, Löschung und Incident-Kontakt geklärt? | 10 % |
| Datenschutz | Rollen, Zwecke, Betroffene, Regionen, Aufbewahrung und Subprozessoren sind dokumentiert? | 10 % |
| Betrieb | Owner, Sandbox, Quotas, Retry-Verhalten und Support-Eskalation sind bekannt? | 5 % |
| Wiederverwendbarkeit | Kann der Adapter ohne kundenspezifische Kernsemantik erneut genutzt werden? | 5 % |

**Gate:** mindestens 75/100 insgesamt, kein Wert 0 bei Quellzugang, Datenrechten, Security oder Datenschutz und mindestens eine Kommunikationsquelle plus eine Kontextquelle mit Wert 2 oder 3. WhatsApp ist für Hypothese A zusätzlich Pflicht; Agent-/Tool-Call-Provenienz ist für Hypothese B Pflicht.

### 3.2 Intake-Artefakte je Kandidat

- Systemlandkarte mit System Owner, Daten Owner, Zweck und Datenfluss.
- Je Quelle: Authentisierung, Scopes, Sandbox, API-/Webhook-Version, Quotas, Sample Payloads und Fehlercodes.
- 50–200 redigierte oder zweckgebunden freigegebene Beispiel-Interactions aus dem Zielprozess.
- Datenwörterbuch der Identitäts- und Kontextfelder einschließlich Nullraten.
- DPA/AVV-Status, TOMs, Aufbewahrung, Löschweg, Subprozessorfreigabe und Region.
- RACI für Security-Freigabe, Integration, fachliche Validierung und Incident Response.
- Baseline: Volumen, Spitzenlast, Median-/P95-Latenz, verlorene Übergaben, offene Zusagen und Korrekturrate.

## 4. Daten-, Security- und AI-Fragen

### 4.1 Daten und Identität

1. Welche Quelle ist für Person, Organisation und Geschäftsobjekt jeweils autoritativ?
2. Welche Identifikatoren sind stabil, welche wiederverwendbar und welche geteilt?
3. Können Telefonnummern, E-Mail-Aliase oder Accounts mehreren Actors gehören?
4. Sind Thread-IDs fachlich belastbar oder nur kanalspezifische Darstellungen?
5. Wie werden Merge, Split, Löschung und nachträgliche Korrekturen heute behandelt?
6. Welche Felder fehlen regelmäßig, und wie hoch sind Null-, Dubletten- und Konfliktraten?
7. Welche Zeitstempel stammen vom Provider, vom Quellsystem oder vom Import?
8. Wie werden Anhänge, Voice Notes, Zitate, Weiterleitungen und Bearbeitungen repräsentiert?
9. Welches Geschäftsobjekt erlaubt den ersten nützlichen Context Link?
10. Welche Daten dürfen nie tenant-, team- oder fallübergreifend verknüpft werden?

### 4.2 Datenschutz und Governance

1. Wer ist Verantwortlicher, Auftragsverarbeiter und gegebenenfalls weiterer Auftragsverarbeiter je Datenfluss?
2. Was sind Zweck und Rechtsgrundlage für Ingestion, AI Assist, Evaluation und Aufbewahrung?
3. Enthalten Daten besondere Kategorien, Beschäftigtendaten, Minderjährige oder private Kommunikation?
4. Welche Datenresidenz und welche genehmigten Subprozessoren gelten?
5. Welche Retention gilt für Originalinhalt, Metadaten, Audit, Prompt, Output und Embeddings?
6. Wie werden Auskunft, Berichtigung, Einschränkung, Export und Löschung technisch durchgereicht?
7. Muss AI-Verarbeitung opt-in, feldweise redigiert oder für bestimmte Conversations gesperrt sein?
8. Dürfen Daten für Modelltraining genutzt werden? Default-Entscheidung: nein.
9. Wer darf Exporte, Replays, Identity-Merges und Policy-Änderungen ausführen?
10. Welche Nachweise verlangt der Käufer vor Pilotstart, und welche erst vor Rollout?

### 4.3 Security und Betrieb

1. Unterstützt die Quelle OAuth mit minimalen Scopes, kurzlebigen Tokens und Rotation?
2. Wie werden Webhooks signiert, gegen Replay geschützt und nach Ausfällen erneut geliefert?
3. Welche Netzwerk-, IP-, Zertifikats- oder Private-Link-Anforderungen bestehen?
4. Wo werden Secrets angelegt, rotiert, widerrufen und auditiert?
5. Wie wird Tenant-Isolation in Storage, Queue, Cache, Logs und Supportzugriff bewiesen?
6. Welche Inhalte müssen vor Logs, Traces und AI-Aufrufen redigiert werden?
7. Welche RTO/RPO-, Backup- und Restore-Erwartungen hat der Pilot?
8. Welche Quotas, Burst-Limits und Fair-Use-Regeln können den Pilot verfälschen?
9. Wer empfängt Security Incidents und in welchem Zeitfenster?
10. Welche Export-/Löschbestätigung beendet den Pilot nachweisbar?

### 4.4 AI-spezifisch

1. Welche klar begrenzte Aufgabe wird evaluiert: Klassifikation, Extraktion, Zusammenfassung oder Entwurf?
2. Was ist die Ground Truth, wer annotiert sie und wie wird Uneinigkeit behandelt?
3. Welche Quellen darf der Context Builder aufgabenbezogen lesen?
4. Welche Outputs benötigen Zitat/Source Span, Confidence und menschliche Freigabe?
5. Welche Fehlerklasse ist kritisch: falsche Identität, erfundene Zusage, ausgelassene Frist, Datenleck oder unangemessener Ton?
6. Welche Sprache, Dialekte, Codes, Abkürzungen und Medien kommen real vor?
7. Sind Modellprovider, Region, Zero-Retention und Training-Ausschluss vertraglich akzeptabel?
8. Wie werden Prompt-/Policy-Version, Modellklasse, Input-Quellen, Output, Kosten und Latenz protokolliert?
9. Welche deterministische Baseline muss AI schlagen?
10. Welche Aufgabe bleibt verboten, selbst wenn Offline-Metriken gut sind?

## 5. Zehn Arbeitstage bis zum ersten Event

Der Plan startet erst, wenn ein Sponsor, ein technischer Owner und ein Datenschutz-/Security-Ansprechpartner benannt sind.

| Tag | Arbeit | Abnahmebeweis |
|---:|---|---|
| 1 | 60-minütiges Kickoff; einen Prozess, eine Kommunikationsquelle, eine Kontextquelle und ein Outcome fixieren; Datenfluss skizzieren | signierter Scope, RACI, Systemlandkarte, klare Definition des ersten Events |
| 2 | API-/Export-Zugang und minimal benötigte Scopes prüfen; Sample Payload abrufen; Datenrechte bestätigen | erfolgreicher Read-only-Call/Export, Scope-Liste, schriftlicher Datenfreigabestatus |
| 3 | 50–200 Samples profilieren; PII, IDs, Nullraten, Duplikate, Zeitstempel und Threadbezüge untersuchen | Data Profile und dokumentierte Qualitätsprobleme |
| 4 | Source-to-canonical Mapping und Adaptervertrag entwerfen; unbekannte Felder verlustfrei als Source Envelope bewahren | versioniertes Mapping, Schema-Fixtures, offene Semantikliste |
| 5 | Threat Model und Datenschutz-Gate durchführen; Retention, Redaction, Secrets und Pilotlöschung festlegen | freigegebene Kontrollliste oder dokumentiertes No-Go |
| 6 | dünnen, wegwerfbaren Ingestion Harness gegen Sandbox/Export konfigurieren; Signatur/Authentisierung validieren | reproduzierbarer Abruf mit Correlation ID; kein Produktcode erforderlich |
| 7 | Normalisierung, Tenant-Bindung, Idempotency und Out-of-order-Verhalten an Fixtures testen | Testprotokoll für Duplikat, Replay, fehlende Felder und falschen Tenant |
| 8 | erste reale Interaction in isolierten Discovery-Store aufnehmen und einen Context Link beziehungsweise dessen belegtes Fehlen protokollieren | auditierbarer Datensatz mit Source Envelope, Canonical Event und Provenance |
| 9 | Replay, Löschung und Export ausführen; fachlicher Owner validiert Bedeutung; technische Findings bewerten | gleiche fachliche Wirkung bei Replay, Lösch-/Exportnachweis, Domain-Sign-off |
| 10 | Readout gegen Readiness Score, Risiken und Pilotkriterien; Go, Conditional Go oder No-Go entscheiden | Decision Record mit Aufwand, offenen Kontrollen, Adapter-Reuse und Pilotempfehlung |

**Stop-the-clock-Regel:** Wartezeit auf kundenseitige Freigaben wird separat gemessen, aber nicht schöngerechnet. Berichtet werden Kalenderzeit und aktive technische Zeit. Das Zehn-Tage-Kriterium ist verfehlt, wenn benötigte Zugänge oder Freigaben vorab nicht realistisch beschaffbar sind.

## 6. Technische Proof-Aufgaben ohne Produktbau

Alle Proofs laufen mit Fixtures, Sandbox, Read-only APIs oder freigegebenen historischen Daten. Artefakte dürfen wegwerfbare Harnesses und Schematests sein; sie dürfen nicht zum Schatten-MVP anwachsen.

### Gemeinsame Proofs

1. **Round-trip Provenance:** Source Payload → Canonical Interaction/Event → Export mit unverändertem Source Envelope und erklärbarem Mapping.
2. **Idempotency/Replay:** dasselbe Event zehnmal und in falscher Reihenfolge einspeisen; genau eine fachliche Wirkung, nachvollziehbare Versuche.
3. **Tenant-Isolation Attack Test:** manipulierte Tenant-ID, Object-ID und Queue-Metadaten dürfen weder Datenzugriff noch Cross-Tenant-Link erzeugen.
4. **Identity Collision Lab:** mehrdeutige Telefonnummern/E-Mails, Alias, Reuse und absichtlicher Fehl-Merge; System muss unsichere Fälle stehen lassen und Korrekturhistorie erhalten.
5. **Deletion Drill:** Originalinhalt, Ableitungen und Suchprojektionen gemäß Retention entfernen, während minimales zulässiges Audit bestehen bleibt.
6. **Adapter Contract Test:** dieselben Canonical Fixtures aus E-Mail und WhatsApp beziehungsweise zweiter Quelle erzeugen; Provider-ID bleibt externe Referenz.
7. **AI Shadow Evaluation:** offline auf freigegebenem Golden Set; keinerlei externes Senden, keine Aktion im Kundensystem.
8. **Failure Injection:** Rate Limit, Timeout, doppelte Webhooks, ungültige Signatur, abgelaufenes Token und teilweise fehlende Daten simulieren.

### Zusätzliche Proofs für Hypothese A

- WhatsApp-Ownership und offizieller Business-Zugang belegen; keine private oder inoffizielle Session verwenden.
- Medien/Voice Notes nur hinsichtlich Metadaten, Größen, Malware-/PII-Risiko und Abrufrechten prüfen; keine Voice-Produktfunktion bauen.
- E-Mail ↔ WhatsApp Identity-Vorschlag anhand eines autoritativen Auftrags-/Kundenobjekts testen; ohne autoritative Brücke kein automatischer Merge.
- Handoff-Simulation aus historischen Fällen: Kann aus vorhandenen Signalen Owner, Frist und Übernahmebeleg rekonstruiert werden?

### Zusätzliche Proofs für Hypothese B

- Agent-Provenance-Fixture: Modellklasse, Agent, Prompt-/Policy-Version, Tool Call, Autorisierung, Quellen und Human Handoff in ein neutrales Eventmodell überführen.
- Capability-Test: Ein Agent darf nur aufgaben- und tenantgebundene Kontexte lesen; manipulierte Tool-Argumente müssen blockiert werden.
- Providerwechsel auf einem kleinen Golden Set: ein zweiter Modelladapter wird als Vertragstest oder Mock validiert, nicht produktiv integriert.
- Audit-Rekonstruktion: Ein Auditor kann aus Events erklären, welcher Actor mit welchen Quellen eine Empfehlung erzeugte und wer sie freigab.

## 7. Hauptrisiken und Behandlung

| Risiko | Frühindikator | Behandlung im Pilot | Skalierungsentscheidung |
|---|---|---|---|
| Falscher Identity-Merge | geteilte/recycelte IDs, Konflikte zwischen Quellen | nur Vorschläge oberhalb Schwelle; Auto-Merge zunächst verboten; Merge/Split mit Audit | probabilistische Resolver als austauschbare Strategie, autoritative Regeln tenantbezogen |
| Conversation = Channel Thread | fachlicher Vorgang verteilt sich über Threads/Kanäle | Thread nur als Source Reference; Context Links separat | semantische Conversation-Zuordnung bleibt versionierbare Projektion |
| Provider-Semantik leakt in Kern | Kernfelder heißen wie Providerobjekte | Source Envelope + Mapping; Contract Tests | Adapterversionen, additive Canonical Schemas, keine Provider-ID als PK |
| AI Halluzination/Unterlassung | falsche Zusage, fehlende Frist, nicht belegte Aussage | source-grounded Output, Confidence, Human Review, Task-Kill-Switch | Freigabe pro Aufgabe/Trust Level statt pauschaler Agent-Autonomie |
| Prompt-/Kontextabfluss | unerlaubte Felder in Modellinput oder Logs | deterministischer Context Builder, Redaction, Zero-Retention sofern verfügbar | Policy Enforcement vor Model Gateway; kontextbezogene Capabilities |
| Channel Lock-in/Änderung | API-Rechte, Preise oder Policies ändern sich | zweiter Adaptervertrag und Exportpfad prüfen | Transport von Conversation Runtime trennen; Capability Matrix je Kanal |
| Doppelte/vertauschte Events | at-least-once Webhooks, Provider-Retries | Idempotency-Key, Source Sequence/Time, Reconciliation Job | partitionierbare Worker; fachlich commutative/versionsgeprüfte Handler |
| Anhänge erhöhen Angriffsfläche | große Dateien, Malware, PII in Medien | Metadaten zuerst, Quarantäne, Scanning, zeitbegrenzte URLs | Content Store getrennt, Policy pro Medientyp und Region |
| Consulting dominiert | jedes Mapping enthält kundenspezifische Kernlogik | Custom Mapping budgetieren und messen | Adapter-/Mapping-Katalog; >20 % exklusive Discovery-Arbeit ist Warnsignal |
| Audit vs. Löschung | unveränderliches Log enthält löschpflichtigen Inhalt | Audit enthält Referenz/Hash und minimale Metadaten, Content getrennt löschbar | kryptografisch/organisatorisch getrennte Retention-Klassen |

## 8. Pilot-Abnahmekriterien

Ein Kandidat erhält nur dann **Pilot Ready**, wenn alle Muss-Kriterien erfüllt sind.

### Muss

- Erster Event innerhalb von zehn Arbeitstagen nach Kickoff gemäß Definition erreicht.
- Mindestens eine reale Kommunikationsquelle und eine relevante Kontextquelle sind legal und technisch zugänglich.
- 100 % der getesteten Events sind einem Tenant und einer Quelle zuordenbar; kein Cross-Tenant-Fund in Negativtests.
- Replay erzeugt keine doppelte fachliche Wirkung; Duplikate und Out-of-order-Events sind sichtbar behandelt.
- Source Payload, Mapping-Version, Correlation ID und Verarbeitungsschritte sind auditierbar.
- Löschung und Export wurden mit Pilotdaten praktisch demonstriert.
- Kein automatischer unsicherer Identity-Merge; jede Korrektur bleibt nachvollziehbar.
- AI bleibt Shadow/Assist, ist auf freigegebene Quellen begrenzt und wird nicht zum Training des Providers verwendet.
- Mindestens 50 gelabelte reale Fälle und eine deterministische Baseline existieren für jede getestete AI-Aufgabe.
- Technischer und fachlicher Owner sowie Incident- und Datenlöschkontakte sind benannt.
- Mindestens 80 % der vorgeschlagenen technischen Komponenten/Verträge sind segmentunabhängig; Sonderarbeit ist geschätzt.
- Kosten, erwartetes Volumen, Providerquoten und größte Lastspitze sind dokumentiert.

### Segment-spezifisch

**Hypothese A:** offizieller WhatsApp-Business-Zugang; E-Mail und WhatsApp berühren nachweislich denselben Geschäftsprozess; ein autoritatives Auftrags-/Kundenobjekt kann verknüpft werden; private Kommunikation wird ausgeschlossen oder sauber abgegrenzt.

**Hypothese B:** Agent-/Tool-Call-Provenienz ist verfügbar; Capability-Grenzen sind testbar; Human Handoff kann rekonstruiert werden; Security akzeptiert den begrenzten Model- und Datenfluss.

### Zielwerte für den späteren produktiven Pilot, nicht für Discovery

- Ingestion-Erfolgsrate ≥ 99,5 % nach Reconciliation, ohne unbemerkten Verlust.
- P95 Source-to-canonical-Latenz ≤ 60 Sekunden für Webhooks beziehungsweise dokumentiertes Batch-SLO bei Exportquellen.
- 0 kritische Cross-Tenant-, AuthZ- oder Secret-Findings.
- 100 % menschliche Freigabe vor externer AI-Kommunikation.
- AI-Qualität wird aufgabenspezifisch festgelegt; keine gemittelte „AI Accuracy“. Kritische Fehler müssen einzeln gezählt und vor Pilotbeginn mit maximaler Toleranz versehen werden.

## 9. No-Go- und Conditional-Go-Kriterien

### Sofortiges No-Go

- Datenrechte, Rollen nach DSGVO oder Zulässigkeit der Pilotverarbeitung bleiben ungeklärt.
- Der Zugang verlangt Scraping, inoffizielle WhatsApp-Sessions, geteilte Passwörter oder Umgehung von Providerregeln.
- Tenant-Isolation, minimale Scopes, Secret Rotation oder Pilotlöschung können nicht umgesetzt beziehungsweise getestet werden.
- Reale Daten können nur durch dauerhaft manuelle Exporte ohne stabilen Owner bereitgestellt werden.
- Der gewünschte Nutzen setzt autonomes externes Senden vor ausreichender Evaluation voraus.
- Der Kunde fordert Providertraining mit Pilotdaten oder akzeptiert keine zweckgebundene Verarbeitung.
- Eine autoritative Korrektur für Identity-Merges existiert nicht, gleichzeitig verlangt der Prozess automatische kanalübergreifende Zusammenführung.
- Hypothese A: WhatsApp ist kein offizieller Business-Kanal oder E-Mail/WhatsApp gehören nicht zu demselben Outcome.
- Hypothese B: Agent-Aktionen/Tool Calls sind nicht exportierbar und Human-AI-Handoffs nicht auditierbar.
- Mehr als 30 % der erwarteten Pilotarbeit erfordert vertikale Kernsemantik oder kundenspezifische Infrastruktur.

### Conditional Go

- API fehlt, aber ein vertraglich stabiler, automatisierter und auditierbarer Export reicht für den Lernzweck.
- SSO/SCIM fehlt, sofern Pilotzugriff auf wenige benannte Nutzer, MFA und manuell auditierte Provisionierung begrenzt ist.
- AI-Kontext ist noch nicht freigegeben, sofern der Kernnutzen deterministisch testbar bleibt und die AI-Hypothese separat als offen ausgewiesen wird.
- Identity Confidence ist schwach, sofern der Pilot bewusst ohne Auto-Merge und mit messbarem Review-Aufwand läuft.

## 10. Teamdiskussion: Widersprüche und Entscheidung

### Widerspruch 1: WhatsApp sofort technisch anbinden?

- **Sales/Customer Success:** Für Hypothese A ist ein WhatsApp-Beweis zwingend; sonst testen wir nicht den realen Schmerz.
- **Security/Enterprise:** Frühe echte Anbindung erzeugt Datenschutz-, Medien- und Provider-Risiken und kann Discovery blockieren.
- **Software Architect/API:** Ein Mock beweist den Adaptervertrag, aber nicht Zugang, Quoten oder reale Providersemantik.
- **Entscheidung:** In Hypothese A wird am echten offiziellen Zugang read-only beziehungsweise in einer kontrollierten Sandbox getestet; keine Sendestrecke. Fehlt dieser Zugang, ist A kein pilotfähiger Kandidat. Für B ist WhatsApp nicht Voraussetzung.

### Widerspruch 2: AI schon in der Discovery evaluieren?

- **AI Architect:** Ohne reale Daten und Golden Set lässt sich nicht prüfen, ob autorisierter Kontext einen Vorteil erzeugt.
- **Security/QA:** Frühe Modellnutzung kann Daten abfließen lassen und mit zu kleinen Samples falsche Sicherheit erzeugen.
- **CPO/Finance:** Wenn AI vollständig vertagt wird, bleibt der höhere Plattformwert von B ungetestet.
- **Entscheidung:** AI wird nur offline im Shadow Mode auf zweckgebunden freigegebenen, mindestens notwendigen Daten evaluiert. Deterministische Baseline, Source Grounding und kritische Fehlerklassen sind Pflicht. Kein Fine-Tuning, keine Autonomie, kein produktiver Tool Call.

### Widerspruch 3: Ein zehn-Tage-Ziel trotz Enterprise-Security?

- **CEO/Sales:** Time-to-first-event ist ein Kernversprechen und muss ehrlich getestet werden.
- **Enterprise/Security:** Ein komplexer Kunde kann allein für Freigaben länger benötigen; ein pauschales Ziel bevorzugt weniger anspruchsvolle Kunden.
- **DevOps/API:** Technische Laufzeit und Kalenderzeit müssen getrennt werden, aber Freigabefähigkeit ist selbst Teil der Readiness.
- **Entscheidung:** Beide Zeiten werden berichtet. Das Ziel gilt als verfehlt, wenn der reguläre Freigabeweg den ersten Event in zehn Arbeitstagen unrealistisch macht. Ein vorausgefülltes Security Pack darf beschleunigen; Umgehungen zählen nicht.

### Widerspruch 4: Unveränderlicher Audit Log oder DSGVO-Löschung?

- **Enterprise/QA:** Vollständige Rekonstruktion verlangt unveränderliche Historie.
- **Security/Datenschutz:** Personenbezogene Inhalte dürfen nicht pauschal unbegrenzt im Event Log leben.
- **Data/Architect:** Auditfakt und Kommunikationsinhalt benötigen verschiedene Retention-Klassen.
- **Entscheidung:** Das unveränderliche Audit speichert minimale Aktionsmetadaten, Referenzen und gegebenenfalls Hashes; löschpflichtiger Content und erneuerbare AI-/Search-Projektionen bleiben getrennt. Der Lösch-Drill validiert diese Grenze vor Pilot.

### Widerspruch 5: Frühe generische Plattform oder kundenspezifischer Adapter?

- **API/Architect:** Frühe Standardverträge verhindern, dass vertikale Semantik den Kern kontaminiert.
- **Customer Success/Sales:** Ein schlanker kundenspezifischer Export kann schneller echten Nutzen beweisen.
- **QA/Finance:** Zu frühe Generalisierung ist teuer; ungemessene Sonderarbeit skaliert ebenfalls nicht.
- **Entscheidung:** Der erste Adapter darf eine kundenspezifische Mapping-Konfiguration besitzen, muss aber einen generischen, versionierten Adaptervertrag erfüllen. Sonderarbeit wird separat gemessen. Mehr als 20 % ist Warnsignal, mehr als 30 % No-Go.

## 11. Begründete Gesamtentscheidung

Beide Beachheads durchlaufen denselben zehntägigen Beweispfad und dieselben Security-Invarianten. Segment-spezifisch sind nur Pflichtquellen, Context Links und zusätzliche Proofs. Dadurch vergleichen wir nicht den Charme zweier Demos, sondern die reale Fähigkeit, eine wiederverwendbare Communication Control Plane sicher in Betrieb zu bringen.

Die technische Empfehlung lautet **Go** nur für Kandidaten, die den ersten Event ohne Regelumgehung erreichen, Identity-Unsicherheit kontrollierbar machen, einen autorisierten Context Link liefern und das Kernmodell zu mindestens 80 % unverändert nutzen. Bei technisch gleich starken Kandidaten ist Hypothese B zu bevorzugen, weil Agent-Provenienz, Capabilities und Audit die Control-Plane-These direkter testen. Hypothese A gewinnt nur, wenn der kanalübergreifende operative Prozess deutlich schneller integrierbar ist und einen stärkeren, messbaren Outcome liefert.

## 12. Konkrete Arbeitspakete des Discovery-Zyklus

1. Readiness-Fragebogen und evidenzbasierte Scorecard als wiederverwendbare Vorlage erstellen.
2. Canonical Event v0 und Source Envelope v0 als Schema-Fixtures definieren, noch nicht als öffentliche API festschreiben.
3. Threat-Model-Template und Datenflussdiagramm je Kandidat ausfüllen.
4. E-Mail-/WhatsApp-Contract-Fixtures für A sowie Agent-Provenance-Fixtures für B sammeln.
5. Wegwerfbaren Read-only Ingestion Harness und Contract Tests vorbereiten.
6. Identity Collision Corpus und 50+ Fälle je AI-Aufgabe als Golden Set anlegen.
7. Replay-, Tenant-Isolation-, Lösch- und Failure-Injection-Protokolle ausführen.
8. Zehn-Tage-Readout je Kandidat mit Score, Sonderarbeitsanteil, Risiken und Go/No-Go verfassen.
9. Nur für den gewählten Beachhead: Pilot-PRD, verbindliches Datenmodell und API-Verträge aus den Beweisen ableiten.

