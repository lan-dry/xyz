/**
 * Sign a Demo Credit Bureau response as an AEGIS-SRC1 envelope.
 * LOS forwards the envelope inside governed event attributes.third_party_facts.
 */
import {
  buildEnvelope,
  generateKeyPair,
  signEnvelope,
} from "@salanor/aegis-sdk";

export const DEMO_BUREAU_SOURCE_ID = "src_demo_bureau";
export const DEMO_BUREAU_KEY_ID = "k_bureau_demo_2026";
export const DEMO_BUREAU_NAME = "Demo Credit Bureau";

/** In-memory demo keypair (tests / local stub). Call generateDemoBureauKeys() for a fresh pair. */
let cached = null;

export async function generateDemoBureauKeys() {
  const kp = await generateKeyPair();
  return {
    source_id: DEMO_BUREAU_SOURCE_ID,
    key_id: DEMO_BUREAU_KEY_ID,
    name: DEMO_BUREAU_NAME,
    public_key_b64: kp.publicKeyB64,
    private_key_b64: kp.privateKeyB64, // standard base64 for Aegis registry
  };
}

export async function getOrCreateDemoBureauKeys() {
  if (!cached) cached = await generateDemoBureauKeys();
  return cached;
}

/**
 * @param {{ credit_score: number, subject_id?: string, seq?: number, private_key_b64?: string, source_id?: string, key_id?: string }} input
 */
export async function signCreditScoreResponse(input) {
  const keys = input.private_key_b64
    ? {
        source_id: input.source_id ?? DEMO_BUREAU_SOURCE_ID,
        key_id: input.key_id ?? DEMO_BUREAU_KEY_ID,
        private_key_b64: input.private_key_b64,
      }
    : await getOrCreateDemoBureauKeys();

  const event = {
    type: "credit_bureau.response",
    fields: { credit_score: input.credit_score },
    ...(input.subject_id ? { subject_id: input.subject_id } : {}),
  };
  const unsigned = buildEnvelope({
    source_id: keys.source_id,
    key_id: keys.key_id,
    seq: input.seq ?? 1,
    event,
  });
  return signEnvelope(unsigned, keys.private_key_b64);
}
