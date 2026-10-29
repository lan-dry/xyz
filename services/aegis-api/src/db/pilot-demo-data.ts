import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import type pg from "pg";

/** Default local pilot org (Claude / investor demo universe). */
export const DEFAULT_PILOT_ORG_SLUG = "northwind-payments";
export const DEFAULT_PILOT_ORG_NAME = "Northwind Payments";

export const PILOT_AGENT_ID = "agent-refund-operations";
export const PILOT_KEY_ID = "key-refund-operations";
export const PILOT_AGENT_DID = "did:salanor:pilot:refund-operations";

export const PILOT_PAYOUT_AGENT_ID = "agent-payout-operations";
export const PILOT_PAYOUT_KEY_ID = "key-payout-operations";
export const PILOT_PAYOUT_AGENT_DID = "did:salanor:pilot:payout-operations";

export const PILOT_KYC_AGENT_ID = "agent-kyc-operations";
export const PILOT_KYC_KEY_ID = "key-kyc-operations";
export const PILOT_KYC_AGENT_DID = "did:salanor:pilot:kyc-operations";

export const PILOT_POLICY_ID = "pol-contextual-refunds";
export const PILOT_PAYOUT_POLICY_ID = "pol-payouts-v14";
export const PILOT_KYC_POLICY_ID = "pol-kyc-screening";
/** Claude §13.1 — destination must match customer on file. */
export const PILOT_BENMATCH_POLICY_ID = "pol-beneficiary-match";

export const DEFAULT_PILOT_INGEST_KEY = "aegis_dev_local_change_me";
/** Matches `.env.example` DEV_SIGNING_PRIVATE_KEY_B64 when env is unset. */
export const DEFAULT_PILOT_SIGNING_PRIVATE_KEY_B64 =
  "mqUA8ONIg7SN0gL8luCakqehaIzp8Lys6ZHMjAoBx/M=";

function pilotIngestKeyMaterial(): { rawKey: string; prefix: string; keyHash: string } {
  const rawKey =
    process.env.AEGIS_INGEST_DEV_KEY?.trim() ||
    process.env.AEGIS_INGEST_API_KEY?.trim() ||
    DEFAULT_PILOT_INGEST_KEY;
  return {
    rawKey,
    prefix: rawKey.slice(0, 8),
    keyHash: createHash("sha256").update(rawKey, "utf8").digest("hex"),
  };
}

async function pilotSigningPublicKeyB64(): Promise<string> {
  const privateKeyB64 =
    process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim() ||
    process.env.AEGIS_SIGNING_PRIVATE_KEY_B64?.trim() ||
    DEFAULT_PILOT_SIGNING_PRIVATE_KEY_B64;
  const privateKey = Buffer.from(privateKeyB64, "base64");
  if (privateKey.length !== 32) {
    throw new Error(
      `DEV_SIGNING_PRIVATE_KEY_B64 must decode to 32 bytes (got ${privateKey.length}). Use the value from .env.example.`,
    );
  }
  return Buffer.from(await ed.getPublicKeyAsync(privateKey)).toString("base64");
}

async function upsertAgent(
  client: pg.Pool | pg.PoolClient,
  input: {
    organizationId: string;
    agentId: string;
    did: string;
    slug: string;
    displayName: string;
    publicKeyB64: string;
    keyId: string;
    verifyPath: string;
    policyId: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO agent (agent_id, organization_id, did, slug, display_name)
     VALUES ($2, $1, $3, $4, $5)
     ON CONFLICT (agent_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       did = EXCLUDED.did,
       slug = EXCLUDED.slug,
       display_name = EXCLUDED.display_name,
       active = true`,
    [
      input.organizationId,
      input.agentId,
      input.did,
      input.slug,
      input.displayName,
    ],
  );

  await client.query(
    `INSERT INTO signing_key (key_id, agent_id, organization_id, kms_provider, public_key_b64, valid_from)
     VALUES ($2, $3, $1, 'dev', $4, now())
     ON CONFLICT (key_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       agent_id = EXCLUDED.agent_id,
       public_key_b64 = EXCLUDED.public_key_b64,
       kms_provider = EXCLUDED.kms_provider,
       revoked = false,
       valid_from = EXCLUDED.valid_from`,
    [input.organizationId, input.keyId, input.agentId, input.publicKeyB64],
  );

  const didDoc = JSON.stringify({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: input.did,
    controller: input.did,
    alsoKnownAs: [input.agentId],
    verificationMethod: [
      {
        id: `${input.did}#key-1`,
        type: "Ed25519VerificationKey2020",
        controller: input.did,
        publicKeyBase64: input.publicKeyB64,
      },
    ],
    authentication: [`${input.did}#key-1`],
    assertionMethod: [`${input.did}#key-1`],
    service: [
      {
        id: `${input.did}#aegis`,
        type: "AegisWitness",
        serviceEndpoint: input.verifyPath,
      },
    ],
  });
  const updated = await client.query(
    `UPDATE did_document
     SET document_json = $3::jsonb
     WHERE agent_id = $2 AND organization_id = $1`,
    [input.organizationId, input.agentId, didDoc],
  );
  if ((updated.rowCount ?? 0) === 0) {
    await client.query(
      `INSERT INTO did_document (agent_id, organization_id, document_json)
       SELECT $2, $1, $3::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM did_document d WHERE d.agent_id = $2 AND d.organization_id = $1
       )`,
      [input.organizationId, input.agentId, didDoc],
    );
  }

  await client.query(
    `UPDATE agent SET default_policy_id = $1 WHERE agent_id = $2 AND organization_id = $3`,
    [input.policyId, input.agentId, input.organizationId],
  );
}

/** Agents, ingest key, policies, DID — on an existing org (local pilot / demos). */
export async function applyPilotDemoData(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  organizationSlug: string,
): Promise<void> {
  const verifyPath = `/v1/public/orgs/${organizationSlug}/verify`;
  const ingest = pilotIngestKeyMaterial();
  const publicKeyB64 = await pilotSigningPublicKeyB64();

  await client.query(
    `INSERT INTO ingest_api_key (key_id, organization_id, name, key_prefix, key_hash, active)
     VALUES (
       '33333333-3333-4333-8333-333333333333', $1, 'Pilot Ingest', $2, $3, true
     )
     ON CONFLICT (key_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       key_hash = EXCLUDED.key_hash,
       key_prefix = EXCLUDED.key_prefix,
       active = EXCLUDED.active,
       revoked_at = NULL`,
    [organizationId, ingest.prefix, ingest.keyHash],
  );

  // Retail refunds: deny autonomous stripe payments above USD 200 for retail consumers.
  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($2, $1, 'Retail refund controls', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       status = 'active',
       activated_at = EXCLUDED.activated_at`,
    [organizationId, PILOT_POLICY_ID],
  );
  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
     VALUES (
       'rule_retail_refund_limit', $1, 'stripe.paymentIntents.create', 'deny', 200,
       '{"rule_type":"max_per_tx","max_amount_usd":200,"when":{"segment":"retail","account_type":"consumer"}}'::jsonb
     )
     ON CONFLICT (rule_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id,
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority,
       conditions = EXCLUDED.conditions`,
    [PILOT_POLICY_ID],
  );

  // Claude §13.1: Stop when refund destination ≠ customer on file (manipulated-agent).
  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($2, $1, 'Beneficiary match (manipulated-agent stop)', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       status = 'active',
       activated_at = EXCLUDED.activated_at`,
    [organizationId, PILOT_BENMATCH_POLICY_ID],
  );
  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
     VALUES (
       'rule_beneficiary_match_refund', $1, 'stripe.paymentIntents.create', 'deny', 950,
       '{"rule_type":"beneficiary_match","layer":"ceiling","on_lookup_fail":"deny"}'::jsonb
     )
     ON CONFLICT (rule_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id,
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority,
       conditions = EXCLUDED.conditions`,
    [PILOT_BENMATCH_POLICY_ID],
  );

  // Payouts v14: pause payouts over USD 1,000 to merchants younger than 30 days.
  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($2, $1, 'Payouts v14', 14, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       version = EXCLUDED.version,
       status = 'active',
       activated_at = EXCLUDED.activated_at`,
    [organizationId, PILOT_PAYOUT_POLICY_ID],
  );
  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
     VALUES (
       'rule_new_merchant_payout_hold', $1, 'payments.payout.create', 'allow_with_obligation', 300,
       '{"rule_type":"max_per_tx","max_amount_usd":1000,"when":{"merchant_age_days_lt":30}}'::jsonb
     )
     ON CONFLICT (rule_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id,
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority,
       conditions = EXCLUDED.conditions`,
    [PILOT_PAYOUT_POLICY_ID],
  );

  // KYC: high-risk approve requires a human.
  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ($2, $1, 'KYC screening', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       name = EXCLUDED.name,
       status = 'active',
       activated_at = EXCLUDED.activated_at`,
    [organizationId, PILOT_KYC_POLICY_ID],
  );
  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority, conditions)
     VALUES (
       'rule_kyc_high_risk_hold', $1, 'kyc.merchant.approve', 'allow_with_obligation', 100,
       '{"rule_type":"tool","when":{"risk_tier":"high"}}'::jsonb
     )
     ON CONFLICT (rule_id) DO UPDATE SET
       policy_id = EXCLUDED.policy_id,
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority,
       conditions = EXCLUDED.conditions`,
    [PILOT_KYC_POLICY_ID],
  );

  await upsertAgent(client, {
    organizationId,
    agentId: PILOT_AGENT_ID,
    did: PILOT_AGENT_DID,
    slug: "refund-operations",
    displayName: "Refund Operations Agent",
    publicKeyB64,
    keyId: PILOT_KEY_ID,
    verifyPath,
    policyId: PILOT_POLICY_ID,
  });
  await upsertAgent(client, {
    organizationId,
    agentId: PILOT_PAYOUT_AGENT_ID,
    did: PILOT_PAYOUT_AGENT_DID,
    slug: "payout-operations",
    displayName: "Payout Operations Agent",
    publicKeyB64,
    keyId: PILOT_PAYOUT_KEY_ID,
    verifyPath,
    policyId: PILOT_PAYOUT_POLICY_ID,
  });
  await upsertAgent(client, {
    organizationId,
    agentId: PILOT_KYC_AGENT_ID,
    did: PILOT_KYC_AGENT_DID,
    slug: "kyc-operations",
    displayName: "KYC Screening Agent",
    publicKeyB64,
    keyId: PILOT_KYC_KEY_ID,
    verifyPath,
    policyId: PILOT_KYC_POLICY_ID,
  });

  await client.query(
    `INSERT INTO siem_destination (dest_id, organization_id, provider, otel_endpoint, status)
     VALUES ('siem_pilot_datadog', $1, 'datadog', 'https://example.invalid/v1/logs', 'paused')
     ON CONFLICT (dest_id) DO UPDATE SET
       organization_id = EXCLUDED.organization_id,
       provider = EXCLUDED.provider,
       otel_endpoint = EXCLUDED.otel_endpoint,
       status = EXCLUDED.status`,
    [organizationId],
  );

  await client.query(
    `UPDATE organization SET
       onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
       active = true,
       updated_at = now()
     WHERE organization_id = $1`,
    [organizationId],
  );
}
