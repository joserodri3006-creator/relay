import { UserManager, WebStorageStateStore } from "oidc-client-ts";

type Problem = { title?: string };
type AuthConfig = ({ mode: "demo" } | { mode: "oidc"; authority: string; clientId: string; scope: string; redirectUri: string; postLogoutRedirectUri: string }) & { testIngressEnabled: boolean };

let accessToken = ""; let testIngressEnabled = false;
const authReady = (async () => {
  const config = await fetch("/api/auth/config", { headers: { Accept: "application/json" } }).then(response => response.json()) as AuthConfig;
  testIngressEnabled = config.testIngressEnabled;
  if (config.mode === "demo") { accessToken = "demo-editor"; return; }
  const manager = new UserManager({ authority: config.authority, client_id: config.clientId, redirect_uri: config.redirectUri, post_logout_redirect_uri: config.postLogoutRedirectUri, response_type: "code", scope: config.scope, userStore: new WebStorageStateStore({ store: window.sessionStorage }) });
  if (window.location.pathname === "/auth/callback") {
    const user = await manager.signinRedirectCallback(); accessToken = user.access_token; window.history.replaceState({}, "", "/"); return;
  }
  const user = await manager.getUser();
  if (!user || user.expired) { await manager.signinRedirect(); return new Promise<void>(() => undefined); }
  accessToken = user.access_token;
})();

export const isTestIngressEnabled = () => testIngressEnabled;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  await authReady;
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Problem;
    throw new Error(body.title || "Die Anfrage konnte nicht verarbeitet werden.");
  }
  return response.json() as Promise<T>;
}
