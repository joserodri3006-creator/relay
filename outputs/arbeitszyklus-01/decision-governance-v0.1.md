# Beachhead Decision Governance v0.1

**Stand:** 20. Juli 2026  
**Zweck:** Vorab festgelegte Regeln für die Auswahl zwischen Beachhead A und B. Die Regeln dürfen nach Beginn der Interviews nicht rückwirkend verändert werden.

## 1. Entscheidung

Heute wird weder A noch B gewählt. Beide Hypothesen durchlaufen denselben vierwöchigen Test. Ein Segment gewinnt nur durch beobachtete, wirtschaftliche und technische Evidenz.

- **A:** technische Service- und Reparaturorganisationen.
- **B:** AI-reife europäische B2B Customer Operations.

Bei einem echten Gleichstand gewinnt B, weil es die providerneutrale Communication Control Plane direkter validiert. Das ist ein vorab definierter Tiebreaker, keine nachträgliche Interpretation.

## 2. Forschungsdesign

Je Segment müssen mindestens vorliegen:

- 10 qualifizierte Interviews,
- 3 beobachtete reale Workflows,
- 5 verifizierte Baselines oder reale Fallartefakte,
- 2 Gespräche mit Economic Buyers,
- 2 konkrete Pilotangebote,
- 2 unterschriebene und angezahlte Piloten.

Problem-Discovery, Concept Test und Pilotangebot werden zeitlich getrennt. Ein Interview zählt nicht als Kaufbeleg.

## 3. Evidenzhierarchie

| Stufe | Evidenz | Faktor |
|---|---|---:|
| E0 | keine Evidenz | 0,00 |
| E1 | Interviewaussage oder Meinung | 0,25 |
| E2 | Artefakt, Report, Prozessdokument oder Budgetzeile | 0,50 |
| E3 | beobachteter Workflow plus verifizierte Baseline | 0,75 |
| E4 | Zahlung, Produktionseinsatz oder gemessener Piloteffekt | 1,00 |

Aussagen derselben Firma sind keine unabhängigen Belege. Mehr Interviews ersetzen keine stärkere Evidenz.

## 4. Harte Segment-Gates

Ein Segment kann unabhängig vom Score nicht gewinnen, wenn eines dieser Gates scheitert:

1. weniger als zwei bezahlte Pilotzusagen,
2. erstes echtes Event nicht innerhalb von zehn Arbeitstagen erreichbar,
3. mehr als 20 % segmentspezifische oder 10 % kundenspezifische Entwicklungsarbeit,
4. konservativer ROI unter 3× innerhalb von zwölf Monaten,
5. kein aktuell budgetierter Problemschmerz,
6. kritischer, im Pilotfenster nicht lösbarer Security- oder Datenschutzblocker,
7. Abhängigkeit von kundenspezifischen Kernentitäten oder einem Tenant-Fork,
8. Plattformkern kann nicht mindestens vier Primitives validieren,
9. kein Partner kann ohne neue kundenspezifische Integration starten.

Besteht kein Segment alle Gates, wird kein MVP gebaut.

## 5. Segment-Scorecard

| Kriterium | Gewicht |
|---|---:|
| Dringlichkeit und Problemfrequenz | 14 |
| Quantifizierbarer wirtschaftlicher Schaden | 12 |
| Nachgewiesene Zahlungsbereitschaft | 15 |
| Verbreitung und Wiederholbarkeit | 10 |
| Sales Velocity und Buyer-Zugang | 8 |
| Integration und Time-to-Value | 8 |
| Fit zur Communication Control Plane | 13 |
| Geringer Anpassungsbedarf | 8 |
| Erwartete Unit Economics | 7 |
| Expansion und Plattformwirkung | 5 |
| **Gesamt** | **100** |

Jedes Kriterium erhält 0–5 Punkte. Der Score wird mit der Evidenzqualität gewichtet. Ein Segment ist entscheidungsfähig ab 70/100 Punkten, mindestens 70 % Evidence Coverage und bestandenen Gates.

## 6. Design-Partner-Gates

Ein einzelner Design Partner muss zusätzlich erfüllen:

- Economic Buyer und operativer Champion sind namentlich beteiligt.
- Der Workflow tritt mindestens wöchentlich auf.
- Eine quantitative Baseline ist vor Start möglich.
- Datenschutz-, Datenzugriffs- und Security-Prüfung passen in das Pilotfenster.
- Erfolg, Misserfolg und Abbruch werden vor Beginn unterschrieben.
- Mindestens 80 % der technischen Arbeit sind wiederverwendbar.
- Technisches Readiness Assessment erreicht mindestens 75/100.
- Kein Wert 0 bei Quellzugang, Datenrechten, Security oder Datenschutz.

## 7. Pilotangebote

### Segment A

- Dauer: 8 Wochen.
- Preishypothese: 6.000–12.000 EUR.
- Scope: ein Serviceprozess, E-Mail und WhatsApp, maximal zwei Teams/Standorte.
- Kern: Identity, Ownership, Handoffs, Commitments und assistive AI.
- Nicht enthalten: Field-Service-Management, Disposition, Lager, Rechnungsstellung oder CRM-Ersatz.

### Segment B

- Dauer: 8 Wochen.
- Preishypothese: 12.000–25.000 EUR.
- Scope: ein Customer-Operations-Workflow, ein System/Agent über Standard-API oder Events.
- Kern: Policy Check, Audit Trail, Human-AI-Handoff und Commitments.
- Nicht enthalten: Entwicklung eines individuellen Agents, Modelltraining, Helpdesk-Ersatz oder beliebige Legacy-Integration.

Für beide Segmente gilt:

- keine kostenlose POC,
- 50 % Vorauszahlung,
- Rabatt nur gegen messbare Gegenleistung,
- maximal zwei Konfigurationstage und fünf Standardintegrationstage,
- Abbruch bei mehr als 20 % segmentspezifischer oder 10 % kundenspezifischer Arbeit.

Preise sind Testhypothesen und noch keine bestätigte Preisstrategie.

## 8. ROI-Regel

```text
Jährlicher Bruttonutzen =
  eingesparte Arbeitskosten
+ vermiedener Deckungsbeitragsverlust
+ vermiedene Fehler-/Risikokosten
+ vermiedene Tool- und Eigenentwicklungskosten

Jährlicher TCO =
  Softwarepreis
+ einmalige Integration
+ interner Betriebsaufwand
+ Change- und Schulungsaufwand

ROI-Multiple = konservativer jährlicher Bruttonutzen / jährlicher TCO
```

Unbelegte Nutzenannahmen werden um mindestens 50 % reduziert. Bei Segment B dürfen Risikoreduktion und Beschleunigungswert zusammen höchstens 40 % des anerkannten ROI ausmachen, solange keine Produktionsdaten vorliegen.

## 9. Verbindliche Auswahlregel

1. Segmente mit gescheiterten Gates scheiden aus.
2. Segmente unter 70 Punkten oder 70 % Evidence Coverage scheiden aus.
3. Qualifiziert sich nur ein Segment, gewinnt es.
4. Qualifizieren sich beide und der Abstand beträgt mindestens fünf Punkte, gewinnt der höhere Score.
5. Bei weniger als fünf Punkten werden Zahlungsbereitschaft, Integrationszeit, Anpassungsbedarf und Downside-Fälle verglichen.
6. Bleibt der Abstand unter fünf Punkten, gewinnt B als Vision-Tiebreaker.
7. Qualifiziert sich keines, wird nicht gebaut und die Problem- oder Segmenthypothese überarbeitet.

Nach Beginn der Interviews dürfen Kriterien, Gewichte, Preise oder Schwellen nicht geändert werden. Eine Änderung startet einen neuen, versionierten Testzyklus.

## 10. Dokumentierte Widersprüche

### Verkaufsfähigkeit versus Plattformvision

Sales favorisiert A wegen des konkreteren Pitches. CEO und Competitor Analysis warnen vor vertikalem SaaS und direktem Inbox-/Field-Service-Wettbewerb. Entscheidung: A bleibt erlaubt, aber nur mit horizontalem Kern und maximal 20 % segmentexklusiver Arbeit.

### Höherer ACV versus Beschaffungsrisiko

Finance favorisiert B wegen höherem ACV und Expansion. Sales und Marketing sehen abstrakteren Nutzen und mehr Security-Stakeholder. Entscheidung: Deklarierte Zahlungsbereitschaft zählt nicht; auch B braucht zwei angezahlte Piloten.

### Lernwert versus verstecktes Consulting

Sales möchte für starke Logos Sonderintegrationen zulassen. Finance und Architecture widersprechen. Entscheidung: Ein neuer Adapter zählt nur positiv, wenn mindestens drei qualifizierte Interessenten ihn benötigen oder er den kanonischen Adaptervertrag validiert.

### Autonomie versus Vertrauen

AI und Sales sehen stärkeren Demo-ROI durch Autonomie. Security, Communication und Customer Success widersprechen. Entscheidung: nur Entwürfe, Extraktion, Policy Checks und kontrollierte Handoffs; kein freies autonomes externes Senden.
