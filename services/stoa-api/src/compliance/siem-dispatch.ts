import { createHmac } from "node:crypto";
import type { TenantComplianceSettings } from "../tenant/settings.js";

export async function dispatchSiemWebhook(
  compliance: TenantComplianceSettings,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const url = compliance.siemWebhookUrl?.trim();
  if (!url) {
    return { ok: false, error: "SIEM webhook URL not configured" };
  }
  const body = JSON.stringify({
    ...payload,
    emittedAt: new Date().toISOString(),
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Stoa-Compliance/1",
  };
  const secret = compliance.siemWebhookSecret?.trim();
  if (secret) {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    headers["X-Stoa-Signature"] = `sha256=${sig}`;
  }
  try {
    const res = await fetch(url, { method: "POST", headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: text || `Webhook returned ${res.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
