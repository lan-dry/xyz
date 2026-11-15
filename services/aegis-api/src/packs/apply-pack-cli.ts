/**
 * Apply a demo policy pack (roles, matrix, field policies, rules, workflow) to an org.
 * Usage:
 *   pnpm --filter aegis-api pack:apply -- --pack banking --org <uuid>
 *   pnpm --filter aegis-api pack:apply -- --pack banking --org <uuid> --seed-approvers
 * (--seed-approvers is implied when AEGIS_DEMO_MODE=true and process is non-production)
 */
import { randomUUID } from "node:crypto";
import "../db/load-env.js";
import { seedAuthorityFromPack } from "../bank/repo.js";
import { policyContentHash } from "../bank/policy-hash.js";
import { isDemoModeAllowed } from "../bank/demo-clock.js";
import { seedDemoApprovalActors } from "../demo/seed-approval-actors.js";
import { getPool } from "../db/pool.js";
import { loadDemoPack, packMatrixRows, packRoles } from "./load.js";

async function main() {
  const args = process.argv.slice(2);
  const packIdx = args.indexOf("--pack");
  const orgIdx = args.indexOf("--org");
  const seedActors = args.includes("--seed-approvers") || isDemoModeAllowed();
  const packName = (packIdx >= 0 ? args[packIdx + 1] : "banking") as
    | "banking"
    | "insurance";
  const orgId = orgIdx >= 0 ? args[orgIdx + 1] : process.env.AEGIS_ORGANIZATION_ID;
  if (!orgId) {
    console.error("Provide --org <organization_uuid>");
    process.exit(1);
  }
  if (packName !== "banking" && packName !== "insurance") {
    console.error("--pack must be banking or insurance (demo packs)");
    process.exit(1);
  }
  const pack = loadDemoPack(packName);
  if (!pack.demo_only) {
    console.error("Refusing to apply non-demo pack via this CLI");
    process.exit(1);
  }
  console.log(`Applying demo pack ${pack.id} to org ${orgId} (demo_only=true)`);
  const client = await getPool().connect();
  try {
    const keys = await client.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM signing_key
       WHERE organization_id = $1 AND COALESCE(revoked, false) = false`,
      [orgId],
    );
    const keyCount = Number(keys.rows[0]?.n ?? 0);
    const receiptKey = Boolean(
      process.env.AEGIS_RECEIPT_SIGNING_KEY_B64?.trim() ||
        process.env.DEV_SIGNING_PRIVATE_KEY_B64?.trim(),
    );
    if (keyCount === 0) {
      console.error(
        "ERROR: No active agent signing_key for this org. APS seals will be provisional. " +
          "Run db:local:pilot-fixture or create a signing key before a pilot demo.",
      );
      if (process.env.AEGIS_PACK_REQUIRE_SIGNING_KEY === "true") {
        process.exit(1);
      }
    } else {
      console.log(`Signing keys present: ${keyCount}`);
    }
    if (!receiptKey) {
      console.warn(
        "WARN: AEGIS_RECEIPT_SIGNING_KEY_B64 not set — forensic receipts will not be issued.",
      );
    }

    await client.query("BEGIN");
    await seedAuthorityFromPack(
      client,
      orgId,
      packRoles(pack),
      packMatrixRows(pack),
    );

    for (const fp of pack.field_policies) {
      await client.query(
        `INSERT INTO field_policy (
           organization_id, field_path, mode, mask_keep_last
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, field_path) DO UPDATE SET
           mode = EXCLUDED.mode,
           mask_keep_last = EXCLUDED.mask_keep_last`,
        [orgId, fp.field_path, fp.mode, fp.mask_keep_last ?? null],
      );
    }

    // Deactivate other active policies so pack rules are primary.
    await client.query(
      `UPDATE policy SET status = 'archived'
       WHERE organization_id = $1 AND status = 'active'`,
      [orgId],
    );

    const policyId = `pol_pack_${pack.id.replace(/\W/g, "_")}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const contentHash = policyContentHash({
      policy_id: policyId,
      name: pack.name,
      version: pack.version,
      combine: pack.combine,
      rules: pack.rules.map((r) => ({
        rule_id: r.rule_id,
        tool_pattern: r.tool_pattern,
        decision: r.decision,
        priority: r.priority,
        conditions: r.conditions ?? null,
      })),
    });

    await client.query(
      `INSERT INTO policy (
         policy_id, organization_id, name, version, status, combine, content_hash, activated_at
       ) VALUES ($1, $2, $3, $4, 'active', $5, $6, now())`,
      [policyId, orgId, pack.name, pack.version, pack.combine, contentHash],
    );

    for (const rule of pack.rules) {
      const conditions = {
        ...(rule.conditions ?? {}),
        ...(rule.obligations ? { obligations: rule.obligations } : {}),
      };
      const ruleId = `${policyId}_${rule.rule_id}`.slice(0, 64);
      await client.query(
        `INSERT INTO policy_rule (
           rule_id, policy_id, tool_pattern, decision, priority, conditions
         ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          ruleId,
          policyId,
          rule.tool_pattern,
          rule.decision,
          rule.priority,
          Object.keys(conditions).length > 0 ? JSON.stringify(conditions) : null,
        ],
      );
    }

    for (const wf of pack.workflows) {
      const workflowId = `wf_${pack.id.replace(/\W/g, "_")}_${wf.product}`;
      await client.query(
        `INSERT INTO governed_workflow (
           workflow_id, organization_id, name, description, record_only
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (workflow_id) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           record_only = EXCLUDED.record_only`,
        [
          workflowId,
          orgId,
          wf.name,
          `pack:${pack.id} product=${wf.product} on_unreachable=${wf.on_unreachable ?? "hold"}`,
          Boolean(wf.record_only),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Done. Active policy ${policyId} combine=${pack.combine}`);

    if (seedActors) {
      if (!isDemoModeAllowed()) {
        console.warn(
          "Skipping demo approver seed (need AEGIS_DEMO_MODE=true, non-production process)",
        );
      } else {
        const seeded = await seedDemoApprovalActors(client, orgId);
        console.log(
          `Seeded demo approvers (${seeded.emails.join(", ")}); password from AEGIS_DEMO_APPROVAL_PASSWORD only`,
        );
      }
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
