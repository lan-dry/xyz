import "../src/db/load-env.js";
import {
  createSession,
  deleteSession,
  SALANOR_SESSION_COOKIE,
} from "@salanor/platform-auth";
import { getPool, closePool } from "../src/db/pool.js";
import { getIdentityPool } from "../src/identity/pool.js";
import { openVault } from "../src/dlp/vault-crypto.js";

const API = "http://localhost:8094/v1/stoa";
const WEB = "http://localhost:3004";
const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") =>
  results.push([name, ok, detail]);

const tenant = (
  await getPool().query<{ id: string; platform_organization_id: string }>(
    `SELECT id, platform_organization_id FROM stoa_tenant WHERE slug = 'org-f79af136cd06'`,
  )
).rows[0]!;
const admin = (
  await getIdentityPool().query<{ account_id: string }>(
    `SELECT account_id FROM membership
     WHERE organization_id = $1 AND role = 'admin' AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1`,
    [tenant.platform_organization_id],
  )
).rows[0]!;
const { token } = await createSession(
  getIdentityPool(),
  admin.account_id,
  tenant.platform_organization_id,
);
const headers = {
  Cookie: `${SALANOR_SESSION_COOKIE}=${token}`,
  "Content-Type": "application/json",
};
const get = async (path: string, base = API) => {
  const r = await fetch(`${base}${path}`, { headers });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};
const send = async (method: string, path: string, body: unknown) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};

try {
  const anon = await fetch(`${API}/admin/overview`);
  const anonBody = (await anon.json()) as { error?: string };
  check("signed-out request rejected", anon.status === 401, anonBody.error ?? "");

  const ov = await get("/admin/overview");
  check(
    "overview",
    ov.status === 200 &&
      "privacy" in ov.body &&
      "provider" in ov.body &&
      !("setup" in ov.body) &&
      !("dlp" in ov.body),
    `withheld this month=${ov.body?.privacy?.valuesWithheld}, protected messages=${ov.body?.privacy?.protectedMessages}, providers=${ov.body?.provider?.connected?.map((p: any) => p.label).join("/")}`,
  );

  const st = await get("/admin/settings");
  const comp = st.body?.settings?.compliance ?? {};
  check(
    "settings hide secrets",
    st.status === 200 &&
      comp.siemWebhookSecret === null &&
      comp.exportSigningSecret === null &&
      typeof comp.siemWebhookSecretSet === "boolean",
    `siemSecretSet=${comp.siemWebhookSecretSet}, signingSecretSet=${comp.exportSigningSecretSet}`,
  );

  const pv = await send("POST", "/admin/dlp/preview", {
    text: "Client Aicha, CNI 114587236, tel +237 677 45 12 89, IBAN CM21 1003 3050 0102 3456 7890 145, montant 1 750 000 FCFA",
  });
  check(
    "test a message",
    pv.status === 200 &&
      !pv.body.upstream.includes("114587236") &&
      !pv.body.upstream.includes("677 45 12 89") &&
      pv.body.upstream.includes("1 750 000 FCFA"),
    pv.body?.upstream,
  );

  const au = await get("/admin/audit?limit=5&offset=0");
  check(
    "audit paging",
    au.status === 200 && au.body.events.length <= 5 && typeof au.body.total === "number",
    `page=${au.body?.events?.length}, total=${au.body?.total}`,
  );

  const cs = await get("/admin/compliance/status");
  check("compliance status", cs.status === 200, JSON.stringify(cs.body));

  const gw = await get("/admin/gateway/credentials");
  check(
    "API keys endpoint shown",
    gw.status === 200 && String(gw.body?.endpoint).endsWith("/v1/chat/completions"),
    gw.body?.endpoint,
  );

  const rows = (
    await getPool().query<{
      thread_id: string;
      content_display: string;
      redaction_vault: string;
    }>(
      `SELECT m.thread_id, m.content_display, m.redaction_vault
       FROM stoa_message m JOIN stoa_thread t ON t.id = m.thread_id
       WHERE t.tenant_id = $1 AND m.role = 'user'
         AND m.redaction_vault IS NOT NULL AND m.redaction_count > 0`,
      [tenant.id],
    )
  ).rows;
  let leaks = 0;
  for (const row of rows) {
    const vault = openVault(row.redaction_vault) ?? {};
    for (const value of Object.values(vault)) {
      if (value && row.content_display?.includes(value)) leaks += 1;
    }
  }
  check(
    "no originals stored outside the encrypted vault",
    leaks === 0,
    `${rows.length} protected messages checked, ${leaks} leaks`,
  );

  const sample = rows[0];
  if (sample) {
    const vault = openVault(sample.redaction_vault) ?? {};
    const original = Object.values(vault)[0] ?? "";
    const owner = await get(`/threads/${sample.thread_id}/messages`);
    const ownerText = JSON.stringify(owner.body);
    check(
      "owner sees original values",
      owner.status === 200 && ownerText.includes(original),
      `restored "${original}"`,
    );

    const before = st.body.settings.adminMask.chatContentAccess;
    const review: Record<string, string> = {};
    for (const level of ["metadata", "redacted", "full"] as const) {
      await send("PATCH", "/admin/settings", {
        adminMask: { chatContentAccess: level },
      });
      const r = await get(`/admin/threads/${sample.thread_id}`);
      review[level] = JSON.stringify(
        r.body?.messages?.filter((m: any) => m.role === "user").map((m: any) => m.content),
      );
    }
    await send("PATCH", "/admin/settings", {
      adminMask: { chatContentAccess: before },
    });
    check(
      "review: titles only hides text",
      !review.metadata!.includes(original),
    );
    check(
      "review: protected values hidden",
      !review.redacted!.includes(original) && /\[[A-Z_]+_\d+\]/.test(review.redacted!),
    );
    check("review: full shows originals", review.full!.includes(original));
    const restored = (await get("/admin/settings")).body.settings.adminMask.chatContentAccess;
    check("review setting restored", restored === before, String(restored));
  }

  const proxied = await get("/api/stoa/admin/overview", WEB);
  check("web proxy", proxied.status === 200, String(proxied.status));

  for (const page of ["/login", "/forgot-password", "/reset-password", "/admin", "/admin/models", "/admin/compliance", "/admin/gateway", "/admin/users", "/"]) {
    const r = await fetch(`${WEB}${page}`, { headers: { Cookie: headers.Cookie } });
    check(`page ${page}`, r.status === 200, String(r.status));
  }
} finally {
  await deleteSession(getIdentityPool(), token);
  await closePool();
  await getIdentityPool().end();
}

for (const [name, ok, detail] of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(48)} ${detail}`);
}
console.log(`\n${results.filter((r) => r[1]).length}/${results.length} passed`);
