import type pg from "pg";

/** Agent, ingest key, deny policy, DID — on an existing org (local pilot / demos). */
export async function applyPilotDemoData(
  client: pg.Pool | pg.PoolClient,
  organizationId: string,
  organizationSlug: string,
): Promise<void> {
  const verifyPath = `/v1/public/orgs/${organizationSlug}/verify`;

  await client.query(
    `INSERT INTO agent (agent_id, organization_id, did, slug, display_name)
     VALUES ('agent-dev-01', $1, 'did:salanor:dev:agent-01', 'default', 'Pilot Demo Agent')
     ON CONFLICT (agent_id) DO NOTHING`,
    [organizationId],
  );

  await client.query(
    `INSERT INTO signing_key (key_id, agent_id, organization_id, kms_provider, public_key_b64, valid_from)
     VALUES (
       'key-dev-01', 'agent-dev-01', $1, 'dev',
       'y6Sn2Ycs7D9VcOXv2DR/7LhlAEizACShh3qCd6YJLPI=', now()
     )
     ON CONFLICT (key_id) DO UPDATE SET
       public_key_b64 = EXCLUDED.public_key_b64,
       kms_provider = EXCLUDED.kms_provider,
       revoked = false,
       valid_from = EXCLUDED.valid_from`,
    [organizationId],
  );

  await client.query(
    `INSERT INTO ingest_api_key (key_id, organization_id, name, key_prefix, key_hash, active)
     VALUES (
       '33333333-3333-4333-8333-333333333333', $1, 'Pilot Ingest', 'aegis_de',
       '91541ff8493afcf1677b9db3283da9e93d9e47e517e3fa9b9f64bab1dfd559a8', true
     )
     ON CONFLICT (key_id) DO UPDATE SET
       key_hash = EXCLUDED.key_hash,
       key_prefix = EXCLUDED.key_prefix,
       active = EXCLUDED.active,
       revoked_at = NULL`,
    [organizationId],
  );

  await client.query(
    `INSERT INTO policy (policy_id, organization_id, name, version, status, activated_at)
     VALUES ('pol_dev_default', $1, 'Default', 1, 'active', now())
     ON CONFLICT (policy_id) DO UPDATE SET status = 'active', activated_at = EXCLUDED.activated_at`,
    [organizationId],
  );

  await client.query(
    `INSERT INTO policy_rule (rule_id, policy_id, tool_pattern, decision, priority)
     VALUES ('rule_deny_stripe_pi', 'pol_dev_default', 'stripe.paymentIntents.create', 'deny', 100)
     ON CONFLICT (rule_id) DO UPDATE SET
       tool_pattern = EXCLUDED.tool_pattern,
       decision = EXCLUDED.decision,
       priority = EXCLUDED.priority`,
  );

  await client.query(
    `UPDATE agent SET default_policy_id = 'pol_dev_default' WHERE agent_id = 'agent-dev-01'`,
  );

  await client.query(
    `INSERT INTO did_document (agent_id, organization_id, document_json)
     SELECT 'agent-dev-01', $1, $2::jsonb
     WHERE NOT EXISTS (SELECT 1 FROM did_document d WHERE d.agent_id = 'agent-dev-01')`,
    [
      organizationId,
      JSON.stringify({
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: "did:salanor:dev:agent-01",
        controller: "did:salanor:dev:agent-01",
        alsoKnownAs: ["agent-dev-01"],
        verificationMethod: [
          {
            id: "did:salanor:dev:agent-01#key-1",
            type: "Ed25519VerificationKey2020",
            controller: "did:salanor:dev:agent-01",
            publicKeyBase64: "y6Sn2Ycs7D9VcOXv2DR/7LhlAEizACShh3qCd6YJLPI=",
          },
        ],
        authentication: ["did:salanor:dev:agent-01#key-1"],
        assertionMethod: ["did:salanor:dev:agent-01#key-1"],
        service: [
          {
            id: "did:salanor:dev:agent-01#aegis",
            type: "AegisWitness",
            serviceEndpoint: verifyPath,
          },
        ],
      }),
    ],
  );

  await client.query(
    `INSERT INTO siem_destination (dest_id, organization_id, provider, otel_endpoint, status)
     SELECT 'siem_dev_datadog', $1, 'datadog', 'http://127.0.0.1:9999/v1/logs', 'paused'
     WHERE NOT EXISTS (SELECT 1 FROM siem_destination s WHERE s.dest_id = 'siem_dev_datadog')`,
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
