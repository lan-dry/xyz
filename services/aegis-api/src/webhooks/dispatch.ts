import { createHmac, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  endpointAcceptsEvent,
  type WebhookEventType,
} from "./catalog.js";
import {
  listWebhookEndpoints,
  loadWebhookSecret,
} from "../repo/webhook-endpoints.js";

export type WebhookPayload = Record<string, unknown>;

function signBody(secret: string, timestamp: number, rawBody: string): string {
  const signed = `${timestamp}.${rawBody}`;
  return createHmac("sha256", secret).update(signed, "utf8").digest("hex");
}

async function postSignedWebhook(
  url: string,
  secret: string,
  eventType: WebhookEventType,
  payload: WebhookPayload,
): Promise<void> {
  const deliveryId = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: deliveryId,
    type: eventType,
    created_at: new Date(timestamp * 1000).toISOString(),
    data: payload,
  });
  const signature = signBody(secret, timestamp, body);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Aegis-Webhooks/1.0",
      "X-Aegis-Event": eventType,
      "X-Aegis-Delivery-Id": deliveryId,
      "X-Aegis-Timestamp": String(timestamp),
      "X-Aegis-Signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn(
      `[aegis-api] webhook delivery failed (${response.status}) ${url} ${text.slice(0, 200)}`,
    );
  }
}

/**
 * Fire-and-forget signed POST to all matching org webhook endpoints.
 */
export function dispatchOrgWebhookEvent(
  pool: pg.Pool,
  organizationId: string,
  eventType: WebhookEventType,
  payload: WebhookPayload,
): void {
  void (async () => {
    try {
      const endpoints = await listWebhookEndpoints(pool, organizationId);
      for (const endpoint of endpoints) {
        if (!endpoint.active) continue;
        if (!endpointAcceptsEvent(endpoint.events_filter, eventType)) continue;
        const secret = loadWebhookSecret(endpoint.secret_hash);
        if (!secret) {
          console.warn(
            `[aegis-api] skip webhook ${endpoint.endpoint_id}: secret not decryptable (set AEGIS_BRIDGE_MASTER_KEY)`,
          );
          continue;
        }
        await postSignedWebhook(endpoint.url, secret, eventType, payload);
      }
    } catch (err) {
      console.error("[aegis-api] webhook dispatch", err);
    }
  })();
}
