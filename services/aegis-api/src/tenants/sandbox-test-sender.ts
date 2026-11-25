/**
 * Sandbox-only test sender. Signs with a platform-held source key (never returned)
 * and ingests through the same envelope path as POST /v1/aegis/source-events.
 */
import { randomUUID } from "node:crypto";
import {
  buildEnvelope,
  generateKeyPair,
  keyPairFromSeed,
  signEnvelope,
} from "@salanor/aegis-sdk";
import type pg from "pg";
import { handleBankEvent } from "../bank/handle-event.js";
import type { BankDecisionResponse } from "../bank/types.js";
import {
  decryptBridgePrivateKey,
  encryptBridgePrivateKey,
  isBridgeMasterKeyConfigured,
} from "../crypto/bridge-key-vault.js";
import { SOURCE_SIGNED_GRADE } from "../sources/grade.js";
import { getSource, registerSource, RegistryError } from "../sources/registry.js";
import { verifyAndAcceptEnvelope } from "../sources/verify-and-accept.js";
import { rejectNonSyntheticPayload } from "./synthetic-guard.js";
import { markOnboardingStep } from "./onboarding-checklist.js";
import { ensureSandboxSigningAgent } from "./sandbox-signing.js";

export const SANDBOX_TEST_SOURCE_ID = "src_sandbox_console";
export const SANDBOX_TEST_KEY_ID = "k_sandbox_console";

export const SANDBOX_TEST_SCENARIOS = [
  "routine",
  "held",
  "override",
  "altered_payment",
  "split_payment",
] as const;

export type SandboxTestScenario = (typeof SANDBOX_TEST_SCENARIOS)[number];

export class SandboxTestSenderError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SandboxTestSenderError";
  }
}

type BusinessEvent = Record<string, unknown>;

/** Synthetic events for the five console scenarios. Safe for the sandbox guard. */
export function buildSandboxTestEvent(scenario: string): {
  scenario: SandboxTestScenario;
  event: BusinessEvent;
} {
  const id = scenario.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const known = SANDBOX_TEST_SCENARIOS.find((s) => s === id);
  if (!known) {
    throw new SandboxTestSenderError(
      422,
      "unknown_scenario",
      `Unknown scenario. Use one of: ${SANDBOX_TEST_SCENARIOS.join(", ")}.`,
    );
  }
  const idempotency_key = randomUUID();
  const case_id = `SBX-${known.slice(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const trace_id = `tr_sbx_${known}_${Date.now().toString(36)}`;
  const common = {
    currency: "RWF",
    beneficiary_account: "ACCT-DEMO-001",
    applicant_name: "Sandbox Applicant",
    requester_email: "officer@demo.test",
    requester_role: "credit_officer",
  };
  let event_type = "loan_decision";
  let product = "retail_loan";
  let attributes: Record<string, unknown> = { ...common, amount: 1_200_000, product };
  if (known === "held") {
    attributes = { ...common, amount: 18_000_000, product };
  } else if (known === "override") {
    event_type = "payment_transfer";
    product = "payment_transfer";
    attributes = {
      ...common,
      product,
      amount: 2_500_000,
      requested_override: true,
      original_outcome: "hold",
      override_reason: "Synthetic manager override for a held payment",
    };
  } else if (known === "altered_payment") {
    event_type = "payment_transfer";
    product = "payment_transfer";
    attributes = {
      ...common,
      product,
      amount: 900_000,
      original_amount: 1_200_000,
      payment_altered: true,
      alteration: "amount_changed",
    };
  } else if (known === "split_payment") {
    event_type = "payment_transfer";
    product = "payment_transfer";
    attributes = {
      ...common,
      product,
      amount: 2_400_000,
      split_payment: true,
      splits: [
        { beneficiary_account: "ACCT-DEMO-001", amount: 1_400_000 },
        { beneficiary_account: "ACCT-DEMO-002", amount: 1_000_000 },
      ],
    };
  }
  return {
    scenario: known,
    event: {
      schema_version: 1,
      case_id,
      idempotency_key,
      event_type,
      product,
      emitted_at: new Date().toISOString(),
      actor: { type: "system", id: "sandbox-test-sender" },
      attributes,
      trace_id,
    },
  };
}

async function ensureSandboxSource(
  client: pg.PoolClient,
  organizationId: string,
): Promise<{ privateKeyB64: string; nextSeq: number }> {
  if (!isBridgeMasterKeyConfigured()) {
    throw new SandboxTestSenderError(
      503,
      "signing_key_unavailable",
      "AEGIS_BRIDGE_MASTER_KEY is not configured, so the sandbox cannot hold a signing key.",
    );
  }
  const stored = await client.query<{ sandbox_source_secret: string | null }>(
    `SELECT sandbox_source_secret FROM organization WHERE organization_id = $1`,
    [organizationId],
  );
  let privateKeyB64 = stored.rows[0]?.sandbox_source_secret
    ? decryptBridgePrivateKey(stored.rows[0].sandbox_source_secret)
    : null;
  let publicKeyB64: string;
  if (!privateKeyB64) {
    const pair = await generateKeyPair();
    privateKeyB64 = pair.privateKeyB64;
    publicKeyB64 = pair.publicKeyB64;
    await client.query(
      `UPDATE organization SET sandbox_source_secret = $2 WHERE organization_id = $1`,
      [organizationId, encryptBridgePrivateKey(privateKeyB64)],
    );
  } else {
    publicKeyB64 = (await keyPairFromSeed(privateKeyB64)).publicKeyB64;
  }

  let source = await getSource(client, organizationId, SANDBOX_TEST_SOURCE_ID);
  if (!source) {
    try {
      await registerSource(client, {
        organization_id: organizationId,
        source_id: SANDBOX_TEST_SOURCE_ID,
        name: "Sandbox test sender",
        kind: "application",
        key_id: SANDBOX_TEST_KEY_ID,
        public_key_b64: publicKeyB64,
        actor: "sandbox-test-sender",
      });
    } catch (err) {
      if (!(err instanceof RegistryError) || err.code !== "conflict") throw err;
    }
    source = await getSource(client, organizationId, SANDBOX_TEST_SOURCE_ID);
  }
  if (!source) {
    throw new SandboxTestSenderError(
      500,
      "source_unavailable",
      "Could not register the sandbox test source.",
    );
  }
  return { privateKeyB64, nextSeq: source.last_seq + 1 };
}

export async function deliverSandboxTestEvent(
  client: pg.PoolClient,
  organizationId: string,
  scenario: string,
): Promise<{
  scenario: string;
  event: BusinessEvent;
  trace_id: string;
  decision: BankDecisionResponse & { source_signed: true; evidence_grade: "G1" };
}> {
  const built = buildSandboxTestEvent(scenario);
  const event = built.event;
  const syn = rejectNonSyntheticPayload(event);
  if (syn) {
    throw new SandboxTestSenderError(422, syn.code, syn.message);
  }
  await ensureSandboxSigningAgent(client, organizationId);
  const { privateKeyB64, nextSeq } = await ensureSandboxSource(client, organizationId);
  let seq = nextSeq;
  let lastError: SandboxTestSenderError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const unsigned = buildEnvelope({
      source_id: SANDBOX_TEST_SOURCE_ID,
      key_id: SANDBOX_TEST_KEY_ID,
      seq,
      event: event as never,
      idempotency_key: String(event.idempotency_key),
    });
    const signed = await signEnvelope(unsigned, privateKeyB64);
    const result = await verifyAndAcceptEnvelope<
      BankDecisionResponse & { source_signed: true; evidence_grade: "G1" }
    >(client, organizationId, signed, {
      process: async ({ envelope, key, source }) => {
        const { parseBankEvent } = await import("../bank/validate.js");
        const parsed = parseBankEvent(envelope.event);
        const decision = await handleBankEvent(client, organizationId, parsed, {
          sourceEnvelope: {
            envelope,
            source_id: envelope.source_id,
            source_key_id: key.key_id,
            source_name: source.name,
          },
        });
        return {
          ...decision,
          source_signed: true as const,
          evidence_grade: SOURCE_SIGNED_GRADE,
        };
      },
    });
    if (result.ok) {
      await markOnboardingStep(client, organizationId, "send_first_event");
      return {
        scenario: built.scenario,
        event,
        trace_id: String(event.trace_id),
        decision: result.response,
      };
    }
    lastError = new SandboxTestSenderError(result.status, result.code, result.message);
    if (result.code !== "seq_replay") break;
    const again = await getSource(client, organizationId, SANDBOX_TEST_SOURCE_ID);
    seq = (again?.last_seq ?? seq) + 1;
  }
  throw lastError ?? new SandboxTestSenderError(500, "send_failed", "Test event was not accepted.");
}
