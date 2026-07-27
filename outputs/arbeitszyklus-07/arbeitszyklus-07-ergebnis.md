# Arbeitszyklus 07 — Blazed Outfitters Pilot-Inventar

## Problem

Der bisherige Einrichtungsauftrag konnte nur einen generischen Eingangskanal
erfassen. Für Blazed Outfitters waren damit weder vier konkrete E-Mail-Postfächer
noch drei Instagram-Accounts und ein TikTok-Account sichtbar. Vor allem blieb
unklar, welches Postfach den eng begrenzten Pilot starten soll.

## Diskussion

- Product widersprach einem reinen 4/3/1-Zähler: Ohne konkrete geschäftliche
  Adresse oder öffentlichen Handle ist die Auswahl des Pilot-Postfachs nicht
  ausführbar.
- Security widersprach der Gleichsetzung von Inventarisierung und Aktivierung:
  Instagram, TikTok und die drei übrigen Postfächer dürfen durch das Formular
  weder verbunden noch freigeschaltet werden.
- Architecture widersprach einem freien JSON-Konfigurationsfeld: Kanal-Accounts
  brauchen tenantgebundene IDs, referenzielle Auswahl und eine spätere, saubere
  Grenze zu operativen Connectoren.

## Entscheidung

Kanal-Accounts werden als eigene tenantisolierte Kindentitäten des
Pilot-Onboardings gespeichert. Der Wizard bleibt trotzdem ein atomarer
Einrichtungsauftrag mit einem Aggregate-ETag.

Genau ein inventarisiertes E-Mail-Postfach muss als Pilot gewählt werden. Der
Provider und die Zugangsumgebung werden erfasst. Social-Accounts erhalten
serverseitig den Status `blocked`; E-Mail-Accounts bleiben `inventory`. Keine
Auswahl erstellt oder aktiviert einen Connector.

## Umgesetzt

- Marke und rechtliches Unternehmen werden getrennt erfasst.
- Beliebig ergänzbares Inventar für E-Mail, Instagram und TikTok, begrenzt auf
  25 Accounts.
- Syntaktische E-Mail-Prüfung, Handle-Prüfung und typbezogene,
  case-insensitive Duplikaterkennung.
- Genau eine Pilotwahl, ausschließlich aus den E-Mail-Accounts.
- Providerpflicht für das gewählte Pilot-Postfach.
- Vollständigkeitsbestätigung für das Inventar.
- Review und Erfolgsscreen trennen Pilot-Postfach und übrigen Bestand.
- Migration `007_pilot_channel_inventory.sql` mit RLS, Composite-FK und
  serververwalteten Aktivierungsstatus.
- OpenAPI-Artefakt für Arbeitszyklus 07.
- Pilotfixture mit exakt 4 E-Mail-, 3 Instagram- und 1 TikTok-Account.

## Verifikation

- TypeScript Server und Web: erfolgreich.
- 29 Tests bestanden; 5 PostgreSQL-Integrationstests ohne verfügbare
  Testdatenbank übersprungen.
- Produktions-Build erfolgreich.
- API-Tests beweisen Secret-Feld-Ablehnung, Non-E-Mail-Auswahl-Ablehnung,
  Duplikaterkennung, 4/3/1-Roundtrip, Social-`blocked` und Versionskonflikt.

## Noch vom Kunden benötigt

- vier konkrete geschäftliche E-Mail-Adressen und deren verständliche
  Bezeichnungen;
- drei öffentliche Instagram-Handles;
- ein öffentlicher TikTok-Handle;
- Auswahl des ersten Pilot-Postfachs und dessen Provider;
- Pilotprozess, zwei beteiligte Teams, geschäftliche Kontakte und Startziel.

Passwörter, Tokens, Client Secrets und Nachrichteninhalte werden nicht im
Einrichtungsformular erfasst.

