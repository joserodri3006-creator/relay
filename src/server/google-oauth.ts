import crypto from "node:crypto";

export const gmailReadOnlyScope = "https://www.googleapis.com/auth/gmail.readonly";
export const googleOAuthScopes = ["openid", "email", gmailReadOnlyScope] as const;

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope: string[];
  tokenType: string;
};

export type GoogleIdentity = {
  subject: string;
  email: string;
  emailVerified: boolean;
};
export type SecretPayload = GoogleTokenSet | { codeVerifier: string };

export interface GoogleOAuthGateway {
  configured: boolean;
  authorizationUrl(input: { state: string; codeChallenge: string; loginHint: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<GoogleTokenSet>;
  identity(accessToken: string): Promise<GoogleIdentity>;
  revoke(accessToken: string): Promise<void>;
}

export interface SecretVault {
  put(reference: string, value: SecretPayload): Promise<void>;
  get(reference: string): Promise<SecretPayload | null>;
  delete(reference: string): Promise<void>;
}

export class InMemorySecretVault implements SecretVault {
  readonly #values = new Map<string, SecretPayload>();
  async put(reference: string, value: SecretPayload) { this.#values.set(reference, structuredClone(value)); }
  async get(reference: string) { return this.#values.has(reference) ? structuredClone(this.#values.get(reference)!) : null; }
  async delete(reference: string) { this.#values.delete(reference); }
}

export class GoogleOAuthHttpGateway implements GoogleOAuthGateway {
  readonly configured: boolean;
  constructor(private readonly config: { clientId?: string; clientSecret?: string; redirectUri?: string }) {
    this.configured = Boolean(config.clientId && config.clientSecret && config.redirectUri);
  }

  authorizationUrl(input: { state: string; codeChallenge: string; loginHint: string }) {
    this.requireConfigured();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: this.config.clientId!,
      redirect_uri: this.config.redirectUri!,
      response_type: "code",
      scope: googleOAuthScopes.join(" "),
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent select_account",
      state: input.state,
      login_hint: input.loginHint,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256"
    }).toString();
    return url.toString();
  }

  async exchangeCode(input: { code: string; codeVerifier: string }) {
    this.requireConfigured();
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code: input.code,
        client_id: this.config.clientId!,
        client_secret: this.config.clientSecret!,
        redirect_uri: this.config.redirectUri!,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier
      }),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("GOOGLE_TOKEN_EXCHANGE_FAILED");
    const value = await response.json() as Record<string, unknown>;
    if (typeof value.access_token !== "string") throw new Error("GOOGLE_TOKEN_RESPONSE_INVALID");
    return {
      accessToken: value.access_token,
      refreshToken: typeof value.refresh_token === "string" ? value.refresh_token : undefined,
      expiresIn: typeof value.expires_in === "number" ? value.expires_in : undefined,
      scope: typeof value.scope === "string" ? value.scope.split(" ").filter(Boolean) : [],
      tokenType: typeof value.token_type === "string" ? value.token_type : "Bearer"
    };
  }

  async identity(accessToken: string) {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("GOOGLE_IDENTITY_LOOKUP_FAILED");
    const value = await response.json() as Record<string, unknown>;
    if (typeof value.sub !== "string" || typeof value.email !== "string") throw new Error("GOOGLE_IDENTITY_INVALID");
    return { subject: value.sub, email: value.email, emailVerified: value.email_verified === true };
  }

  async revoke(accessToken: string) {
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error("GOOGLE_REVOCATION_FAILED");
  }

  private requireConfigured() {
    if (!this.configured) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");
  }
}

export const randomOAuthValue = () => crypto.randomBytes(32).toString("base64url");
export const sha256Base64Url = (value: string) => crypto.createHash("sha256").update(value).digest("base64url");
export const sha256Hex = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
