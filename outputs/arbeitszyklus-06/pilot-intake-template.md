# Informationen für die Pilot-Ersteinrichtung

Diese Angaben werden im Relay-Wizard **Ersteinrichtung** erfasst. Namen können zunächst anonymisiert werden; für Pilot- und Technikkontakte werden geschäftliche Kontaktdaten benötigt.

## 1. Pilot festlegen

- Unternehmen
- ein klar abgegrenzter Pilotprozess
- genau zwei beteiligte Teams
- gewünschtes Startdatum

## 2. Eingangskanal

- Microsoft 365 E-Mail, Google Workspace E-Mail, WhatsApp Business oder eigene API
- Sandbox, isoliertes Testkonto oder bereits freigegebener Produktivzugang
- führendes System: Salesforce, HubSpot, Zendesk, Dynamics, eigenes System oder keines

## 3. Anmeldung und Kontakte

- Identity Provider: Microsoft Entra, Google Workspace, Okta oder anderer
- Pilotverantwortliche Person mit geschäftlicher E-Mail
- technischer Kontakt mit geschäftlicher E-Mail

Keine OIDC-Subjects, Client Secrets, Tokens oder Passwörter eintragen.

## 4. Daten und Betrieb

- Hostingregion: Deutschland, Irland oder andere EU-Region
- erwartete Nutzerzahl, maximal 50 im Pilot
- erwartete Cases pro Monat
- Aufbewahrung: 30, 60 oder 90 Tage
- Bestätigung, dass keine besonderen Kategorien personenbezogener Daten, Zahlungsdaten, Zugangsdaten oder unkontrollierten Anhänge verarbeitet werden

## Danach

Das Formular fordert die Einrichtung nur an. Relay prüft anschließend separat PostgreSQL/RLS, OIDC, Secret Store/Rotation, Provideradapter, 100-Event-Shadow-Run und Backup/Restore. Erst deren Abnahme erlaubt reale Kommunikationsdaten.
