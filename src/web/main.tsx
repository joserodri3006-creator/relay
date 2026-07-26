import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./handoff.css";
import "./operations.css";
import { PilotOnboarding } from "./PilotOnboarding";
import { api, isTestIngressEnabled } from "./api";

type CaseStatus = "open" | "waiting_external" | "waiting_internal" | "resolved" | "closed";
type Actor = { id: string; name: string; role: "editor" | "viewer" };
type CaseRow = {
  id: string; subject: string; party_name: string; status: CaseStatus; owner_actor_id: string | null;
  owner_name: string | null; version: number; updated_at: string; preview: string; channel: string;
  next_due_at: string | null; open_commitments: number;
};
type Interaction = { id: string; channel: string; direction: "inbound" | "outbound"; body: string; party_name: string; occurred_at: string; provider_event_id: string };
type Commitment = { id: string; description: string; status: "open" | "fulfilled" | "cancelled"; assignee_name: string; due_at: string | null; overdue: boolean };
type Handoff = { id: string; from_actor_id: string; to_actor_id: string; from_actor_name: string; to_actor_name: string; reason: string; next_step: string; due_at: string | null; status: "pending" | "accepted" | "declined" | "cancelled"; created_at: string };
type TimelineEvent = { id: string; event_type: string; actor_name: string | null; data: Record<string, unknown>; occurred_at: string };
type AuditEntry = { id: string; action: string; result: string; request_id: string; occurred_at: string };
type CaseDetail = CaseRow & { connector_id: string; external_thread_id: string; interactions: Interaction[]; commitments: Commitment[]; handoffs: Handoff[]; events: TimelineEvent[] };
type Session = { actorId: string; name: string; role: "editor" | "viewer"; capabilities: Array<"case:write" | "integration:operate" | "pilot:configure"> };
type IntegrationIssue = { id: string; kind: "ingress" | "outbox"; subject: string; state: "blocked" | "retrying" | "dead_letter" | "resolved"; code: string; attempts: number; occurred_at: string; retry_eligible: boolean; connector_name: string | null };
type Problem = { title?: string; code?: string; details?: unknown };

const statusLabels: Record<CaseStatus, string> = { open: "Offen", waiting_external: "Wartet auf Kunde", waiting_internal: "Wartet intern", resolved: "Gelöst", closed: "Geschlossen" };
const eventLabels: Record<string, string> = {
  "conversation.opened": "Case eröffnet", "conversation.reopened": "Case wiedereröffnet",
  "conversation.status_changed": "Status geändert", "ownership.assigned": "Owner zugewiesen",
  "ownership.released": "Zuweisung aufgehoben", "commitment.created": "Commitment erstellt",
  "commitment.fulfilled": "Commitment erfüllt", "commitment.cancelled": "Commitment abgebrochen",
  "handoff.requested": "Übergabe angefordert", "handoff.accepted": "Übergabe angenommen",
  "handoff.declined": "Übergabe abgelehnt", "handoff.cancelled": "Übergabe abgebrochen"
};

function formatRelative(date: string) {
  const seconds = Math.round((new Date(date).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}
const dateTime = (value: string) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

function Icon({ name }: { name: "inbox" | "user" | "users" | "check" | "plus" | "arrow" | "clock" | "signal" | "plug" | "setup" }) {
  const paths: Record<string, React.ReactNode> = {
    inbox: <><path d="M4 5h16l-2 13H6L4 5Z"/><path d="M4.8 13h4l1.5 2h3.4l1.5-2h4"/></>,
    user: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></>,
    users: <><path d="M16 20a5 5 0 0 0-10 0"/><circle cx="11" cy="8" r="3"/><path d="M18 9a2.5 2.5 0 0 1 0 5M19 20a4 4 0 0 0-3-3.9"/></>,
    check: <path d="m5 12 4 4L19 6"/>, plus: <path d="M12 5v14M5 12h14"/>, arrow: <path d="m9 18 6-6-6-6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, signal: <><path d="M5 17h2M10 13h2v4h-2zM15 8h2v9h-2z"/></>,
    plug: <><path d="M8 3v5M16 3v5M6 8h12v2a6 6 0 0 1-6 6v5M9 21h6"/></>,
    setup: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

function StatusPill({ status }: { status: CaseStatus }) { return <span className={`status status-${status}`}><span />{statusLabels[status]}</span>; }

function EmptyState({ view, onCreate }: { view: string; onCreate: () => void }) {
  return <div className="empty"><div className="empty-icon"><Icon name="inbox" /></div><h3>Hier ist alles unter Kontrolle</h3><p>{view === "mine" ? "Dir sind aktuell keine offenen Cases zugewiesen." : "Für diese Ansicht gibt es noch keine Cases."}</p>{isTestIngressEnabled() && <button className="secondary" onClick={onCreate}>Testevent einspeisen</button>}</div>;
}

function IngressDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ partyName: "Anna Weber", subject: "Kühlanlage meldet wiederholt Fehler E17", body: "Guten Morgen, die Anlage ist seit heute früh wieder ausgefallen. Können Sie uns bis 14 Uhr zurückrufen?", channel: "email", externalThreadId: `thread-${Date.now()}` });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<{ caseId: string }>("/api/v1/ingress/events", { method: "POST", body: JSON.stringify({ ...form, connectorId: "demo-adapter", providerEventId: crypto.randomUUID(), direction: "inbound" }) });
      onCreated(result.caseId);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return <div className="dialog-backdrop" onMouseDown={onClose}><form className="dialog" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
    <div className="dialog-head"><div><span className="eyebrow">Lokales Testwerkzeug</span><h2>Kanalereignis einspeisen</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Schließen">×</button></div>
    <p className="dialog-note">Dieses Werkzeug simuliert einen authentifizierten Adapter. Es versendet keine Nachricht.</p>
    <label>Externe Partei<input value={form.partyName} onChange={e => setForm({ ...form, partyName: e.target.value })} required /></label>
    <label>Betreff<input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} required /></label>
    <label>Nachricht<textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={5} required /></label>
    <div className="form-grid"><label>Kanal<select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}><option value="email">E-Mail</option><option value="whatsapp">WhatsApp</option><option value="api">API</option></select></label><label>Externe Thread-ID<input value={form.externalThreadId} onChange={e => setForm({ ...form, externalThreadId: e.target.value })} required /></label></div>
    {error && <div className="error-banner">{error}</div>}
    <div className="dialog-actions"><button type="button" className="secondary" onClick={onClose}>Abbrechen</button><button className="primary" disabled={busy}>{busy ? "Wird verarbeitet …" : "Event einspeisen"}</button></div>
  </form></div>;
}

function CommitmentForm({ actors, ownerId, onCancel, onSave }: { actors: Actor[]; ownerId: string | null; onCancel: () => void; onSave: (value: { description: string; assigneeId: string; dueAt: string | null }) => Promise<void> }) {
  const [description, setDescription] = useState(""); const [assigneeId, setAssigneeId] = useState(ownerId ?? actors.find(a => a.role === "editor")?.id ?? ""); const [dueAt, setDueAt] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="commitment-form" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave({ description, assigneeId, dueAt: dueAt ? new Date(dueAt).toISOString() : null }).finally(() => setBusy(false)); }}>
    <label>Was schulden wir?<textarea autoFocus value={description} onChange={e => setDescription(e.target.value)} placeholder="z. B. Rückruf mit Terminbestätigung" rows={3} required minLength={3} /></label>
    <div className="form-grid"><label>Verantwortlich<select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>{actors.filter(a => a.role === "editor").map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label><label>Fällig<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label></div>
    <div className="inline-actions"><button type="button" className="text-button" onClick={onCancel}>Abbrechen</button><button className="primary compact" disabled={busy}>{busy ? "Speichert …" : "Commitment anlegen"}</button></div>
  </form>;
}

function HandoffForm({ actors, currentActorId, onCancel, onSave }: { actors: Actor[]; currentActorId: string; onCancel: () => void; onSave: (value: { toActorId: string; reason: string; nextStep: string; dueAt: string | null }) => Promise<void> }) {
  const recipients = actors.filter(a => a.role === "editor" && a.id !== currentActorId);
  const [toActorId, setToActorId] = useState(recipients[0]?.id ?? "");
  const [reason, setReason] = useState(""); const [nextStep, setNextStep] = useState(""); const [dueAt, setDueAt] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="commitment-form" onSubmit={async e => { e.preventDefault(); setBusy(true); await onSave({ toActorId, reason, nextStep, dueAt: dueAt ? new Date(dueAt).toISOString() : null }).finally(() => setBusy(false)); }}>
    <label>Empfänger<select value={toActorId} onChange={e => setToActorId(e.target.value)}>{recipients.map(a => <option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
    <label>Warum wird übergeben?<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Benötigte Expertise oder Zuständigkeit" rows={2} required minLength={3} /></label>
    <label>Nächster klarer Schritt<textarea value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="Was soll der Empfänger als Nächstes tun?" rows={2} required minLength={3} /></label>
    <label>Übernahme bis<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label>
    <div className="inline-actions"><button type="button" className="text-button" onClick={onCancel}>Abbrechen</button><button className="primary compact" disabled={busy || !toActorId}>{busy ? "Sendet …" : "Übergabe anfordern"}</button></div>
  </form>;
}

function IntegrationOperations() {
  const [issues, setIssues] = useState<IntegrationIssue[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); try { setIssues(await api("/api/v1/integration-issues")); setError(""); } catch (err) { setError((err as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const retry = async (id: string) => { setBusy(id); try { await api(`/api/v1/integration-issues/outbox/${id}/redrive`, { method: "POST" }); await load(); } catch (err) { setError((err as Error).message); } finally { setBusy(null); } };
  const dead = issues.filter(issue => issue.state === "dead_letter").length; const retrying = issues.filter(issue => issue.state === "retrying").length;
  return <section className="operations-view"><header className="topbar"><div><span className="eyebrow">Integration Operations</span><h1>Kanalzustand</h1></div><button className="secondary" onClick={() => void load()}>↻ Aktualisieren</button></header>
    <div className="operations-summary"><div><strong>{issues.length}</strong><span>offene Hinweise</span></div><div><strong>{retrying}</strong><span>im Wiederholungsfenster</span></div><div><strong>{dead}</strong><span>manuell zu prüfen</span></div></div>
    <main className="operations-list">{error && <div className="error-banner">{error}</div>}{loading ? <div className="loading"><span/><span/><span/></div> : issues.length === 0 ? <div className="operations-empty"><Icon name="plug"/><h2>Alle Kanäle arbeiten unauffällig</h2><p>Hier erscheinen nur Fehler, die Aufmerksamkeit benötigen – keine vollständige Event-Historie.</p></div> : issues.map(issue => <article className="issue-card" key={issue.id}><div className={`issue-mark issue-${issue.state}`}><Icon name={issue.kind === "ingress" ? "inbox" : "signal"}/></div><div className="issue-copy"><div><span className="eyebrow">{issue.kind === "ingress" ? issue.connector_name ?? "Connector" : "Event-Auslieferung"}</span><h2>{issue.subject.replaceAll("_", " ")}</h2></div><p><code>{issue.code}</code> · {dateTime(issue.occurred_at)}{issue.attempts ? ` · ${issue.attempts} Versuch${issue.attempts === 1 ? "" : "e"}` : ""}</p><small>{issue.kind === "ingress" ? "Der eingehende Request wurde verworfen und nicht gespeichert. Der Provider muss ihn neu senden." : issue.state === "dead_letter" ? "Automatische Versuche sind beendet. Nach Ursachenprüfung kann das Event erneut eingeplant werden." : "Der Worker versucht die Auslieferung weiterhin automatisch."}</small></div>{issue.kind === "outbox" && issue.retry_eligible && <button className="secondary compact" disabled={busy === issue.id} onClick={() => void retry(issue.id)}>{busy === issue.id ? "Plant ein …" : "Erneut einplanen"}</button>}</article>)}</main>
  </section>;
}

function CaseDetailPanel({ item, actors, session, onRefresh, onClose }: { item: CaseDetail; actors: Actor[]; session: Session; onRefresh: () => Promise<void>; onClose: () => void }) {
  const [adding, setAdding] = useState(false); const [addingHandoff, setAddingHandoff] = useState(false); const [audit, setAudit] = useState<AuditEntry[] | null>(null); const [error, setError] = useState(""); const actorName = (id: unknown) => actors.find(a => a.id === id)?.name ?? "Unbekannt";
  const mutate = async (url: string, method: string, body: unknown) => {
    setError("");
    try { await api(url, { method, headers: { "If-Match": String(item.version) }, body: JSON.stringify(body) }); await onRefresh(); }
    catch (err) { setError((err as Error).message); throw err; }
  };
  const combined = useMemo(() => [
    ...item.interactions.map(x => ({ ...x, kind: "interaction" as const, sort: x.occurred_at })),
    ...item.events.filter(x => x.event_type !== "interaction.recorded").map(x => ({ ...x, kind: "event" as const, sort: x.occurred_at }))
  ].sort((a, b) => new Date(a.sort).getTime() - new Date(b.sort).getTime()), [item]);
  return <section className="case-detail">
    <header className="detail-header"><button className="back-button" onClick={onClose}>←</button><div className="detail-title"><div className="detail-meta"><span>{item.party_name}</span><span>Case {item.id.slice(0, 8)}</span></div><h1>{item.subject}</h1></div><StatusPill status={item.status} /></header>
    {error && <div className="error-banner floating">{error}<button onClick={() => setError("")}>×</button></div>}
    <div className="detail-layout">
      <main className="timeline"><div className="section-heading"><div><span className="eyebrow">Chronologie</span><h2>Verlauf</h2></div><span className="muted">{combined.length} Ereignisse</span></div>
        <div className="timeline-list">{combined.map(entry => entry.kind === "interaction" ? <article className={`interaction interaction-${entry.direction}`} key={`i-${entry.id}`}>
          <div className="timeline-marker"><span>{entry.direction === "inbound" ? "↙" : "↗"}</span></div><div className="timeline-card"><div className="timeline-card-head"><strong>{entry.direction === "inbound" ? entry.party_name : "Importierte Antwort"}</strong><span>{entry.channel.toUpperCase()} · {dateTime(entry.occurred_at)}</span></div><p>{entry.body}</p><details><summary>Herkunft</summary><code>{entry.provider_event_id}</code></details></div>
        </article> : <article className="system-event" key={`e-${entry.id}`}><div className="timeline-marker"><span>·</span></div><div><strong>{eventLabels[entry.event_type] ?? entry.event_type}</strong><p>{entry.actor_name ?? "System"} · {dateTime(entry.occurred_at)}{entry.event_type === "ownership.assigned" ? ` · ${actorName(entry.data.ownerId)}` : ""}{entry.event_type === "conversation.status_changed" ? ` · ${statusLabels[entry.data.to as CaseStatus]}` : ""}</p></div></article>)}</div>
      </main>
      <aside className="context-panel">
        <div className="context-block"><span className="eyebrow">Steuerung</span><label>Status<select value={item.status} onChange={e => mutate(`/api/v1/cases/${item.id}/status`, "PATCH", { status: e.target.value }).catch(() => undefined)}>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Owner<select value={item.owner_actor_id ?? ""} onChange={e => mutate(`/api/v1/cases/${item.id}/owner`, "PUT", { ownerId: e.target.value || null }).catch(() => undefined)}><option value="">Nicht zugewiesen</option>{actors.filter(a => a.role === "editor").map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
        <div className="context-block"><div className="block-heading"><div><span className="eyebrow">Verantwortung</span><h3>Übergaben</h3></div>{!item.handoffs.some(h => h.status === "pending") && <button className="icon-button small" onClick={() => setAddingHandoff(true)} aria-label="Übergabe anfordern"><Icon name="plus" /></button>}</div>
          {addingHandoff && <HandoffForm actors={actors} currentActorId={session.actorId} onCancel={() => setAddingHandoff(false)} onSave={async value => { await mutate(`/api/v1/cases/${item.id}/handoffs`, "POST", value); setAddingHandoff(false); }} />}
          {!addingHandoff && item.handoffs.length === 0 && <div className="mini-empty"><Icon name="users" /><p>Keine aktive Übergabe.</p><button className="text-button" onClick={() => setAddingHandoff(true)}>Übergabe anfordern</button></div>}
          <div className="commitment-list">{item.handoffs.map(h => <article className={`handoff handoff-${h.status}`} key={h.id}><div className="handoff-route"><span>{h.from_actor_name}</span><strong>→</strong><span>{h.to_actor_name}</span><em>{h.status === "pending" ? "Wartet auf Annahme" : h.status === "accepted" ? "Angenommen" : h.status === "declined" ? "Abgelehnt" : "Abgebrochen"}</em></div><strong>{h.reason}</strong><p>Nächster Schritt: {h.next_step}{h.due_at ? ` · bis ${dateTime(h.due_at)}` : ""}</p>{h.status === "pending" && <div className="commitment-actions">{h.to_actor_id === session.actorId && <><button onClick={() => mutate(`/api/v1/cases/${item.id}/handoffs/${h.id}`, "PATCH", { decision: "accepted" }).catch(() => undefined)}>Annehmen</button><button onClick={() => mutate(`/api/v1/cases/${item.id}/handoffs/${h.id}`, "PATCH", { decision: "declined" }).catch(() => undefined)}>Ablehnen</button></>}{h.from_actor_id === session.actorId && <button onClick={() => mutate(`/api/v1/cases/${item.id}/handoffs/${h.id}`, "PATCH", { decision: "cancelled" }).catch(() => undefined)}>Abbrechen</button>}</div>}</article>)}</div>
        </div>
        <div className="context-block"><div className="block-heading"><div><span className="eyebrow">Verbindlichkeit</span><h3>Commitments</h3></div><button className="icon-button small" onClick={() => setAdding(true)} aria-label="Commitment anlegen"><Icon name="plus" /></button></div>
          {adding && <CommitmentForm actors={actors} ownerId={item.owner_actor_id} onCancel={() => setAdding(false)} onSave={async value => { await mutate(`/api/v1/cases/${item.id}/commitments`, "POST", value); setAdding(false); }} />}
          {!adding && item.commitments.length === 0 && <div className="mini-empty"><Icon name="check" /><p>Noch keine explizite Zusage.</p><button className="text-button" onClick={() => setAdding(true)}>Commitment anlegen</button></div>}
          <div className="commitment-list">{item.commitments.map(c => <article className={`commitment ${c.status !== "open" ? "done" : ""}`} key={c.id}><div className="commitment-top"><span className={`checkbox ${c.status !== "open" ? "checked" : ""}`}>{c.status !== "open" && "✓"}</span><div><strong>{c.description}</strong><p>{c.assignee_name}{c.due_at ? ` · ${c.overdue ? "Überfällig " : "Fällig "}${dateTime(c.due_at)}` : " · Ohne Frist"}</p></div></div>{c.status === "open" && <div className="commitment-actions"><button onClick={() => mutate(`/api/v1/cases/${item.id}/commitments/${c.id}`, "PATCH", { status: "fulfilled" }).catch(() => undefined)}>Erfüllen</button><button onClick={() => mutate(`/api/v1/cases/${item.id}/commitments/${c.id}`, "PATCH", { status: "cancelled" }).catch(() => undefined)}>Abbrechen</button></div>}</article>)}</div>
        </div>
        <div className="context-block source"><div className="block-heading"><span className="eyebrow">Quelle & Audit</span><button className="text-button" onClick={async () => setAudit(audit ? null : await api(`/api/v1/cases/${item.id}/audit`))}>{audit ? "Ausblenden" : "Audit anzeigen"}</button></div><dl><div><dt>Connector</dt><dd>{item.connector_id}</dd></div><div><dt>Thread</dt><dd>{item.external_thread_id}</dd></div><div><dt>Version</dt><dd>{item.version}</dd></div></dl>{audit && <div className="audit-list">{audit.map(a => <div key={a.id}><strong>{eventLabels[a.action] ?? a.action}</strong><span>{dateTime(a.occurred_at)} · {a.result}</span><code>{a.request_id}</code></div>)}</div>}</div>
      </aside>
    </div>
  </section>;
}

function App() {
  const [view, setView] = useState("unassigned"); const [cases, setCases] = useState<CaseRow[]>([]); const [actors, setActors] = useState<Actor[]>([]); const [session, setSession] = useState<Session | null>(null); const [selectedId, setSelectedId] = useState<string | null>(null); const [detail, setDetail] = useState<CaseDetail | null>(null); const [showIngress, setShowIngress] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const loadCases = useCallback(async () => { setLoading(true); try { setCases(await api(`/api/v1/cases?view=${view}`)); setError(""); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, [view]);
  const loadDetail = useCallback(async () => { if (!selectedId) return; setDetail(await api(`/api/v1/cases/${selectedId}`)); await loadCases(); }, [selectedId, loadCases]);
  useEffect(() => { api<Actor[]>("/api/v1/actors").then(setActors); }, []);
  useEffect(() => { api<Session>("/api/v1/session").then(setSession); }, []);
  useEffect(() => { if (view !== "integrations") void loadCases(); }, [loadCases, view]);
  useEffect(() => { if (selectedId) void api<CaseDetail>(`/api/v1/cases/${selectedId}`).then(setDetail).catch(e => setError(e.message)); else setDetail(null); }, [selectedId]);
  const views = [{ id: "mine", label: "Meine Cases", icon: "user" }, { id: "unassigned", label: "Nicht zugewiesen", icon: "inbox" }, { id: "active", label: "Alle aktiven", icon: "users" }, { id: "resolved", label: "Gelöst", icon: "check" }] as const;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark">R</div><div><strong>Relay</strong><span>Case Control</span></div></div><nav><span className="nav-label">Arbeitsbereich</span>{views.map(v => <button key={v.id} className={view === v.id ? "active" : ""} onClick={() => { setView(v.id); setSelectedId(null); }}><Icon name={v.icon} />{v.label}{v.id === "unassigned" && cases.length > 0 && view === v.id && <span className="count">{cases.length}</span>}</button>)}{(session?.capabilities.includes("integration:operate") || session?.capabilities.includes("pilot:configure")) && <span className="nav-label nav-section">System</span>}{session?.capabilities.includes("pilot:configure") && <button className={view === "setup" ? "active" : ""} onClick={() => { setView("setup"); setSelectedId(null); }}><Icon name="setup"/>Ersteinrichtung</button>}{session?.capabilities.includes("integration:operate") && <button className={view === "integrations" ? "active" : ""} onClick={() => { setView("integrations"); setSelectedId(null); }}><Icon name="plug"/>Integrationen</button>}</nav><div className="sidebar-bottom"><div className="env"><span className="pulse" />Lokale Entwicklungsumgebung</div><div className="profile"><div className="avatar">MK</div><div><strong>Mara Klein</strong><span>Operations · Editor</span></div><button>···</button></div></div></aside>
    <div className="main-area">
      {view === "setup" && !selectedId ? <PilotOnboarding/> : view === "integrations" && !selectedId ? <IntegrationOperations/> : !selectedId && <><header className="topbar"><div><span className="eyebrow">Operational Workspace</span><h1>{views.find(v => v.id === view)?.label}</h1></div>{isTestIngressEnabled() && <button className="primary" onClick={() => setShowIngress(true)}><Icon name="plus" />Event einspeisen</button>}</header>
      <div className="list-toolbar"><div className="signal"><Icon name="signal" /><span><strong>Attention first</strong> · Überfällig, unzugewiesen, dann neueste Aktivität</span></div><button className="refresh" onClick={() => void loadCases()}>↻ Aktualisieren</button></div>
      <main className="cases-list">{error && <div className="error-banner">{error}</div>}{loading ? <div className="loading"><span /><span /><span /></div> : cases.length === 0 ? <EmptyState view={view} onCreate={() => setShowIngress(true)} /> : cases.map(item => <button className="case-row" key={item.id} onClick={() => setSelectedId(item.id)}><div className={`channel channel-${item.channel}`}>{item.channel === "whatsapp" ? "W" : item.channel === "email" ? "@" : "↗"}</div><div className="case-copy"><div className="case-line"><strong>{item.subject}</strong><span>{formatRelative(item.updated_at)}</span></div><div className="party">{item.party_name}</div><p>{item.preview}</p><div className="row-meta"><StatusPill status={item.status}/><span className={item.owner_name ? "" : "unassigned"}><Icon name="user" />{item.owner_name ?? "Nicht zugewiesen"}</span>{item.next_due_at && <span className={new Date(item.next_due_at) < new Date() ? "overdue" : ""}><Icon name="clock" />{new Date(item.next_due_at) < new Date() ? "Überfällig" : formatRelative(item.next_due_at)}</span>}</div></div><Icon name="arrow" /></button>)}</main></>}
      {selectedId && detail && session && <CaseDetailPanel item={detail} actors={actors} session={session} onRefresh={loadDetail} onClose={() => setSelectedId(null)} />}
    </div>
    {showIngress && <IngressDialog onClose={() => setShowIngress(false)} onCreated={id => { setShowIngress(false); setSelectedId(id); void loadCases(); }} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
