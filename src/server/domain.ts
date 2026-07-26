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
export const pilotSetupSchema = z.object({
  organizationName: z.string().trim().min(2).max(160),
  workflowName: z.string().trim().min(3).max(160),
  primaryChannel: z.enum(["microsoft_365_email", "google_email", "whatsapp", "api"]),
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
}).strict();

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
