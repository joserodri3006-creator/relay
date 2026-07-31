# Arbeitszyklus 10 — Gmail-Autorisierung

## Ergebnis

Relay besitzt einen durchgängigen, providergekapselten Gmail-OAuth-Vertical-Slice:

- Autorisierung ist tenantgebunden an die stabile ID des gewählten Pilot-Postfachs.
- OAuth-State ist einmalig, gehasht gespeichert und läuft nach zehn Minuten ab.
- PKCE-Verifier und Google-Token liegen ausschließlich hinter einer `SecretVault`-Schnittstelle.
- Die Produktdatenbank speichert nur eine opaque Secret-Referenz.
- Relay akzeptiert ausschließlich die exakt konfigurierte und von Google bestätigte E-Mail-Adresse.
- Der Flow prüft den tatsächlich gewährten Gmail-Readonly-Scope.
- Verbindung, Fehler und Widerruf erzeugen Audit-Einträge.
- Die Onboarding-UI zeigt Verbindungsstatus, Fehler und kontrolliertes Trennen.

## Bewusste Produktionsgrenze

Der lokale Modus nutzt einen flüchtigen In-Memory-Vault. Google OAuth bleibt in Produktion
fail-closed, bis ein verwalteter Secret-Vault-Adapter bereitsteht. Damit werden weder Refresh
Tokens noch Client Secrets aus Bequemlichkeit in die Produktdatenbank oder das Repository gelegt.

## Verifikation

- TypeScript- und React-Typecheck
- 37 Tests bestanden, 5 PostgreSQL-Tests lokal übersprungen
- Replay-, Account-Mismatch-, Scope- und Token-Leakage-Grenzen getestet
- Produktions-Build erfolgreich
- OpenAPI 3.1 exportiert
- npm Audit ohne bekannte Schwachstellen
