# Strategisches Fundament v0.1

**Stand:** 20. Juli 2026  
**Status:** Begründete Arbeitsentscheidung; Markt- und Problemhypothesen müssen durch Design-Partner validiert werden.

## 1. Executive Decision

Wir bauen keine weitere Shared Inbox und keine generische „Omnichannel + AI“-Suite.

Wir bauen langfristig eine **providerneutrale Communication Control Plane**: eine programmierbare Schicht, die jede geschäftliche Interaktion mit Identität, Kontext, Verantwortung, Richtlinien und einem überprüfbaren Ergebnis verbindet – unabhängig davon, ob ein Mensch, eine KI oder ein System handelt und über welchen Kanal die Interaktion stattfindet.

Der erste verkaufbare Nutzen lautet:

> Kein relevanter Kundenkontakt ohne Kontext, Verantwortlichen und nächsten Schritt.

Für den Beachhead bestehen zwei ernsthafte, widersprüchliche Hypothesen: **mehrgliedrige technische Service-/Reparaturorganisationen** mit akutem Koordinationsschmerz und **AI-reife europäische B2B-Unternehmen** mit mehreren Customer-Operations-Systemen und Governance-Bedarf. Beide werden vier Wochen lang mit denselben Beweiskriterien gegeneinander getestet; erst dann wird ein Segment gewählt. Der Plattformkern bleibt in beiden Fällen gleich.

Die eigene Oberfläche ist für Adoption und Lernen unverzichtbar, bleibt architektonisch aber ein Referenz-Client derselben APIs, Events und Policies, die später Kunden, Partner und Drittanwendungen verwenden.

## 2. Problemdefinition

Unternehmen strukturieren Kommunikation nach Kanälen und Anwendungen; Kunden erleben sie als eine Beziehung. Dadurch entstehen fünf strukturelle Brüche:

1. Identität zerfällt in E-Mail-Adresse, Telefonnummer, WhatsApp-ID, CRM-Kontakt und weitere Repräsentationen.
2. Kontext bleibt in Kanal-Threads, Postfächern und Köpfen gefangen.
3. Verantwortung wird implizit aus Ordnern, Zuweisungen oder menschlicher Gewohnheit abgeleitet.
4. Zusagen, Entscheidungen, Fristen und nächste Schritte bleiben unstrukturierter Text.
5. KI erhält entweder zu wenig Kontext oder zu viel unkontrollierten Kontext und kann ihre Handlungen nicht zuverlässig begründen.

Das Kernproblem ist deshalb nicht „zu viele Postfächer“. Es fehlt eine gemeinsame, autorisierte und programmierbare Kommunikationsschicht.

## 3. Marktprüfung und Konsequenz

Die Kategorie ist bereits in Bewegung:

- Front organisiert Arbeit weiterhin stark über Shared Inboxes, Zuweisungen, Tags, Regeln, Zusammenarbeit und Analytics.
- Trengo bündelt WhatsApp, E-Mail, Social, Voice und AI Agents in einer Omnichannel Inbox.
- Intercom verbindet Helpdesk und AI Agent rund um Customer Service.
- Twilio geht 2026 deutlich weiter und positioniert sich selbst als „infrastructure layer for every conversation“, inklusive Conversation Orchestrator und persistentem Memory.

**Konsequenz:** „Omnichannel“, „AI Agent“, „persistenter Kontext“ und selbst „Conversation Infrastructure“ sind allein keine belastbare Differenzierung mehr.

Unsere strategische Differenzierung muss in der Kombination liegen aus:

- Providerneutralität über Transport-, Modell- und Cloudanbieter,
- einer eigenen stabilen Kommunikationsontologie,
- Kommunikation als ausführbare Arbeit mit Commitments, Policies und Outcomes,
- gleichberechtigten Actors: Menschen, Teams, KI-Agenten und Systeme,
- nachweisbarer Herkunft, Berechtigung und Entscheidungshistorie,
- einer Plattform, die auch ohne unsere eigene Inbox nutzbar bleibt.

**Quellen:** [Front Workflows](https://front.com/product/workflows), [Trengo](https://trengo.com/), [Intercom](https://www.intercom.com/small-business), [Twilio Customer Engagement Platform](https://www.twilio.com/en-us/customer-engagement-platform), [Twilio Conversation Orchestrator](https://www.twilio.com/en-us/products/conversational-ai/conversation-orchestrator)

## 4. Vision und strategische Wette

### Vision

Unternehmen definieren ihre Kommunikationslogik einmal. Die Plattform führt sie sicher über jeden heutigen und zukünftigen Kanal aus, bewahrt autorisierten Kontext und koordiniert Menschen, KI und Systeme.

### Strategische Wette

Der dauerhaft wertvolle Teil der Unternehmenskommunikation ist weder Kanal noch Oberfläche, sondern der **autorisierte, nachvollziehbare Kontext, der zu koordiniertem Handeln führt**.

### Infrastrukturtest für jede Roadmap-Entscheidung

Eine Initiative gehört nur dann in den Plattformkern, wenn sie mindestens einen der folgenden Werte erhöht:

- Portabilität über Kanäle, Anbieter oder Modelle,
- Wiederverwendbarkeit durch mehrere Produkte oder Branchen,
- Programmierbarkeit über API, Event oder Policy,
- sichere Koordination von Menschen, KI und Systemen,
- Erhalt von Kontext und Verantwortlichkeit über Zeit,
- überprüfbare Outcomes statt bloßer Nachrichtenbearbeitung.

Besteht ein Vorhaben diesen Test nicht, ist es entweder ein Referenz-Client-Feature, eine Erweiterung oder vorerst kein Produktbestandteil.

## 5. Beachhead-Entscheidungstest

### Hypothese A: operative Serviceorganisation

Mehrgliedrige technische Service- und Reparaturorganisationen in DACH mit:

- 50–500 Beschäftigten,
- 20–100 regelmäßig kommunizierenden Mitarbeitenden,
- mehreren Teams, Niederlassungen oder Partnerbetrieben,
- E-Mail und WhatsApp als wesentlichen Kanälen,
- mehrtägigen Vorgängen mit Übergaben und Rückfragen,
- messbaren Schäden durch verlorene Anfragen, doppelte Arbeit, unklare Verantwortung oder vergessene Zusagen.

### Hypothese B: AI-reife B2B Customer Operations

Europäische B2B-Software- und Digitalunternehmen mit:

- 50–500 Beschäftigten,
- mehreren Customer-Operations-Systemen,
- ersten produktiven AI Agents oder konkreten Einführungsprojekten,
- Bedarf an kontrollierten Mensch-KI-Handoffs,
- fehlender zentraler Policy-, Audit- und Berechtigungsschicht.

### Gemeinsame Käufer und Nutzer

- **Economic Buyer:** COO, Serviceleitung oder Head of Customer Operations.
- **Champions:** Teamleiter mit sichtbarem Koordinationsproblem.
- **Tägliche Nutzer:** Service-Mitarbeitende, Disposition, Backoffice und später beaufsichtigte KI-Agenten.

### Warum Hypothese A attraktiv ist

Der Schmerz ist operational und messbar, der Prozess überschreitet Kanäle und Teams, und der Wert liegt nicht nur in schnellerem Antworten, sondern in zuverlässiger Koordination. Vertikaler Vertrieb ist erlaubt; vertikale Begriffe dürfen nicht in das Kernmodell eingebaut werden.

### Warum Hypothese B attraktiv ist

Der Infrastrukturwert ist unmittelbarer, der ACV höher und der Zwang zu einer neuen Inbox geringer. Das Risiko liegt in abstrakterem Vertrieb, längeren Security-Prozessen und einem Markt, der eventuell noch nicht reif genug ist.

### Entscheidungsregel nach vier Wochen

Je Segment werden mindestens zehn qualifizierte Interviews, drei Workflow-Beobachtungen und zwei konkrete bezahlte Pilotangebote angestrebt. Gewählt wird nur ein Segment und nur dann, wenn es:

- einen wiederkehrenden, heute budgetierten Schmerz zeigt,
- einen 30-Sekunden-Pitch ohne Architekturjargon versteht,
- innerhalb von zehn Arbeitstagen integrierbar erscheint,
- mindestens zwei bezahlte Pilotzusagen liefert,
- den Plattformkern nutzt, ohne mehr als 20 % segmentexklusive Entwicklung zu verlangen,
- einen plausiblen 3× ROI innerhalb von zwölf Monaten erlaubt.

Bei Gleichstand gewinnt Hypothese B, weil sie die Infrastrukturvision direkter validiert. Liefert keines der Segmente die Evidenz, wird nicht gebaut.

### Nicht erste Zielkunden

- Kleinstunternehmen mit einem einzigen gemeinsamen Postfach,
- reine In-App-Supportteams mit bereits gut funktionierendem Helpdesk,
- Großkonzerne mit mehrjährigem Beschaffungs- und Transformationsprogramm,
- Entwickler ohne konkreten operativen Use Case,
- hochregulierte Spezialfälle, deren Zertifizierungen den Lernzyklus dominieren würden.

## 6. Jobs-to-be-done

- Wenn ein Kunde Kontakt aufnimmt, erkenne sofort: Wer ist das, worum geht es, was ist bereits passiert, wer ist verantwortlich und was muss als Nächstes geschehen?
- Wenn Kanal, Team oder Actor wechselt, erhalte Kontext, Zusagen und Verantwortung vollständig.
- Definiere Kommunikationsregeln einmal und wende sie konsistent an.
- Automatisiere Routinekommunikation, ohne Kontrolle, Herkunft und Korrekturmöglichkeit zu verlieren.
- Miss, ob Kommunikation zu einem fachlichen Ergebnis geführt hat.

## 7. Kanonisches Kommunikationsmodell

Der Kern besteht aus wenigen stabilen Primitives:

- **Tenant:** rechtliche und technische Isolationsgrenze.
- **Actor:** Mensch, Team, KI-Agent oder externes System.
- **Identity:** kanalgebundene Repräsentation eines Actors.
- **Party:** Rolle eines Actors in einem Kommunikationskontext.
- **Conversation:** langlebiger fachlicher Zusammenhang; nicht identisch mit einem Kanal-Thread.
- **Interaction:** atomarer Kommunikations- oder Handlungsvorgang, z. B. Nachricht, Anruf, Übergabe, Freigabe oder Systemaktion.
- **Content:** versionierter Inhalt, Medien, Transkript oder strukturierte Daten.
- **Context Link:** Verbindung zu Kunde, Auftrag, Vertrag, Gerät, Standort oder externer Entität.
- **Commitment:** Zusage, Aufgabe, Entscheidung, erwartete Antwort oder Frist.
- **State:** aktueller operativer Zustand einer Conversation.
- **Capability:** erlaubte Handlung eines Actors im Kontext.
- **Event:** unveränderliche Tatsache über eine Zustandsänderung.

Wichtig: Eine Conversation ist ein semantischer Zusammenhang, kein Nachrichtencontainer. Im MVP darf Kanal-Thread zu Conversation häufig 1:1 erscheinen; das Datenmodell darf dies nicht festschreiben.

## 8. MVP v0.1

### Das Produktversprechen

Jede relevante Interaktion erhält automatisch eine nachvollziehbare Identität, einen fachlichen Kontext, einen Verantwortlichen und einen nächsten Schritt – auch über Kanalwechsel hinweg.

### Enthalten

1. **Zwei Kanäle:** E-Mail und WhatsApp; beide hinter einem kanonischen Adaptervertrag.
2. **Identity Resolution:** sichere Zuordnung, Confidence, Herkunft, manuelle Korrektur, Merge und Split.
3. **Conversation Runtime:** Interactions, Teilnehmer, Zustand, Eigentümer, Team, Context Links und Commitments.
4. **Reference Workspace:** priorisierte Arbeitsliste, Conversation-Timeline, Kontextseite und Composer.
5. **Handoffs:** explizite Übergaben mit Grund, Empfänger, Frist und bestätigter Übernahme.
6. **Kontrollierte Regeln:** wenige vordefinierte Trigger, Bedingungen und Aktionen; kein freier Workflow-Builder.
7. **AI Assist:** Klassifikation, Zusammenfassung, Commitment-Extraktion, Next-Step-Vorschlag und Antwortentwurf.
8. **Human Control:** kein autonomes externes Senden; Nutzer sieht Quellen und kann korrigieren.
9. **API und Events:** versionierte REST API, signierte Webhooks und Export.
10. **Audit und Betriebsmetriken:** Zuständigkeit, Übergabe, Modellnutzung, Änderungen und Zustellstatus.

### Explizit nicht enthalten

- vollständiges CRM, Helpdesk oder Contact Center,
- Voice-Transport und Echtzeit-Transkription,
- Marketing Campaigns,
- freier No-Code-Builder,
- autonome externe AI Agents,
- Fine-Tuning,
- Vector DB als Pflichtbestandteil,
- Marketplace, White Label oder öffentliches SDK-Portfolio,
- GraphQL als öffentlicher Primärvertrag,
- Kubernetes, Microservice-Landschaft oder aktiver Multi-Cloud-Betrieb,
- vollständige BI-Suite.

## 9. UX-Konzept

Die Oberfläche verwendet nicht die technische Ontologie als Nutzersprache. Sie beantwortet fünf Fragen:

1. Wer braucht Aufmerksamkeit?
2. Worum geht es wirklich?
3. Was ist bereits passiert?
4. Wer besitzt den nächsten Schritt?
5. Welche Handlung ist jetzt sicher und sinnvoll?

Der primäre Screen ist deshalb kein klassisches Postfach, sondern ein **Attention Workspace**:

- links: nach Risiko, Frist und Verantwortung priorisierte Arbeit,
- Mitte: originale Interaktionen und sichtbare Übergaben in einer Timeline,
- rechts: Identität, fachlicher Kontext, Commitments, nächste Schritte und Quellen,
- unten: kanalbewusster Composer mit AI-Entwurf und Freigabe.

KI-Ableitungen werden visuell und technisch vom Original getrennt. Jede Zusammenfassung und Extraktion zeigt Quelle, Confidence und Korrekturmöglichkeit.

## 10. Technische MVP-Architektur

### Architekturentscheidung

Ein containerisierter **modularer Monolith** mit klaren Domänengrenzen:

- Identity & Tenancy,
- Conversation Runtime,
- Channel Gateway,
- Event Backbone,
- Workflow & Policy Runtime,
- AI Runtime.

### Infrastruktur

- Managed PostgreSQL als operative Wahrheit,
- `tenant_id` auf allen mandantengebundenen Entitäten plus Row-Level Security,
- Object Storage für Anhänge,
- Queue und separate Worker für Ingestion, Zustellung, Webhooks, Regeln und AI Jobs,
- transaktionale Outbox plus unveränderlicher Event Log,
- PostgreSQL-Volltextsuche vor separatem Search Cluster,
- eine EU-Region im MVP; regionale und dedizierte Deployments als späterer Evolutionspfad,
- OpenTelemetry/Correlation IDs vom Provider-Webhook bis zum Outcome.

### API-Leitplanken

- REST + Webhooks zuerst,
- Idempotency Keys bei Writes,
- cursorbasierte Pagination,
- mindestens einmal zugestellte Events, idempotente Konsumenten,
- signierte, wiederholbare und replayfähige Webhooks,
- additive Schemas und explizite Versionierung,
- keine Provider-ID als Primärschlüssel,
- OAuth/OIDC und kurzlebige, begrenzte Tokens.

### Skalierung

- Worker horizontal nach Tenant und Conversation partitionierbar,
- keine tenantübergreifenden Transaktionen oder fachlichen Joins,
- Quotas, Backpressure und Fair Queueing,
- AI-Aufgaben mit eigenen Budgets, Queues und Concurrency Limits,
- Read Models für belastete Ansichten,
- Microservices nur bei belegter Last, Zuverlässigkeitsanforderung, Datenresidenz oder Teamautonomie.

## 11. AI-Architektur

AI ist ein Actor und eine austauschbare Plattformfähigkeit, kein dekoratives Inbox-Feature.

- **Model Gateway:** providerneutrale Aufgabenverträge; zunächst ein produktiver Provider, aber mindestens zwei Adapter im Design.
- **Task Routing:** getrennte Qualitäts-, Kosten-, Latenz- und Datenschutzprofile für Klassifikation, Extraktion, Zusammenfassung und Entwurf.
- **Deterministic Context Builder:** autorisierte Daten aus Conversation, Actors, Commitments, Policies und Geschäftssystemen.
- **Memory:** Conversation Memory, freigegebene Episoden, kuratiertes Wissen und prozedurale Policies getrennt verwalten.
- **Retrieval:** relationale und Volltextsuche zuerst; Embeddings nur bei nachgewiesenem semantischem Bedarf. Vektoren sind erneuerbare Projektionen.
- **Trust Levels:** Vorschlag, Entwurf, überwachte Ausführung, autonome Ausführung.
- **Provenance:** Aufgabe, Modellklasse, Prompt-/Policy-Version, Quellen, Tool Calls, Kosten, Latenz und Evaluation speichern.
- **Evaluation before autonomy:** Golden Sets, Shadow Mode und Freigabeschwellen vor jeder Autonomie.

## 12. Enterprise-, Security- und Compliance-Grenze

Nicht verhandelbar im MVP:

- Tenant-Isolation als getestete Sicherheitsinvariante,
- Verschlüsselung in Transit und at Rest,
- Secrets in Managed Secrets Store,
- rollen- und ressourcenbezogene Autorisierung,
- klar getrennte Rollen für Admin, Developer, Operator und Auditor,
- vollständiger Audit Trail für menschliche und maschinelle Aktionen,
- konfigurierbare Aufbewahrung und Löschung,
- Datenexport und dokumentierte Subprozessoren,
- EU-Datenhaltung für den ersten Markt,
- Backup/Restore-Tests, Incident-Prozess und minimale SLOs,
- DPA/AVV und DSGVO-konforme Produktprozesse.

Bewusst später:

- formale SOC 2-/ISO-27001-Zertifizierung,
- SCIM; SAML-SSO wird spätestens vor dem ersten echten Enterprise-Rollout über einen Managed Provider ergänzt,
- Bring Your Own Key,
- kundeneigene Regionen und dedizierte Deployments,
- Legal Hold und hochspezialisierte regulatorische Pakete.

Diese späteren Fähigkeiten müssen architektonisch möglich sein, dürfen aber nicht den ersten Wertnachweis blockieren.

## 13. Pricing-Hypothese

Reine Seat-Preise ziehen das Produkt zurück in die SaaS-Inbox-Kategorie. Reine Usage-Preise erschweren frühen Kunden Budgetkontrolle und schwächen die tägliche UX.

Empfohlen wird ein hybrides Modell:

- **Platform Fee** pro Organisation/Workspace für Control Plane, Governance und Kernintegrationen,
- **Usage** für verarbeitete Interactions, aktive Conversations und AI-Ausführung,
- **Operator Seats** nur für den Reference Workspace,
- **Enterprise Add-ons** später für SSO/SCIM, dedizierte Region, erweiterte Auditierung und Support-SLA.

Pilot-Hypothese, nicht endgültige Listenpreise:

- Service-Segment: 3.000–8.000 EUR monatlich inklusive klar begrenzter Implementierung,
- Control-Plane-Segment: 15.000–30.000 EUR einmaliges Setup plus 2.500–5.000 EUR monatliche Platform Fee mit Jahrescommitment,
- Usage wird zunächst als inkludiertes Volumen mit transparentem Overage Cap verkauft; Channel- und Modellkosten werden separat ausgewiesen,
- Gross-Margin-Ziel vor erheblicher Voice-Nutzung: mindestens 75 %; AI-Kosten müssen pro Aufgabe und Tenant sichtbar sein.

## 14. Erfolgskriterien und Kill-Kriterien

### Pilot-Erfolg nach 8–12 Wochen produktiver Nutzung

- mindestens 30 % weniger Conversations ohne klaren Verantwortlichen oder nächsten Schritt,
- mindestens 25 % schnellere Übernahme nach Team- oder Kanalwechsel,
- mindestens 20 % weniger interne Rückfragen nach Kontext,
- mindestens 60 % wöchentliche aktive Nutzung bei vorgesehenen Operatoren,
- mindestens 50 % Akzeptanz oder sinnvolle Bearbeitung von AI-Entwürfen,
- nachweislich korrigierbare Identity Resolution ohne schwerwiegende Fehl-Merges,
- mindestens zwei Kunden wollen nach dem Pilot bezahlt fortsetzen oder expandieren.

### Kill- oder Pivot-Kriterien

- Kunden kaufen nur „eine bessere Inbox“ und messen keinen Wert an Kontext, Commitments oder Handoffs.
- Der Nutzen entsteht erst nach dauerhaftem, nicht produktisierbarem Consulting.
- Email + WhatsApp bilden im Zielsegment keinen zusammenhängenden Prozess.
- Identity Resolution ist ohne proprietäre Stammdaten der Kunden nicht zuverlässig genug und wird nicht korrigierbar.
- Kunden erlauben AI keinen ausreichenden Kontext, während deterministische Automatisierung den Preis nicht trägt.
- Nach drei gut passenden Piloten ist kein Kunde bereit, mindestens 3.000 EUR monatlich für den belegten Outcome zu zahlen.
- Nach 20 qualifizierten Interviews je Segment entstehen nicht mindestens zwei bezahlte Pilotzusagen in einem Segment.
- Die Integration bis zum ersten produktiven Event dauert regelmäßig länger als zehn Arbeitstage.
- Ein plausibler ROI von mindestens 3× innerhalb von zwölf Monaten ist nicht belegbar.
- Eine vertikale Sonderlogik dominiert mehr als 30 % der Kernentwicklung.
- Der Reference Workspace kann nicht durch dieselben öffentlichen Plattformverträge betrieben werden.

## 15. Team und realistischer Zeitrahmen

### Kleines Kernteam

- 1 Product/Founder Lead,
- 1 Staff/Principal Engineer als Architekturverantwortlicher,
- 3 Product Engineers mit Backend-/Frontend-Verteilung,
- 1 Product Designer mit Research-Kompetenz,
- 1 AI/Data Engineer,
- Security/DevOps/Legal zunächst fractional oder als zentrale Unterstützung.

### Zeitplan

1. **Wochen 1–4: konkurrierende Discovery und Prototyp**  
   Zwei Segmente mit identischer Scorecard prüfen, insgesamt mindestens 20 Interviews, Prozessbeobachtungen, Daten-/Compliance-Prüfung, klickbarer UX-Prototyp und bezahlte Design-Partner-Angebote.
2. **Wochen 5–12: Plattformkern**  
   Tenancy, Identity, Conversation Runtime, Email-Adapter, Events, Audit, erste UI.
3. **Wochen 13–20: kompletter MVP**  
   WhatsApp, Handoffs, Commitments, AI Assist, API/Webhooks, Betriebsreife.
4. **Wochen 21–32: produktive Piloten**  
   drei Design-Partner, Baseline-Vergleich, wöchentliche Research-Loops, Security Hardening.

Der MVP ist damit in etwa fünf Monaten pilotfähig; eine belastbare Produktentscheidung fällt nach ungefähr acht Monaten inklusive realer Nutzung.

## 16. Diskussion und entschiedene Widersprüche

### 1. API-Plattform oder tägliches Produkt?

- **CEO/API:** Ohne unabhängige APIs entsteht nur SaaS.
- **CPO/UX/Sales:** Ohne exzellente tägliche Oberfläche fehlen Adoption, Daten und ein kurzer Verkaufsweg.
- **Entscheidung:** Beides, aber mit klarer Abhängigkeit: Der Workspace ist Referenz-Client der Plattform. Kein UI-Feature darf eine exklusive Backend-Semantik besitzen.

### 2. Vertikaler Beachhead oder horizontale Plattform?

- **Sales/Customer Success:** Ein konkretes Segment verkürzt Sprache, Vertrieb und Onboarding.
- **CEO/Architect/Future Tech:** Vertikale Sonderlogik zerstört die Infrastrukturvision.
- **Finance/Security/Competitor widersprechen zusätzlich:** Ein AI-reifer B2B-Control-Plane-Beachhead hat höheren ACV und validiert die Infrastruktur direkter als eine Service-Inbox.
- **Entscheidung:** Noch keine künstliche Segmententscheidung. Vierwöchiger, gegeneinander messbarer Discovery-Test; danach genau ein Beachhead. In beiden Fällen horizontale Ontologie.

### 3. Event Sourcing oder relationale Wahrheit?

- **Data Engineer:** Vollständiges Event Sourcing maximiert Rekonstruktion und Lernfähigkeit.
- **Architect/Security/Delivery:** Es erhöht Komplexität, Debugging- und Löschrisiken vor Product-Market-Fit.
- **Entscheidung:** PostgreSQL als operative Wahrheit, Outbox und Event Log für Integrationen/Audit; Event Sourcing nur später bei belegtem Domänenwert.

### 4. Autonome KI oder assistierte KI?

- **AI/Sales:** Autonomie erzeugt einen sichtbareren ROI.
- **Communication/UX/Security/Customer Success:** Falsche Identität oder Zusammenfassung kann schwerwiegender sein als fehlender Kontext.
- **Entscheidung:** Im MVP nur sichtbare Ableitungen, Entwürfe und Extraktion. Autonomie wächst pro Aufgabe über Evaluation und Trust Levels.

### 5. Microservices/Kubernetes oder modularer Monolith?

- **DevOps:** Frühe Verteilung demonstriert Skalierbarkeit.
- **Architect/Finance/Future Tech:** Semantische Lernfähigkeit und geringe Betriebsoberfläche sind vor PMF wichtiger.
- **Entscheidung:** Modularer Monolith, Managed Services, klare Extraktionsgrenzen. Skalierung ist vorbereitet, nicht vorgetäuscht.

### 6. Kategorie „Conversation Infrastructure“?

- **Marketing/CEO:** Die Kategorie trägt die langfristige Ambition.
- **Competitor/Sales:** Twilio beansprucht diese Sprache bereits; der Begriff verkauft keinen unmittelbaren Outcome.
- **Entscheidung:** Intern „providerneutrale Communication Control Plane“. Extern wird zunächst der Outcome verkauft. Eine öffentliche Kategorie wird erst nach Kundenresearch festgelegt.

## 17. Roadmap nach dem MVP

### Phase 1 – Prove the primitive

Identity, Conversation, Interaction, Context, Commitment, Ownership, Email/WhatsApp, Assistive AI und messbarer Outcome.

### Phase 2 – Orchestrate

Policies, überwachte Agenten, Tool Connectoren, mehr Kanäle, Workflow Authoring, erweiterte Rollen und Analytics-Projektionen.

### Phase 3 – Platform

Öffentliche SDKs, App-/Agent-Registry, Extensions, regionale Datenebenen, konsumabhängige Plattformabrechnung und Marketplace-Grundlage.

### Phase 4 – Infrastructure

Eingebettete Communication Runtime für Drittprodukte, multimodale Agenten, organisationsübergreifende sichere Kommunikation und ein offenes Ökosystem.

## 18. Nächster Arbeitszyklus

Nicht Architektur weiter vertiefen, bevor der Beachhead überprüft ist. Der nächste Zyklus erzeugt:

1. gemeinsamer Interview- und Beobachtungsleitfaden für beide Beachhead-Hypothesen,
2. vergleichbare Design-Partner-Scorecard und verbindliches Decision Memo,
3. Opportunity-Solution-Tree,
4. messbare Baseline für verlorenen Kontext, Übergaben und Commitments,
5. PRD v0.1 erst auf Basis dieser Evidenz,
6. anschließend Datenmodell und API-Verträge für den validierten Kernprozess.

## 19. Offene Annahmen

- Eines der beiden Segmente zeigt einen klar überlegenen Beachhead; aktuell ist nicht evidenzbasiert entschieden, welches.
- E-Mail und WhatsApp decken den kritischen Prozess ausreichend ab.
- Kunden akzeptieren einen neuen Attention Workspace statt nur Plug-ins in bestehende Tools.
- Context, Handoffs und Commitments erzeugen eigenständige Zahlungsbereitschaft.
- Providerneutralität ist mittel- bis langfristig kaufrelevant und kurzfristig kein unnötiger Mehraufwand.
- Unternehmen geben KI genug autorisierten Kontext, um messbar nützlich zu sein.

Diese Aussagen sind keine Fakten. Sie sind die ersten zu testenden Hypothesen.
