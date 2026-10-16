import { getTenantSettings } from "../tenant/settings.js";
import { dispatchSiemWebhook } from "./siem-dispatch.js";

type CacheEntry = {
  expiresAt: number;
  stream: boolean;
  compliance: Awaited<
    ReturnType<typeof getTenantSettings>
  >["compliance"];
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

async function shouldStreamForTenant(tenantId: string): Promise<{
  stream: boolean;
  compliance: CacheEntry["compliance"];
}> {
  const hit = cache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) {
    return { stream: hit.stream, compliance: hit.compliance };
  }
  const settings = await getTenantSettings(tenantId);
  const stream = settings.compliance.siemStreamAuditEvents === true;
  cache.set(tenantId, {
    stream,
    compliance: settings.compliance,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return { stream, compliance: settings.compliance };
}

export function invalidateSiemSettingsCache(tenantId: string): void {
  cache.delete(tenantId);
}

/** Fire-and-forget SIEM fan-out for individual audit events. */
export function streamAuditEventToSiem(input: {
  tenantId: string;
  eventType: string;
  metadata: Record<string, unknown>;
  userId?: string;
  threadId?: string;
}): void {
  void (async () => {
    const { stream, compliance } = await shouldStreamForTenant(input.tenantId);
    if (!stream || !compliance.siemWebhookUrl) {
      return;
    }
    await dispatchSiemWebhook(compliance, {
      type: "audit.event",
      tenantId: input.tenantId,
      eventType: input.eventType,
      userId: input.userId ?? null,
      threadId: input.threadId ?? null,
      metadata: input.metadata,
    });
  })().catch((err) => {
    console.error("[stoa-api] SIEM audit stream failed", err);
  });
}
