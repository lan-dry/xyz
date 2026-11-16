/**
 * pnpm pilot:provision-demo-tenant
 *
 * Idempotent. Creates (or reuses) the hosted "Demo Bank" tenant through the platform
 * provisioning API, flagged is_demo, then: 4 agents + signing bridge, an ingest key,
 * the banking pack (held loan rules escalate after 2 minutes), and invitations for the
 * six personas and the deputy. Bank roles are assigned once each person is a member
 * (re-run after people accept their invitations).
 *
 * Needs, in your shell (never in the repo):
 *   PLATFORM_BOOTSTRAP_SECRET   the ID service's bootstrap secret
 * and the uncommitted file .demo-tenant-emails.local.json (shape: .example.json).
 *
 * Optional, in your shell: DEMO_BANK_INGEST_KEY (>= 32 chars). When set, the ingest key is NOT
 * minted randomly: this exact secret is stored (hashed) for the tenant, or reused if the same
 * hash is already stored. It therefore stays STABLE across `pnpm demo:fresh`. Never committed.
 *
 * Flags:
 *   --new-ingest-key   revoke the current demo ingest key and mint a new one
 *                      (ignored when DEMO_BANK_INGEST_KEY is set: that secret always wins)
 *   --force-pack       re-apply the banking pack even if it is already active
 *   --skip-invites     only provision the tenant, agents, key and pack
 */
import {
  ConsoleSession,
  HttpError,
  PERSONA_BANK_ROLE,
  PERSONA_KEYS,
  fail,
  findOrganizationId,
  httpJson,
  loadTenantFile,
  orgName,
  orgSlug,
  platformCall,
  type PersonaKey,
  type TenantFile,
} from "./demo-tenant-lib.mts";

const args = new Set(process.argv.slice(2));

const AGENTS = [
  { slug: "credit-decision", name: "Credit decisions" },
  { slug: "payments-gateway", name: "Payments gateway" },
  { slug: "customer-data", name: "Customer data" },
  { slug: "core-banking", name: "Core banking" },
] as const;

const INGEST_KEY_NAME = "demo-bank-simulator";

const isSmokeSlug = (slug: string) => /smoke/i.test(slug);

const log = (msg: string) => console.log(`  ${msg}`);
const step = (n: number, title: string) => console.log(`\n[${n}] ${title}`);

async function ensureOrganization(file: TenantFile): Promise<string> {
  const slug = orgSlug(file);
  const existing = await findOrganizationId(file, slug);
  if (existing) {
    // Idempotent: make sure the flag is set (quiet tag, no plan badge, no Production/Sandbox)
    // and seats cover the six personas + deputy (enterprise).
    await platformCall(file, `/organizations/${existing}`, {
      method: "PATCH",
      body: {
        is_demo: true,
        plan: "enterprise",
        // A smoke-test tenant is also disposable (wipeable): slug must contain "smoke".
        ...(isSmokeSlug(slug) ? { is_test: true } : {}),
      },
    });
    log(`Organisation "${slug}" already exists (is_demo + enterprise seats confirmed).`);
    return existing;
  }
  const admin = file.personas.admin;
  const created = await platformCall<{ organization_id: string }>(file, "/organizations", {
    method: "POST",
    body: {
      name: orgName(file),
      slug,
      admin_email: admin.email.trim(),
      admin_display_name: admin.display_name.trim(),
      admin_password: admin.password,
      // A demo tenant is not on a commercial plan, but needs room for 8 members.
      plan: "enterprise",
      is_demo: true,
      ...(isSmokeSlug(slug) ? { is_test: true } : {}),
    },
  });
  // The default agent's one-time private key is deliberately not printed or stored.
  log(`Created organisation "${slug}" (is_demo${isSmokeSlug(slug) ? ", is_test" : ""}).`);
  return created.data.organization_id;
}

async function ensureAgents(session: ConsoleSession): Promise<Map<string, string>> {
  const listed = await session.call<{
    agents: Array<{ agent_id: string; slug: string; workflow_bridge_enabled?: boolean }>;
  }>("/agents");
  const bySlug = new Map(listed.data.agents.map((a) => [a.slug, a]));
  const ids = new Map<string, string>();
  for (const spec of AGENTS) {
    let agent = bySlug.get(spec.slug);
    if (!agent) {
      const created = await session.call<{ agent: { agent_id: string } }>("/agents", {
        method: "POST",
        body: { display_name: spec.name, slug: spec.slug },
      });
      // Private key is not printed: the signing bridge below holds it server-side.
      agent = { agent_id: created.data.agent.agent_id, slug: spec.slug };
      log(`Created agent ${spec.slug}.`);
    }
    ids.set(spec.slug, agent.agent_id);
    if (!agent.workflow_bridge_enabled) {
      try {
        await session.call(`/agents/${encodeURIComponent(agent.agent_id)}/workflow-bridge`, {
          method: "POST",
          body: {},
          okStatuses: [200, 201],
        });
        log(`Signing bridge on for ${spec.slug}.`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(
          `WARNING: could not enable the signing bridge for ${spec.slug}: ${msg}\n    Set AEGIS_BRIDGE_MASTER_KEY on the API service (see docs/DEPLOY_PRODUCTION.md), then re-run.`,
        );
      }
    } else {
      log(`Agent ${spec.slug} ready.`);
    }
  }
  return ids;
}

/**
 * DEMO_BANK_INGEST_KEY set: store exactly that secret (hashed server-side), never a random one.
 * Same secret again = no change. The secret is never printed.
 */
async function ensureStableIngestKey(
  file: TenantFile,
  organizationId: string,
  secret: string,
): Promise<void> {
  if (secret.length < 32 || /\s/.test(secret)) {
    fail("DEMO_BANK_INGEST_KEY must be at least 32 characters with no whitespace.");
  }
  if (args.has("--new-ingest-key")) {
    log("--new-ingest-key ignored: DEMO_BANK_INGEST_KEY is set and always wins.");
  }
  const res = await platformCall<{ action: "created" | "reused" | "replaced"; key_prefix: string }>(
    file,
    `/organizations/${organizationId}/stable-ingest-key`,
    { method: "PUT", body: { name: INGEST_KEY_NAME, secret } },
  );
  log(
    `Ingest key "${INGEST_KEY_NAME}" ${res.data.action} from DEMO_BANK_INGEST_KEY (prefix ${res.data.key_prefix}). Secret not shown.`,
  );
}

async function ensureIngestKey(session: ConsoleSession): Promise<void> {
  const listed = await session.call<{
    keys: Array<{ key_id: string; name: string; active: boolean; key_prefix: string }>;
  }>("/ingest-keys");
  const current = listed.data.keys.find((k) => k.name === INGEST_KEY_NAME && k.active);
  if (current && !args.has("--new-ingest-key")) {
    log(
      `Ingest key "${INGEST_KEY_NAME}" exists (prefix ${current.key_prefix}). Its secret cannot be shown again;\n    run with --new-ingest-key to mint a replacement.`,
    );
    return;
  }
  if (current) {
    await session.call(`/ingest-keys/${encodeURIComponent(current.key_id)}`, {
      method: "DELETE",
      okStatuses: [200, 204],
    });
    log(`Revoked previous ingest key (prefix ${current.key_prefix}).`);
  }
  const created = await session.call<{ secret: string }>("/ingest-keys", {
    method: "POST",
    body: { name: INGEST_KEY_NAME },
  });
  console.log(
    [
      "",
      "  ============================================================",
      "  INGEST KEY (shown once, not stored anywhere). Put it in the",
      "  environment of tools/bank-simulator and pilot:seed-history:",
      "",
      `    AEGIS_INGEST_KEY=${created.data.secret}`,
      "  ============================================================",
    ].join("\n"),
  );
}

async function ensurePack(session: ConsoleSession): Promise<void> {
  const res = await session.call<{
    already_applied?: boolean;
    escalate_after_ms: number;
    escalate_to_role?: string;
    escalation_rules?: string[];
  }>("/demo-tenant/setup", {
    method: "POST",
    body: { force: args.has("--force-pack") },
  });
  if (res.data.already_applied) {
    log("Banking pack already active with the 2-minute escalation window.");
  } else {
    log(
      `Banking pack applied. Held rules ${(res.data.escalation_rules ?? []).join(", ")} escalate after ${
        res.data.escalate_after_ms / 60_000
      } min to ${res.data.escalate_to_role}.`,
    );
  }
}

function tokenFromInviteUrl(url: string): string | null {
  try {
    return new URL(url).searchParams.get("token");
  } catch {
    return null;
  }
}

type Invite = { invitation_id: string; invite_url: string; email_delivered: boolean };

async function invite(session: ConsoleSession, email: string): Promise<Invite | "exists"> {
  try {
    const res = await session.idCall<Invite>(`/orgs/${session.organizationId}/invitations`, {
      method: "POST",
      body: { email, role: "approver" },
    });
    return res.data;
  } catch (err) {
    if (err instanceof HttpError && err.status === 409) return "exists";
    throw err;
  }
}

async function revokePendingInvite(session: ConsoleSession, email: string): Promise<boolean> {
  const res = await session.idCall<{
    invitations: Array<{ invitation_id: string; email: string }>;
  }>(`/orgs/${session.organizationId}/invitations`);
  const found = res.data.invitations.find(
    (i) => i.email.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  if (!found) return false;
  await session.idCall(`/invitations/${encodeURIComponent(found.invitation_id)}`, {
    method: "DELETE",
    okStatuses: [200, 204],
  });
  return true;
}

async function acceptForPersona(
  file: TenantFile,
  token: string,
  key: PersonaKey,
): Promise<"accepted" | "failed"> {
  const persona = file.personas[key];
  const res = await httpJson<{ error?: string; code?: string }>(
    `${file.id_base}/v1/id/invitations/signup-accept`,
    {
      method: "POST",
      body: { token, display_name: persona.display_name, password: persona.password },
    },
  );
  if (res.status === 200) return "accepted";
  log(`  ${key}: could not accept the invitation (${res.data?.code ?? res.status}).`);
  return "failed";
}

async function inviteEveryone(
  file: TenantFile,
  admin: ConsoleSession,
): Promise<Record<PersonaKey, string>> {
  const status = {} as Record<PersonaKey, string>;
  for (const key of PERSONA_KEYS) {
    if (key === "admin") {
      status.admin = "active (organisation admin)";
      continue;
    }
    const persona = file.personas[key];
    let sent = await invite(admin, persona.email.trim());
    if (sent === "exists" && persona.password) {
      // Already a member? Or a pending invite whose token we no longer have?
      const revoked = await revokePendingInvite(admin, persona.email).catch(() => false);
      if (revoked) sent = await invite(admin, persona.email.trim());
    }
    if (sent === "exists") {
      status[key] = "already a member or invited";
      continue;
    }
    if (persona.password) {
      const token = tokenFromInviteUrl(sent.invite_url);
      const outcome = token ? await acceptForPersona(file, token, key) : "failed";
      status[key] = outcome === "accepted" ? "active (account created with the file password)" : "invited";
    } else {
      status[key] = sent.email_delivered
        ? "invited (email sent, waiting for acceptance)"
        : "invited (EMAIL NOT DELIVERED: configure Resend, then resend from Members)";
    }
  }
  return status;
}

async function syncBankRoles(session: ConsoleSession, file: TenantFile): Promise<void> {
  const assignments = (Object.entries(PERSONA_BANK_ROLE) as Array<[PersonaKey, string]>).map(
    ([key, role]) => ({ email: file.personas[key].email.trim(), role_key: role }),
  );
  const res = await session.call<{ assigned_count: number; pending_count: number }>(
    "/demo-tenant/bank-roles",
    { method: "POST", body: { assignments } },
  );
  log(
    `Bank roles assigned: ${res.data.assigned_count}. Waiting for acceptance: ${res.data.pending_count}.` +
      (res.data.pending_count > 0 ? "\n    Re-run this command after those people accept." : ""),
  );
}

async function main(): Promise<void> {
  const file = loadTenantFile();
  console.log(`Provisioning ${orgName(file)} (${orgSlug(file)}) on ${file.api_base}`);

  step(1, "Organisation");
  const organizationId = await ensureOrganization(file);

  step(2, "Admin sign-in");
  const admin = await ConsoleSession.login(file, organizationId, file.personas.admin).catch(
    (err) => {
      if (err instanceof HttpError && err.status === 401) {
        fail(
          "The admin could not sign in. If the organisation already existed, personas.admin.password in the local file must match the existing admin password.",
        );
      }
      throw err;
    },
  );
  log("Signed in as the organisation admin.");

  step(3, "Agents and signing bridge");
  await ensureAgents(admin);

  step(4, "Ingest key");
  const stableSecret = process.env.DEMO_BANK_INGEST_KEY?.trim();
  if (stableSecret) {
    await ensureStableIngestKey(file, organizationId, stableSecret);
  } else {
    await ensureIngestKey(admin);
  }

  step(5, "Banking pack and escalation");
  await ensurePack(admin);

  if (args.has("--skip-invites")) {
    console.log("\nSkipped invitations (--skip-invites).");
  } else {
    step(6, "Invitations");
    const status = await inviteEveryone(file, admin);
    for (const key of PERSONA_KEYS) log(`${key.padEnd(10)} ${status[key]}`);

    step(7, "Bank roles");
    await syncBankRoles(admin, file);
  }

  console.log(
    `\nDone. Organisation id: ${organizationId}${
      file.console_origin ? `\nConsole: ${file.console_origin}/aegis` : ""
    }\nNext: pnpm pilot:seed-history   (needs AEGIS_INGEST_KEY from step 4, or DEMO_BANK_INGEST_KEY)\n`,
  );
}

main().catch((err) => {
  if (err instanceof HttpError) fail(`Request failed: ${err.message}`);
  throw err;
});
