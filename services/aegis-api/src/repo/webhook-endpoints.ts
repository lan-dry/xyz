import { randomBytes, randomUUID } from "node:crypto";
import type pg from "pg";
import {
  decryptBridgePrivateKey,
  encryptBridgePrivateKey,
  isBridgeMasterKeyConfigured,
} from "../crypto/bridge-key-vault.js";
import { isWebhookEventType, type WebhookEventType } from "../webhooks/catalog.js";

export type WebhookEndpointRow = {
  endpoint_id: string;
  organization_id: string;
  url: string;
  secret_hash: string;
  events_filter: unknown;
  active: boolean;
  created_at: Date;
};

export function generateWebhookSigningSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function storeWebhookSecret(rawSecret: string): string {
  if (!isBridgeMasterKeyConfigured()) {
    throw new Error(
      "AEGIS_BRIDGE_MASTER_KEY is required to store webhook signing secrets.",
    );
  }
  return encryptBridgePrivateKey(rawSecret);
}

export function loadWebhookSecret(stored: string): string | null {
  if (stored.startsWith("v1.")) {
    try {
      return decryptBridgePrivateKey(stored);
    } catch {
      return null;
    }
  }
  return null;
}

export async function listWebhookEndpoints(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
): Promise<WebhookEndpointRow[]> {
  const result = await client.query<WebhookEndpointRow>(
    `SELECT endpoint_id, organization_id, url, secret_hash, events_filter, active, created_at
     FROM webhook_endpoint
     WHERE organization_id = $1
     ORDER BY created_at DESC`,
    [organizationId],
  );
  return result.rows;
}

export async function createWebhookEndpoint(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    url: string;
    events?: WebhookEventType[];
  },
): Promise<{ row: WebhookEndpointRow; signingSecret: string }> {
  const url = input.url.trim();
  if (!url.startsWith("https://") && !url.startsWith("http://127.0.0.1")) {
    throw new Error("Webhook URL must use HTTPS (http://127.0.0.1 allowed for local testing).");
  }
  const events =
    input.events?.filter((e) => isWebhookEventType(e)) ?? null;
  const signingSecret = generateWebhookSigningSecret();
  const secretStored = storeWebhookSecret(signingSecret);
  const endpointId = randomUUID();
  const result = await client.query<WebhookEndpointRow>(
    `INSERT INTO webhook_endpoint (endpoint_id, organization_id, url, secret_hash, events_filter, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING endpoint_id, organization_id, url, secret_hash, events_filter, active, created_at`,
    [
      endpointId,
      input.organizationId,
      url,
      secretStored,
      events && events.length > 0 ? events : null,
    ],
  );
  return { row: result.rows[0]!, signingSecret };
}

export async function setWebhookEndpointActive(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  endpointId: string,
  active: boolean,
): Promise<WebhookEndpointRow | null> {
  const result = await client.query<WebhookEndpointRow>(
    `UPDATE webhook_endpoint SET active = $3
     WHERE organization_id = $1 AND endpoint_id = $2
     RETURNING endpoint_id, organization_id, url, secret_hash, events_filter, active, created_at`,
    [organizationId, endpointId, active],
  );
  return result.rows[0] ?? null;
}
