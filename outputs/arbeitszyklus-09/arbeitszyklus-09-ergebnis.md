# Arbeitszyklus 09 — Provider-Erkennung und OAuth-Grenze

## Ausgangslage

Das Pilot-Onboarding verlangte eine manuelle Providerauswahl und belegte neue
E-Mail-Accounts fälschlich mit Microsoft 365 vor. Außerdem vermischte das
bestehende Modell den Anbieter Google mit den Produkten Gmail und Google
Workspace.

## Diskussion und Widerspruch

- Product widersprach jeder stillen Providerfestlegung und einer automatischen
  Aktivierung nach OAuth.
- Security widersprach DNS-Abfragen mit vollständiger E-Mail-Adresse,
  unkontrollierten Resolverzielen und produktiven Gmail-Tokens vor KMS-, RLS-
  und Google-Verifikationsnachweis.
- Architecture widersprach dem bisherigen Providerenum und der Kopplung von
  Inventar, Erkennung, Autorisierung und Connectoraktivierung.

## Entscheidung

Die Erkennung ist eine bestätigungspflichtige Empfehlung. Der Browser sendet
nur die Domain an einen authentisierten, rate-limitierten Backend-Endpunkt.
Bekannte Domains und öffentliche MX-Hosts werden über eine versionierte
Klassifikation eingeordnet. OAuth und Connectoraktivierung bleiben getrennte
spätere Zustände.

Provider und Produkt werden getrennt modelliert:

- `providerKey`: `google`, `microsoft`, `other`
- `mailProductKey`: `gmail`, `google_workspace`, `microsoft_365`, `other`

## Umgesetzt

- Normalisierung mit IDNA/ASCII, Label- und Längenprüfung.
- Ablehnung von IP-Literalen und Special-Use-Domains.
- Exakte Gmail-Regel ohne DNS-Abfrage.
- MX-Erkennung für Google, Microsoft und ALL-INKL.
- Suffix-sichere Klassifikation und uneindeutiger Zustand bei gemischten MX.
- Zwei-Sekunden-Deadline, Recordlimit und begrenzter Sechs-Stunden-Cache.
- Strikter, capability-geschützter API-Endpunkt mit eigenem Rate Limit.
- Onboarding-Erkennung beim Verlassen eines E-Mail-Feldes.
- Sichtbare Empfehlung mit ausdrücklicher Bestätigung durch den Nutzer.
- Entfernung der Microsoft-365-Standardvorbelegung.
- Migration 009 für das getrennte Provider-/Produktmodell.
- Kein Local-Part in DNS-Anfrage, Cache-Key oder API-Antwort.

## Google-OAuth-Grenze

Für den Shadow Run wäre mindestens `gmail.readonly` erforderlich. Dieser
Google-Scope ist eingeschränkt. Daher werden echte Refresh Tokens erst
zugelassen, wenn ein serverseitiger Authorization-Code-Flow mit State und PKCE,
ein verwalteter Secret Store/KMS, exakter Mailbox-Abgleich, PostgreSQL-RLS und
die erforderliche Google-Verifikation nachgewiesen sind.

OAuth-Erfolg wird künftig lediglich `authorized` setzen. Er aktiviert weder
Ingress noch Shadow Run oder Livebetrieb.

## Verifikation

- Typecheck erfolgreich.
- 34 Tests bestanden; 5 PostgreSQL-Integrationstests lokal übersprungen.
- Produktions-Build erfolgreich.
- Tests decken bekannte Domains, MX-Klassifikation, Cache, Domainablehnung,
  Capability-Schutz und Local-Part-Vermeidung ab.
