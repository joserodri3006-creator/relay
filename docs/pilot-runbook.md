# Relay Pilot Runbook v0.1

## Pilotvertrag

Der freigegebene Pilot ist auf einen Tenant, einen eingehenden Kommunikationskanal, einen abgegrenzten Serviceprozess, zwei Teams und 5–15 benannte Nutzer begrenzt. Relay koordiniert Cases, Ownership, Commitments und bestätigte Handoffs. Das bestehende CRM/FSM/Helpdesk bleibt System of Record.

Nicht enthalten: externes Senden, AI, Anhänge, historische Vollmigration, Identity Merge, Workflow Builder, 24/7-SLA, White Label oder individuelle Kernentitäten.

## Aktivierungsphasen

1. **Contracted:** SOW, AVV/DPA, Preis, 50 Prozent Vorauszahlung, Volumenlimit, Retention und Exit-Regel sind unterschrieben.
2. **Configured:** EU-Datenbank, Migrationen, OIDC-Membership, Connector und Secret-Referenz sind provisioniert.
3. **Shadow:** mindestens 100 synthetische/signierte Events durchlaufen Ingress, Idempotenz, Outbox und Operations ohne Verlust.
4. **Live approved:** PostgreSQL-RLS-Suite, Backup/Restore, Secret-Rotation, Provider-Fixtures und Incidentkontakte sind schriftlich abgenommen.
5. **Controlled live:** tägliche Reconciliation in Woche 1; danach wöchentlicher Outcome Review.

Reale Kommunikationsdaten sind vor Phase 4 verboten.

## Einrichtungsauftrag aus dem Produkt

Die Navigation **Ersteinrichtung** ist nur mit `pilot:configure` sichtbar. Der Wizard erfasst den gemeinsam vereinbarten Pilotumfang und speichert einen versionierten Auftrag im Tenant. Die abschließende Aktion heißt bewusst **Einrichtung anfordern**.

Der Auftrag darf weder Datenbank-/Cloud-Provisionierung noch Connectoraktivierung oder Go-live auslösen. Das Kanalinventar dokumentiert alle bekannten geschäftlichen Endpunkte, wählt aber genau ein E-Mail-Postfach als Pilotkandidaten. Weitere Postfächer bleiben `inventory`; Instagram und TikTok bleiben `blocked`. Das vorhandene Bootstrap-Skript bleibt ein getrennter, privilegierter Deployment-Schritt. Formulardaten werden nicht in Audit-Metadaten, Domain Events oder Outbox kopiert.

## Technisches Deployment

1. Managed PostgreSQL in vereinbarter EU-Region erstellen. Owner/Migrator, API-Login und Worker-Login trennen.
2. Als Migrator `DATABASE_URL=... npm run migrate:postgres` ausführen.
3. Loginrollen ohne Ownership und `BYPASSRLS` anlegen; API erhält Mitgliedschaft in `relay_api`, Worker in `relay_worker`.
4. Tenant, ersten Actor, OIDC-Subject und Connector mit `npm run bootstrap:pilot` provisionieren.
5. Connectorsecret im verwalteten Secret Store erzeugen und als `CONNECTOR_SECRET` injizieren; niemals in Git, DB oder Logs speichern.
6. API-Image und dasselbe Image mit Command `node dist/server/worker-main.js` als Worker deployen.
7. Liveness `/health/live`, Readiness `/health/ready`; nur ready Instanzen erhalten Traffic.

## Go-live Gates

- Produktion startet ohne PostgreSQL, OIDC, Origin-Allowlist oder Connectorsecret nicht.
- Runtime ist weder Tabellenowner noch Superuser/BYPASSRLS.
- RLS-Negativtest beweist: kein Kontext = keine Zeile; Tenant A kann bekannte Tenant-B-UUID weder lesen noch ändern.
- Falscher Issuer, Audience, Algorithmus, abgelaufenes Token und deaktivierte Membership werden abgewiesen.
- Connectorprüfung umfasst Raw Body, fünf Minuten Zeitfenster, Bodylimit und Rate Limit.
- Signaturangriffe erzeugen keine persistente Issue-Flut.
- Zwei Worker, Lease-Ablauf, Crash nach Publish sowie Dead Letter/Redrive sind getestet.
- Backup und Restore wurden praktisch ausgeführt.
- Keine besonderen Datenkategorien, Zahlungsdaten, Zugangsdaten oder unkontrollierten Anhänge.

## Erfolgsmessung

Baseline vor Start unterschreiben. Zielwerte: mindestens 30 Prozent weniger aktive Cases ohne Owner/nächsten Schritt, 25 Prozent schnellere bestätigte Handoffs, 20 Prozent weniger interne Kontext-Rückfragen, mindestens 60 Prozent WAU der vorgesehenen Operatoren und kein still verlorenes akzeptiertes Event.

## Incident-Kurzabläufe

**Connectorsecret kompromittiert:** Connector deaktivieren, Edge sperren, Secret rotieren, Signaturfehlerzeitraum bestimmen, betroffene Receipts abgleichen, Kunde informieren.

**Outbox festgefahren:** Zielsystem prüfen, aktive Leases respektieren, Dead Letter in Integrationsansicht prüfen, erst nach Ursachenbehebung einzelnes Redrive ausführen. Keine direkte Payload-/SQL-Manipulation.

**IdP nicht verfügbar:** bestehende gültige Tokens nur bis Ablauf akzeptieren; keine Demo-Auth aktivieren. Neue Sessions warten auf IdP-Wiederherstellung.

**Verdacht auf Tenant-Verletzung:** Traffic stoppen, Datenbankzugang sperren, Audit/Request-IDs sichern, keine manuellen Korrekturen, Incident- und Datenschutzprozess starten.

## Exit

Am Pilotende werden Export, Retention und Löschung nach SOW ausgeführt. Fortsetzung oder Expansion erfolgt nur bei messbarem Outcome und ohne Überschreitung von 20 Prozent segmentspezifischer beziehungsweise 10 Prozent kundenspezifischer Entwicklung.
