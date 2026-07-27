import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import "./pilot-onboarding.css";

type ChannelType = "email" | "instagram" | "tiktok";
type EmailProvider = "microsoft_365" | "google_workspace" | "other";
type ChannelAccount = {
  id: string;
  type: ChannelType;
  identifier: string;
  label?: string;
  provider?: EmailProvider;
  providerName?: string;
};
type Setup = {
  organizationName: string;
  brandName: string;
  workflowName: string;
  channelAccounts: ChannelAccount[];
  selectedChannelAccountId: string;
  inventoryConfirmed: boolean;
  identityProvider: "entra" | "google" | "okta" | "other";
  systemOfRecord: "salesforce" | "hubspot" | "zendesk" | "dynamics" | "custom" | "none" | "other";
  hostingRegion: "eu_germany" | "eu_ireland" | "eu_other";
  targetStartDate: string;
  teamNames: [string, string];
  expectedUsers: number;
  monthlyCases: number;
  retentionDays: 30 | 60 | 90;
  pilotOwnerName: string;
  pilotOwnerEmail: string;
  technicalContactName: string;
  technicalContactEmail: string;
  accessEnvironment: "sandbox" | "test_account" | "production_approved";
  dataExclusionsConfirmed: boolean;
  version?: number;
};
type Response = { setup: Setup | null; state: string; relayGates?: string[]; nextStep: string };

const start = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const newId = () => crypto.randomUUID();
const newAccount = (type: ChannelType): ChannelAccount => ({
  id: newId(),
  type,
  identifier: "",
  label: "",
  ...(type === "email" ? { provider: "microsoft_365" as const } : {})
});
const initialEmail = newAccount("email");
const empty: Setup = {
  organizationName: "",
  brandName: "",
  workflowName: "",
  channelAccounts: [initialEmail],
  selectedChannelAccountId: initialEmail.id,
  inventoryConfirmed: false,
  identityProvider: "entra",
  systemOfRecord: "none",
  hostingRegion: "eu_germany",
  targetStartDate: start,
  teamNames: ["", ""],
  expectedUsers: 8,
  monthlyCases: 500,
  retentionDays: 30,
  pilotOwnerName: "",
  pilotOwnerEmail: "",
  technicalContactName: "",
  technicalContactEmail: "",
  accessEnvironment: "sandbox",
  dataExclusionsConfirmed: false
};
const channelLabels: Record<ChannelType, string> = { email: "E-Mail", instagram: "Instagram", tiktok: "TikTok" };
const providerLabels: Record<EmailProvider, string> = { microsoft_365: "Microsoft 365", google_workspace: "Google Workspace", other: "Anderer Provider" };
const idpLabels = { entra: "Microsoft Entra", google: "Google Workspace", okta: "Okta", other: "Anderer IdP" };
const systemLabels = { salesforce: "Salesforce", hubspot: "HubSpot", zendesk: "Zendesk", dynamics: "Microsoft Dynamics", custom: "Eigenes System", none: "Keines", other: "Anderes" };
const gateLabels: Record<string, string> = {
  managed_postgres_rls: "PostgreSQL & Tenant-Isolation",
  oidc_connection: "OIDC-Verbindung",
  secret_store_rotation: "Secret Store & Rotation",
  provider_adapter_fixture: "Provideradapter-Fixtures",
  shadow_run_100: "Shadow Run mit 100 Events",
  backup_restore: "Backup & Restore"
};

function normalizeSetup(setup: Setup): Setup {
  const accounts = Array.isArray(setup.channelAccounts)
    ? setup.channelAccounts.map(account => ({
      ...account,
      label: account.label ?? "",
      provider: account.provider ?? undefined,
      providerName: account.providerName ?? undefined
    }))
    : [];
  if (accounts.length > 0 && setup.selectedChannelAccountId) return { ...setup, channelAccounts: accounts };
  const fallback = newAccount("email");
  return { ...setup, channelAccounts: accounts.length ? accounts : [fallback], selectedChannelAccountId: fallback.id, inventoryConfirmed: false };
}

export function PilotOnboarding() {
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<Setup>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Response | null>(null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api<Response>("/api/v1/pilot-onboarding")
      .then(response => {
        if (response.setup) setValue(normalizeSetup(response.setup));
        setResult(response.setup ? response : null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof Setup>(key: K, next: Setup[K]) => setValue(current => ({ ...current, [key]: next }));
  const counts = useMemo(() => value.channelAccounts.reduce<Record<ChannelType, number>>(
    (current, account) => ({ ...current, [account.type]: current[account.type] + 1 }),
    { email: 0, instagram: 0, tiktok: 0 }
  ), [value.channelAccounts]);
  const selectedAccount = value.channelAccounts.find(account => account.id === value.selectedChannelAccountId);
  const accountSummary = `${counts.email} E-Mail · ${counts.instagram} Instagram · ${counts.tiktok} TikTok`;

  const addAccount = (type: ChannelType) => {
    const account = newAccount(type);
    setValue(current => ({ ...current, channelAccounts: [...current.channelAccounts, account] }));
  };
  const changeAccount = (id: string, patch: Partial<ChannelAccount>) => {
    setValue(current => ({ ...current, channelAccounts: current.channelAccounts.map(account => account.id === id ? { ...account, ...patch } : account) }));
  };
  const removeAccount = (id: string) => {
    setValue(current => ({
      ...current,
      channelAccounts: current.channelAccounts.filter(account => account.id !== id),
      selectedChannelAccountId: current.selectedChannelAccountId === id ? "" : current.selectedChannelAccountId,
      inventoryConfirmed: false
    }));
  };
  const selectPilot = (id: string) => {
    setValue(current => ({
      ...current,
      selectedChannelAccountId: id,
      channelAccounts: current.channelAccounts.map(account => account.id === id && account.type === "email" && !account.provider ? { ...account, provider: "microsoft_365" } : account)
    }));
  };
  const next = () => {
    if (form.current?.reportValidity()) setStep(current => Math.min(4, current + 1));
  };
  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      const { version: _version, ...payload } = value;
      const response = await api<Response>("/api/v1/pilot-onboarding", {
        method: "PUT",
        headers: { "If-Match": String(value.version ?? 0) },
        body: JSON.stringify(payload)
      });
      setValue(normalizeSetup(response.setup!));
      setResult(response);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="setup-loading">Ersteinrichtung wird geladen …</div>;
  if (result?.setup && result.state === "relay_review_required") {
    const savedSelected = result.setup.channelAccounts.find(account => account.id === result.setup?.selectedChannelAccountId);
    const savedCounts = result.setup.channelAccounts.reduce<Record<ChannelType, number>>(
      (current, account) => ({ ...current, [account.type]: current[account.type] + 1 }),
      { email: 0, instagram: 0, tiktok: 0 }
    );
    return <section className="setup-view">
      <header className="setup-header"><span className="eyebrow">Pilot Control Plane</span><h1>Einrichtung angefordert</h1><p>{result.nextStep}</p></header>
      <div className="setup-success">
        <div className="success-check">✓</div>
        <h2>{result.setup.brandName}</h2>
        <p>{result.setup.organizationName} · Startziel {new Intl.DateTimeFormat("de-DE").format(new Date(`${result.setup.targetStartDate}T12:00:00`))}</p>
        <div className="pilot-selection-summary"><span className="eyebrow">Pilot-Postfach</span><strong>{savedSelected?.identifier}</strong><small>{savedSelected?.provider ? providerLabels[savedSelected.provider] : ""} · {result.setup.accessEnvironment}</small></div>
        <p className="inventory-summary">{savedCounts.email + savedCounts.instagram + savedCounts.tiktok} Kanäle erfasst · {savedCounts.email} E-Mail · {savedCounts.instagram} Instagram · {savedCounts.tiktok} TikTok</p>
        <div className="gate-preview"><span className="eyebrow">Von Relay zu prüfen</span>{(result.relayGates ?? []).map(gate => <div key={gate}><span /> {gateLabels[gate] ?? gate}</div>)}</div>
        <button className="secondary" onClick={() => { setResult(null); setStep(0); }}>Angaben bearbeiten</button>
      </div>
    </section>;
  }

  const titles = ["Pilot festlegen", "Kanäle & Pilot-Postfach", "Anmeldung & Kontakte", "Daten & Betrieb", "Prüfen & anfordern"];
  return <section className="setup-view">
    <header className="setup-header"><span className="eyebrow">Pilot Control Plane</span><h1>Ersteinrichtung</h1><p>Vollständiger Kanalbestand, aber genau ein Pilot-Postfach. Secrets und echte Kommunikationsdaten gehören ausdrücklich nicht in dieses Formular.</p></header>
    <div className="setup-shell">
      <ol className="setup-steps">{titles.map((title, index) => <li className={index === step ? "active" : index < step ? "done" : ""} key={title}><span>{index < step ? "✓" : index + 1}</span><div><strong>{title}</strong><small>{index === step ? "In Bearbeitung" : index < step ? "Vollständig" : "Ausstehend"}</small></div></li>)}</ol>
      <form ref={form} className="setup-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="setup-form-head"><span>Schritt {step + 1} von 5</span><h2>{titles[step]}</h2></div>
        {step === 0 && <div className="setup-fields">
          <label>Unternehmen<input required minLength={2} value={value.organizationName} onChange={event => update("organizationName", event.target.value)} placeholder="z. B. R&C Lifestyle" /></label>
          <label>Marke<input required minLength={2} value={value.brandName} onChange={event => update("brandName", event.target.value)} placeholder="z. B. Blazed Outfitters" /></label>
          <label className="wide">Abgegrenzter Pilotprozess<input required minLength={3} value={value.workflowName} onChange={event => update("workflowName", event.target.value)} placeholder="z. B. Kundenanfrage bis bestätigte Übergabe" /></label>
          <label>Team 1<input required minLength={2} value={value.teamNames[0]} onChange={event => update("teamNames", [event.target.value, value.teamNames[1]])} /></label>
          <label>Team 2<input required minLength={2} value={value.teamNames[1]} onChange={event => update("teamNames", [value.teamNames[0], event.target.value])} /></label>
          <label>Geplanter Start<input required type="date" value={value.targetStartDate} onChange={event => update("targetStartDate", event.target.value)} /></label>
        </div>}
        {step === 1 && <div className="channel-inventory">
          <div className="inventory-intro"><div><strong>{value.channelAccounts.length} Kanäle erfasst</strong><span>{accountSummary}</span></div><p>Erfasse alle Kanäle, über die Kunden die Marke kontaktieren. Für den Pilot wird zunächst genau ein E-Mail-Postfach verbunden.</p></div>
          {(["email", "instagram", "tiktok"] as ChannelType[]).map(type => <section className="channel-group" key={type}>
            <div className="channel-group-head"><div><h3>{channelLabels[type]}</h3><span>{counts[type]} erfasst</span></div><button type="button" className="secondary compact" onClick={() => addAccount(type)}>+ {channelLabels[type]} hinzufügen</button></div>
            {value.channelAccounts.filter(account => account.type === type).length === 0 && <p className="channel-empty">Noch kein {channelLabels[type]}-Kanal erfasst.</p>}
            {value.channelAccounts.filter(account => account.type === type).map(account => {
              const selected = account.id === value.selectedChannelAccountId;
              return <div className={`channel-account ${selected ? "pilot-account" : ""}`} key={account.id}>
                <div className="channel-account-fields">
                  <label>{type === "email" ? "Geschäftliche E-Mail-Adresse" : "Öffentlicher Handle"}<input required type={type === "email" ? "email" : "text"} pattern={type === "email" ? undefined : "@?[A-Za-z0-9._-]{2,100}"} value={account.identifier} onChange={event => changeAccount(account.id, { identifier: event.target.value })} placeholder={type === "email" ? "support@unternehmen.de" : "@marke"} /></label>
                  <label>Bezeichnung <span className="optional">optional</span><input value={account.label ?? ""} onChange={event => changeAccount(account.id, { label: event.target.value })} placeholder="z. B. Kundenservice DE" /></label>
                </div>
                <div className="channel-account-actions">
                  {type === "email"
                    ? <label className="pilot-radio"><input required name="pilot-account" type="radio" checked={selected} onChange={() => selectPilot(account.id)} /><span><strong>Als Pilot-Postfach verwenden</strong><small>{selected ? "Wird nach Sicherheitsprüfung im Shadow Mode verbunden" : "Nur Bestand"}</small></span></label>
                    : <span className="blocked-badge">Nur Bestand · nicht Teil dieses Piloten</span>}
                  <button type="button" className="remove-channel" onClick={() => removeAccount(account.id)} aria-label={`${channelLabels[type]} entfernen`}>Entfernen</button>
                </div>
                {type === "email" && <div className="pilot-provider">
                  <label>Provider {selected ? "des Pilot-Postfachs" : <span className="optional">optional</span>}
                    <select required={selected} value={account.provider ?? ""} onChange={event => {
                      const provider = event.target.value as EmailProvider | "";
                      changeAccount(account.id, {
                        provider: provider || undefined,
                        providerName: provider === "other" ? account.providerName : undefined
                      });
                    }}>
                      <option value="">Nicht angegeben</option>
                      {Object.entries(providerLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                    </select>
                  </label>
                  {account.provider === "other" && <label>Konkreter Anbieter
                    <input required minLength={2} maxLength={120} value={account.providerName ?? ""} onChange={event => changeAccount(account.id, { providerName: event.target.value })} placeholder="z. B. ALL-INKL" />
                  </label>}
                </div>}
              </div>;
            })}
          </section>)}
          <div className="setup-callout">Wähle das Postfach, das zum Pilotprozess gehört und für das ein Testzugang bereitgestellt werden kann. Diese Auswahl aktiviert noch keine Verbindung.</div>
          <label className="setup-confirm inventory-confirm"><input required type="checkbox" checked={value.inventoryConfirmed} onChange={event => update("inventoryConfirmed", event.target.checked)} /><span>Ich bestätige, dass alle aktuell genutzten Kundenkontakt-Kanäle erfasst sind.</span></label>
        </div>}
        {step === 2 && <div className="setup-fields">
          <label className="wide">Identity Provider<select value={value.identityProvider} onChange={event => update("identityProvider", event.target.value as Setup["identityProvider"])}>{Object.entries(idpLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label>Zugangsumgebung<select value={value.accessEnvironment} onChange={event => update("accessEnvironment", event.target.value as Setup["accessEnvironment"])}><option value="sandbox">Sandbox</option><option value="test_account">Isoliertes Testkonto</option><option value="production_approved">Produktivzugang freigegeben</option></select></label>
          <label>Führendes System<select value={value.systemOfRecord} onChange={event => update("systemOfRecord", event.target.value as Setup["systemOfRecord"])}>{Object.entries(systemLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label>Pilotverantwortliche Person<input required value={value.pilotOwnerName} onChange={event => update("pilotOwnerName", event.target.value)} /></label>
          <label>Geschäftliche E-Mail<input required type="email" value={value.pilotOwnerEmail} onChange={event => update("pilotOwnerEmail", event.target.value)} /></label>
          <label>Technischer Kontakt<input required value={value.technicalContactName} onChange={event => update("technicalContactName", event.target.value)} /></label>
          <label>Geschäftliche E-Mail<input required type="email" value={value.technicalContactEmail} onChange={event => update("technicalContactEmail", event.target.value)} /></label>
          <div className="setup-callout wide">Keine Passwörter, Client Secrets, Tokens oder OIDC-Subjects eintragen. Diese werden später über den sicheren Verbindungsprozess eingerichtet.</div>
        </div>}
        {step === 3 && <div className="setup-fields">
          <label>Hostingregion<select value={value.hostingRegion} onChange={event => update("hostingRegion", event.target.value as Setup["hostingRegion"])}><option value="eu_germany">EU · Deutschland</option><option value="eu_ireland">EU · Irland</option><option value="eu_other">Andere EU-Region</option></select></label>
          <label>Vorgesehene Nutzer<input required type="number" min={2} max={50} value={value.expectedUsers} onChange={event => update("expectedUsers", Number(event.target.value))} /></label>
          <label>Cases pro Monat<input required type="number" min={1} max={10000} value={value.monthlyCases} onChange={event => update("monthlyCases", Number(event.target.value))} /></label>
          <label>Aufbewahrung<select value={value.retentionDays} onChange={event => update("retentionDays", Number(event.target.value) as Setup["retentionDays"])}><option value={30}>30 Tage</option><option value={60}>60 Tage</option><option value={90}>90 Tage</option></select></label>
          <label className="setup-confirm wide"><input required type="checkbox" checked={value.dataExclusionsConfirmed} onChange={event => update("dataExclusionsConfirmed", event.target.checked)} /><span>Im Pilot werden keine besonderen Kategorien personenbezogener Daten, Zahlungsdaten, Zugangsdaten oder unkontrollierten Anhänge verarbeitet.</span></label>
        </div>}
        {step === 4 && <div className="setup-review">
          <Review title="Pilot" rows={[["Unternehmen", value.organizationName], ["Marke", value.brandName], ["Prozess", value.workflowName], ["Teams", value.teamNames.join(" · ")], ["Start", value.targetStartDate]]} />
          <Review title="Wird im Pilot verbunden" rows={[["Postfach", selectedAccount?.identifier ?? "Nicht gewählt"], ["Provider", selectedAccount?.provider ? providerLabels[selectedAccount.provider] : "Nicht gewählt"], ["Umgebung", value.accessEnvironment], ["System", systemLabels[value.systemOfRecord]]]} />
          <Review title="Nur erfasst" rows={[["Gesamtbestand", `${value.channelAccounts.length} Kanäle`], ["Aufteilung", accountSummary], ["Außerhalb Pilot", `${Math.max(0, value.channelAccounts.length - 1)} Accounts`], ["Anmeldung", idpLabels[value.identityProvider]]]} />
          <Review title="Betrieb" rows={[["Region", value.hostingRegion], ["Nutzer", String(value.expectedUsers)], ["Cases/Monat", String(value.monthlyCases)], ["Retention", `${value.retentionDays} Tage`]]} />
          <div className="setup-warning"><strong>Dadurch erfolgt kein Go-live.</strong><span>Nur das gewählte E-Mail-Postfach kann nach Datenbank-, OIDC-, Secret-, Provider- und Shadow-Run-Prüfung aktiviert werden. Instagram und TikTok bleiben blockiert.</span></div>
        </div>}
        {error && <div className="error-banner">{error}</div>}
        <div className="setup-actions">{step > 0 && <button type="button" className="secondary" onClick={() => setStep(current => current - 1)}>Zurück</button>}<span />{step < 4 ? <button type="button" className="primary" onClick={next}>Weiter</button> : <button className="primary" disabled={saving}>{saving ? "Wird angefordert …" : "Einrichtung anfordern"}</button>}</div>
      </form>
    </div>
  </section>;
}

function Review({ title, rows }: { title: string; rows: string[][] }) {
  return <div className="review-block"><h3>{title}</h3><dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}
