import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyEnvelope } from "@salanor/aegis-sdk";
import {
  generateDemoBureauKeys,
  signCreditScoreResponse,
} from "../sign.mjs";

test("bureau signs a credit score envelope verifiable with its public key", async () => {
  const keys = await generateDemoBureauKeys();
  const envelope = await signCreditScoreResponse({
    credit_score: 612,
    subject_id: "LN-TEST",
    private_key_b64: keys.private_key_b64,
    source_id: keys.source_id,
    key_id: keys.key_id,
  });
  const result = await verifyEnvelope(envelope, keys.public_key_b64);
  assert.equal(result.ok, true);
  assert.equal(envelope.event.fields.credit_score, 612);
});
