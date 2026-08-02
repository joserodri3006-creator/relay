# Arbeitszyklus 11 — Persistenter Secret Vault

## Ergebnis

Relay kann OAuth-Secrets produktiv in Google Cloud Secret Manager ablegen:

- Authentifizierung über kurzlebige Workload-Identity-Tokens vom Metadatenserver
- keine statischen Service-Account-Schlüssel
- gehashte Ressourcennamen ohne Tenant- oder Account-IDs
- versionierte Writes und Deaktivierung älterer aktiver Versionen
- strukturelle Payload-Validierung beim Lesen
- vollständige Löschung beim Widerruf
- fail-closed Produktionskonfiguration

Die cloudneutrale `SecretVault`-Schnittstelle bleibt bestehen. Weitere Adapter können ohne Änderung am
OAuth- oder Kanalmodell ergänzt werden.

## Verifikation

- Workload-Token-Cache und Metadata-Flavor getestet
- Create, AddVersion, Access, Rotation und Delete getestet
- manipulierte Payloads werden verworfen
- 41 Anwendungstests bestanden; 5 PostgreSQL-Tests werden zusätzlich in CI ausgeführt
