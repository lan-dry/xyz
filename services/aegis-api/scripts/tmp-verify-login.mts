import "../src/db/load-env.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
const idBase = (process.env.SALANOR_ID_URL ?? "http://127.0.0.1:8091").replace(/\/$/, "");

if (!email || !password) {
  console.error("BOOTSTRAP_ADMIN_EMAIL / PASSWORD missing");
  process.exit(1);
}

try {
  const res = await fetch(`${idBase}/v1/id/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as {
    error?: string;
    user?: { email?: string };
    organization?: { slug?: string };
  };
  console.log(
    JSON.stringify(
      {
        status: res.status,
        ok: res.ok,
        email: body.user?.email ?? null,
        org: body.organization?.slug ?? null,
        error: body.error ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(res.ok ? 0 : 1);
} catch (err) {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      hint: "Is pnpm dev (id on :8091) running?",
    }),
  );
  process.exit(1);
}
