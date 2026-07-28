import { z } from "zod";

export const statuses = ["open", "waiting_external", "waiting_internal", "resolved", "closed"] as const;
export type CaseStatus = (typeof statuses)[number];

export const ingressSchema = z.object({
  providerEventId: z.string().min(3).max(160),
  connectorId: z.string().min(2).max(80),
  externalThreadId: z.string().min(2).max(160),
  channel: z.enum(["email", "whatsapp", "api", "voice", "other"]),
  direction: z.enum(["inbound", "outbound"]),
  subject: z.string().trim().min(1).max(180).optional(),
  partyName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10000),
  occurredAt: z.string().datetime().optional()
});
export const connectorIngressSchema = ingressSchema.omit({ connectorId: true }).strict();

export const ownerSchema = z.object({ ownerId: z.string().uuid().nullable() });
export const statusSchema = z.object({ status: z.enum(statuses) });
export const commitmentSchema = z.object({
  description: z.string().trim().min(3).max(500),
  assigneeId: z.string().uuid(),
  dueAt: z.string().datetime().nullable().optional(),
  sourceInteractionId: z.string().uuid().nullable().optional()
});
export const commitmentUpdateSchema = z.object({ status: z.enum(["fulfilled", "cancelled"]) });
export const handoffSchema = z.object({
  toActorId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
  nextStep: z.string().trim().min(3).max(500),
  dueAt: z.string().datetime().nullable().optional()
});
export const handoffDecisionSchema = z.object({ decision: z.enum(["accepted", "declined", "cancelled"]) });
export const emailProviderDetectionSchema = z.object({
  domain: z.string().trim().min(3).max(253)
}).strict();
export const pilotChannelAccountSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["email", "instagram", "tiktok"]),
  identifier: z.string().trim().min(2).max(200),
  label: z.string().trim().max(120).optional().default(""),
  providerKey: z.enum(["google", "microsoft", "other"]).optional(),
  mailProductKey: z.enum(["gmail", "google_workspace", "microsoft_365", "other"]).optional(),
  providerName: z.string().trim().min(2).max(120).optional()
}).strict().superRefine((account, context) => {
  if (account.type === "email") {
    if (!z.string().email().safeParse(account.identifier).success) {
      context.addIssue({ code: "custom", path: ["identifier"], message: "Für E-Mail-Kanäle ist eine gültige geschäftliche Adresse erforderlich." });
    }
    if ((account.providerKey === undefined) !== (account.mailProductKey === undefined)) {
      context.addIssue({ code: "custom", path: ["providerKey"], message: "Anbieter und Mailprodukt müssen gemeinsam angegeben werden." });
    }
    if (account.providerKey === "google" && !["gmail", "google_workspace"].includes(account.mailProductKey ?? "")) {
      context.addIssue({ code: "custom", path: ["mailProductKey"], message: "Dieses Mailprodukt gehört nicht zu Google." });
    }
    if (account.providerKey === "microsoft" && account.mailProductKey !== "microsoft_365") {
      context.addIssue({ code: "custom", path: ["mailProductKey"], message: "Dieses Mailprodukt gehört nicht zu Microsoft." });
    }
    if (account.providerKey === "other" && account.mailProductKey !== "other") {
      context.addIssue({ code: "custom", path: ["mailProductKey"], message: "Für andere Anbieter muss das Mailprodukt „other“ sein." });
    }
    if (account.providerKey === "other" && !account.providerName) {
      context.addIssue({ code: "custom", path: ["providerName"], message: "Bitte den konkreten E-Mail-Anbieter angeben." });
    }
    if (account.providerKey !== "other" && account.providerName !== undefined) {
      context.addIssue({ code: "custom", path: ["providerName"], message: "Ein freier Anbietername ist nur bei „Anderer Provider“ zulässig." });
    }
    return;
  }
  if (account.providerKey !== undefined || account.mailProductKey !== undefined || account.providerName !== undefined) {
    context.addIssue({ code: "custom", path: ["providerKey"], message: "Ein E-Mail-Provider ist nur für E-Mail-Accounts zulässig." });
  }
  if (!/^@?[A-Za-z0-9._-]{2,100}$/.test(account.identifier)) {
    context.addIssue({ code: "custom", path: ["identifier"], message: "Social-Kanäle benötigen einen öffentlichen Handle, keine URL." });
  }
});

export const pilotSetupSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  brandName: z.string().trim().min(2).max(160),
  workflowName: z.string().trim().min(3).max(160),
  channelAccounts: z.array(pilotChannelAccountSchema).min(1).max(25),
  selectedChannelAccountId: z.string().uuid(),
  inventoryConfirmed: z.literal(true),
  identityProvider: z.enum(["entra", "google", "okta", "other"]),
  systemOfRecord: z.enum(["salesforce", "hubspot", "zendesk", "dynamics", "custom", "none", "other"]),
  hostingRegion: z.enum(["eu_germany", "eu_ireland", "eu_other"]),
  targetStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  teamNames: z.array(z.string().trim().min(2).max(80)).length(2).refine(names => names[0]?.toLowerCase() !== names[1]?.toLowerCase(), "Die Teams müssen unterschiedlich sein."),
  expectedUsers: z.number().int().min(2).max(50),
  monthlyCases: z.number().int().min(1).max(10000),
  retentionDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
  pilotOwnerName: z.string().trim().min(2).max(120),
  pilotOwnerEmail: z.string().email().max(200),
  technicalContactName: z.string().trim().min(2).max(120),
  technicalContactEmail: z.string().email().max(200),
  accessEnvironment: z.enum(["sandbox", "test_account", "production_approved"]),
  dataExclusionsConfirmed: z.literal(true)
}).strict().superRefine((setup, context) => {
  const identifiers = new Set<string>();
  for (const [index, account] of setup.channelAccounts.entries()) {
    const key = `${account.type}:${account.identifier.trim().toLocaleLowerCase("en-US")}`;
    if (identifiers.has(key)) {
      context.addIssue({ code: "custom", path: ["channelAccounts", index, "identifier"], message: "Dieser Kanal wurde bereits erfasst." });
    }
    identifiers.add(key);
  }
  const selected = setup.channelAccounts.find(account => account.id === setup.selectedChannelAccountId);
  if (!selected) {
    context.addIssue({ code: "custom", path: ["selectedChannelAccountId"], message: "Das gewählte Pilot-Postfach gehört nicht zum Inventar." });
  } else if (selected.type !== "email") {
    context.addIssue({ code: "custom", path: ["selectedChannelAccountId"], message: "Nur ein E-Mail-Postfach kann für diesen Pilot gewählt werden." });
  } else if (!selected.providerKey || !selected.mailProductKey) {
    context.addIssue({ code: "custom", path: ["channelAccounts"], message: "Für das Pilot-Postfach ist der E-Mail-Provider erforderlich." });
  }
});

export type Session = {
  tenantId: string;
  actorId: string;
  role: "editor" | "viewer";
  name: string;
  capabilities: Array<"case:write" | "integration:operate" | "pilot:configure">;
};

export const allowedStatusTransitions: Record<CaseStatus, CaseStatus[]> = {
  open: ["waiting_external", "waiting_internal", "resolved", "closed"],
  waiting_external: ["open", "waiting_internal", "resolved", "closed"],
  waiting_internal: ["open", "waiting_external", "resolved", "closed"],
  resolved: ["open", "closed"],
  closed: ["open"]
};

export function requireTransition(from: CaseStatus, to: CaseStatus) {
  if (from === to) return;
  if (!allowedStatusTransitions[from]?.includes(to)) {
    const error = new Error(`Übergang von ${from} nach ${to} ist nicht erlaubt.`);
    Object.assign(error, { statusCode: 409, code: "INVALID_STATUS_TRANSITION" });
    throw error;
  }
}
