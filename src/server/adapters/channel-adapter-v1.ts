import type { z } from "zod";
import { ingressSchema } from "../domain.js";

export type CanonicalIngressV1 = z.infer<typeof ingressSchema>;

export type AdapterContext = {
  tenantId: string;
  connectorId: string;
  receivedAt: string;
  correlationId: string;
};

export interface ChannelAdapterV1<ProviderPayload = unknown> {
  readonly contractVersion: "1";
  readonly provider: string;
  verify(payload: ProviderPayload, headers: Readonly<Record<string, string | undefined>>): Promise<void>;
  normalize(payload: ProviderPayload, context: AdapterContext): Promise<CanonicalIngressV1>;
  idempotencyKey(payload: ProviderPayload): string;
}

export function validateCanonicalIngress(value: unknown): CanonicalIngressV1 {
  return ingressSchema.parse(value);
}
