# Arbeitszyklus 06 — Pilot Release Readiness und Ersteinrichtung

## Ergebnis

Relay wurde von einer technischen Alpha in Richtung konditionierter Design-Partner-Pilot gehärtet. Zusätzlich existiert jetzt ein geschützter Fünf-Schritt-Wizard, mit dem ein berechtigter Nutzer die gemeinsam entscheidbaren Pilotangaben strukturiert als Einrichtungsauftrag übermittelt.

Der Wizard ist ausdrücklich keine Self-Service-Provisionierung und kein Go-live-Schalter. Er erzeugt keine Secrets, aktiviert keinen Connector und akzeptiert keine Kommunikationsinhalte.

## Teamentscheidung und Widersprüche

- Product/UX befürwortete vier kurze Eingabeschritte plus Prüfung und widersprach einem überladenen Vertrags-/Technikformular.
- Security widersprach jeder direkten Verbindung zum privilegierten Bootstrap und verlangte eine eigene `pilot:configure`-Capability sowie Audit ohne Formularinhalte.
- Architecture widersprach einer Workflow Engine; ein festes, versioniertes Formular und deterministische Relay-Gates reichen für den Pilot.

Alle drei Einwände wurden übernommen. Der Abschluss heißt **Einrichtung anfordern**, nicht „Pilot starten“.

## Implementiert

- Produktionskonfiguration fällt ohne PostgreSQL, OIDC, Origin-Allowlist oder Secret-Injektion fail-closed aus.
- OIDC-Signaturen werden geprüft; Rolle und Capabilities kommen aus aktiver DB-Mitgliedschaft.
- API- und Worker-Rollen besitzen getrennte Least-Privilege-Grants.
- Liveness und schemaabhängige Readiness sind getrennt.
- API/Connector Rate Limits, Bodylimit, Security Header und redigierte strukturierte Logs.
- Worker nutzt PostgreSQL, verarbeitet Batches sequenziell und beendet kontrolliert.
- Dockerfile, PostgreSQL-Test-Compose, CI-Workflow und Pilot-Bootstrap-Skript.
- PostgreSQL-RLS-/Rollen-Suite als CI-Hard-Gate.
- Freitexte werden nicht in Domain Events, Audit oder Outbox vervielfältigt.
- Pilot-Onboarding-Datenmodell mit `FORCE RLS`, Composite Actor-FKs und Optimistic Concurrency.
- Wizard für Scope, Kanal, Anmeldung/Kontakte, Daten/Betrieb und Review.
- Serverseitige Ablehnung unbekannter Felder wie `clientSecret`.
- Audit zeichnet nur Aktion, Actor, Tenant, Request und Ergebnis auf – keine Formulardaten.

## Verifikation

- TypeScript Server/Web: bestanden.
- Produktionsbuild: bestanden.
- 29 Tests: bestanden.
- 5 echte PostgreSQL-Tests: vorhanden, lokal ohne PostgreSQL-Dienst übersprungen; CI führt sie nach Migration aus.
- OpenAPI 3.1 für Zyklus 06 exportiert.
- Dependency Audit war am 21. Juli nach Installation der neuen Abhängigkeiten mit 0 Vulnerabilities grün; die Registry war am 22. Juli nicht erreichbar.
- Interaktive Browserprüfung konnte am 22. Juli nicht gestartet werden, weil die Ausführungsumgebung lokale Serverports blockierte. Build und Web-Typecheck sind grün.

## Aktivierungsgrenze

Ein zahlender Pilot kann vertraglich und mit synthetischem Onboarding beginnen. Reale Kommunikationsdaten bleiben gesperrt, bis Managed PostgreSQL/RLS, OIDC-Verbindung, Secret-Rotation, echter Provideradapter, 100-Event-Shadow-Run sowie Backup/Restore praktisch bestanden und dokumentiert sind.

## Nächster Schritt

Einen der beiden Kunden als Pilot 1 auswählen und dessen Wizard ausfüllen. Der gewählte Eingangskanal bestimmt unmittelbar den nächsten Entwicklungsslice: der erste echte read-only Provideradapter.
