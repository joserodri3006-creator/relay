# Google Cloud Secret Manager für Relay

## Ziel

OAuth-Token verlassen weder den Prozessspeicher noch den verwalteten Secret Manager. Die Relay-Datenbank
enthält ausschließlich eine gehashte, opaque Referenz. Statische Service-Account-Schlüssel sind verboten.

## Laufzeitkonfiguration

```text
SECRET_VAULT_MODE=gcp
GOOGLE_CLOUD_PROJECT=<projekt-id>
```

Die Laufzeit bezieht kurzlebige Access Tokens über den Google-Metadatenserver. Der Workload muss deshalb
mit einem eigenen Service Account betrieben werden. Lokal bleibt `SECRET_VAULT_MODE=memory` die sichere
Voreinstellung für Tests; dieser Modus ist mit produktiv aktiviertem Google OAuth nicht erlaubt.

## Minimale IAM-Berechtigungen

Für einen kundenspezifischen IAM-Role sind nur folgende Secret-Manager-Berechtigungen erforderlich:

- `secretmanager.secrets.create`
- `secretmanager.secrets.get`
- `secretmanager.secrets.delete`
- `secretmanager.versions.add`
- `secretmanager.versions.access`
- `secretmanager.versions.list`
- `secretmanager.versions.disable`

Der Role wird ausschließlich dem Relay-Runtime-Service-Account im gewählten Projekt zugewiesen.

## Verhalten

- Secret-Namen werden aus SHA-256 der internen Referenz abgeleitet; Tenant-, Account- und Provider-IDs
  erscheinen nicht im Cloud-Ressourcennamen.
- `put` erzeugt eine neue Version und deaktiviert vorherige aktive Versionen.
- `get` liest ausschließlich `latest` und validiert die entschlüsselte JSON-Struktur.
- `delete` löscht das gesamte Secret beim kontrollierten OAuth-Widerruf.
- Provider-Fehlerkörper und Secret-Werte werden weder geloggt noch an API-Clients weitergegeben.

## Produktionsgates

Vor dem ersten Kundenbetrieb müssen Secret Manager API, Workload Identity, der Least-Privilege-Role,
Audit Logs, Alarmierung auf IAM-Änderungen und ein dokumentierter Break-Glass-Prozess verifiziert sein.
