import pg from "pg";

let stoaPool: pg.Pool | null = null;

function getStoaPool(): pg.Pool | null {
  const url = process.env.STOA_DATABASE_URL?.trim();
  if (!url) {
    return null;
  }
  if (!stoaPool) {
    stoaPool = new pg.Pool({ connectionString: url });
  }
  return stoaPool;
}

export type TransactionalEmailFrom = {
  from: string;
  replyTo?: string;
};

export type OrgSmtpDelivery = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export type OrgEmailDelivery = TransactionalEmailFrom & {
  mode: "platform" | "smtp";
  smtp: OrgSmtpDelivery | null;
};

function formatFrom(name: string | null, address: string): string {
  const trimmedName = name?.trim();
  if (trimmedName) {
    return `${trimmedName} <${address}>`;
  }
  return address;
}

function readEmailObject(settings: unknown): Record<string, unknown> | null {
  if (!settings || typeof settings !== "object") {
    return null;
  }
  const email = (settings as Record<string, unknown>).email;
  if (!email || typeof email !== "object") {
    return null;
  }
  return email as Record<string, unknown>;
}

/** Org overrides stored in stoa_tenant.settings.email (Stoa admin). */
export async function resolveOrgEmailDelivery(
  platformOrganizationId: string,
): Promise<OrgEmailDelivery | null> {
  const pool = getStoaPool();
  if (!pool) {
    return null;
  }
  const row = await pool.query<{ settings: unknown }>(
    `SELECT settings FROM stoa_tenant WHERE platform_organization_id = $1`,
    [platformOrganizationId],
  );
  const obj = readEmailObject(row.rows[0]?.settings);
  if (!obj) {
    return null;
  }

  const address =
    typeof obj.fromAddress === "string" ? obj.fromAddress.trim() : "";
  const name = typeof obj.fromName === "string" ? obj.fromName : null;
  const replyTo =
    typeof obj.replyTo === "string" && obj.replyTo.trim()
      ? obj.replyTo.trim()
      : undefined;

  const delivery =
    obj.delivery === "smtp" || obj.delivery === "platform"
      ? obj.delivery
      : "platform";
  const host = typeof obj.smtpHost === "string" ? obj.smtpHost.trim() : "";
  const user = typeof obj.smtpUser === "string" ? obj.smtpUser.trim() : "";
  const password =
    typeof obj.smtpPassword === "string" ? obj.smtpPassword : "";
  const portRaw =
    typeof obj.smtpPort === "number" && Number.isFinite(obj.smtpPort)
      ? Math.floor(obj.smtpPort)
      : 587;
  const port = Math.min(65535, Math.max(1, portRaw));
  const secure = obj.smtpSecure === true;

  const smtp: OrgSmtpDelivery | null =
    delivery === "smtp" && host && user && password
      ? { host, port, secure, user, password }
      : null;

  if (!address && delivery === "platform") {
    return null;
  }

  return {
    from: address
      ? formatFrom(name, address)
      : formatFrom(name, user.includes("@") ? user : "noreply@localhost"),
    replyTo,
    mode: delivery,
    smtp,
  };
}

/** @deprecated Prefer resolveOrgEmailDelivery */
export async function resolveOrgTransactionalFrom(
  platformOrganizationId: string,
): Promise<TransactionalEmailFrom | null> {
  const delivery = await resolveOrgEmailDelivery(platformOrganizationId);
  if (!delivery) {
    return null;
  }
  return { from: delivery.from, replyTo: delivery.replyTo };
}

export async function resolveOrgTransactionalFromForAccount(
  accountId: string,
): Promise<{ orgId: string; from: TransactionalEmailFrom } | null> {
  const idPool = await import("../db/pool.js").then((m) => m.getPool());
  const mem = await idPool.query<{ organization_id: string }>(
    `SELECT organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1`,
    [accountId],
  );
  const orgId = mem.rows[0]?.organization_id;
  if (!orgId) {
    return null;
  }
  const from = await resolveOrgTransactionalFrom(orgId);
  if (!from) {
    return null;
  }
  return { orgId, from };
}

export async function resolveOrgEmailDeliveryForAccount(
  accountId: string,
): Promise<{ orgId: string; delivery: OrgEmailDelivery } | null> {
  const idPool = await import("../db/pool.js").then((m) => m.getPool());
  const mem = await idPool.query<{ organization_id: string }>(
    `SELECT organization_id FROM membership
     WHERE account_id = $1 AND status = 'active'
     ORDER BY joined_at ASC LIMIT 1`,
    [accountId],
  );
  const orgId = mem.rows[0]?.organization_id;
  if (!orgId) {
    return null;
  }
  const delivery = await resolveOrgEmailDelivery(orgId);
  if (!delivery) {
    return null;
  }
  return { orgId, delivery };
}
