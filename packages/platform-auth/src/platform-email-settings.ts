/**
 * Platform-level transactional email settings, managed in the Aegis console
 * (Platform admin → Email) and read by services/id and services/aegis-api.
 *
 * Delivery modes (Stoa-aligned):
 *  - platform = Salanor Resend (DB key and/or RESEND_API_KEY env)
 *  - smtp = any SMTP host (Microsoft 365, Google, Postmark SMTP, self-hosted, …)
 *
 * Secret handling:
 *  - Resend API key and SMTP password are AES-256-GCM under AEGIS_BRIDGE_MASTER_KEY
 *    (`v1.<iv>.<tag>.<data>`). Saving secrets is refused when the master key is missing.
 *  - GET never returns secrets or ciphertext — only configured flags + hints.
 *  - resolvePlatformEmailDelivery() returns decrypted secrets for server-side send only.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type pg from "pg";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

export const DEFAULT_INVITE_FROM = "Salanor <invites@notifications.salanor.com>";

/**
 * Outbound mail is off unless this process is production, or the operator set
 * AEGIS_EMAIL_ENABLED=1 in the shell. A RESEND_API_KEY in `.env` is not enough:
 * local demo, seed, and tests must not spend the provider quota.
 */
export function isOutboundEmailEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.AEGIS_EMAIL_ENABLED?.trim().toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  if (flag === "0" || flag === "false" || flag === "no") return false;
  const node = (env.NODE_ENV || "").trim().toLowerCase();
  const aegis = (env.AEGIS_ENV || "").trim().toLowerCase();
  return node === "production" || aegis === "production";
}

/** Domains that are not real inboxes. Sending them still consumes provider quota. */
const NON_DELIVERABLE_DOMAIN = new Set([
  "demo.test",
  "example.com",
  "example.org",
  "example.net",
  "localhost",
  "invalid",
  "test",
  "local",
]);

export function isDeliverableMailbox(
  address: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const allow = env.AEGIS_EMAIL_ALLOW_DEMO_RECIPIENTS?.trim().toLowerCase();
  if (allow === "1" || allow === "true" || allow === "yes") return true;
  const domain = address.trim().toLowerCase().split("@")[1] ?? "";
  if (!domain || domain.includes(" ") || NON_DELIVERABLE_DOMAIN.has(domain)) return false;
  return !(
    domain.endsWith(".test") ||
    domain.endsWith(".invalid") ||
    domain.endsWith(".localhost") ||
    domain.endsWith(".local")
  );
}

export type PlatformEmailDeliveryMode = "platform" | "smtp";

export class PlatformEmailSettingsError extends Error {
  constructor(
    readonly code: "master_key_missing" | "invalid_input",
    message: string,
  ) {
    super(message);
    this.name = "PlatformEmailSettingsError";
  }
}

function masterKey(): Buffer | null {
  const raw = process.env.AEGIS_BRIDGE_MASTER_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const fromB64 = Buffer.from(raw, "base64");
  if (fromB64.length === 32) return fromB64;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function isPlatformEmailMasterKeyConfigured(): boolean {
  return masterKey() !== null;
}

function encryptSecret(plain: string): string {
  const key = masterKey();
  if (!key) {
    throw new PlatformEmailSettingsError(
      "master_key_missing",
      "AEGIS_BRIDGE_MASTER_KEY is not configured on this service, so email secrets cannot be stored encrypted. Set it (32-byte secret, base64 or hex) in the server environment and retry.",
    );
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptSecret(ciphertext: string): string {
  const key = masterKey();
  if (!key) throw new Error("master key not configured");
  const parts = ciphertext.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("unsupported ciphertext format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

type Row = {
  delivery: string | null;
  from_name: string | null;
  from_address: string | null;
  reply_to: string | null;
  resend_api_key_ciphertext: string | null;
  key_prefix: string | null;
  key_last4: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_password_ciphertext: string | null;
  updated_at: Date | null;
  updated_by: string | null;
};

async function readRow(client: pg.Pool | pg.PoolClient): Promise<Row | null> {
  const result = await client.query<Row>(
    `SELECT delivery, from_name, from_address, reply_to,
            resend_api_key_ciphertext, key_prefix, key_last4,
            smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_ciphertext,
            updated_at, updated_by
     FROM platform_email_settings WHERE id = 1`,
  );
  return result.rows[0] ?? null;
}

function formatFrom(name: string | null | undefined, address: string): string {
  const n = name?.trim();
  if (n) return `${n} <${address}>`;
  return address;
}

/** Safe-to-serialise view. Never contains secrets or ciphertext. */
export type PlatformEmailSettingsView = {
  delivery: PlatformEmailDeliveryMode;
  from_name: string | null;
  from_address: string | null;
  reply_to: string | null;
  key_configured: boolean;
  key_hint: string | null;
  smtp_host: string | null;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_configured: boolean;
  env_key_configured: boolean;
  env_from_configured: boolean;
  master_key_configured: boolean;
  /** Where platform-mode Resend takes the key from, or smtp when delivery=smtp and complete. */
  active_source: "database" | "environment" | "smtp" | "none";
  updated_at: string | null;
  updated_by: string | null;
};

function normalizeDelivery(raw: string | null | undefined): PlatformEmailDeliveryMode {
  return raw === "smtp" ? "smtp" : "platform";
}

function normalizeSmtpPort(raw: unknown): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw)
      ? Math.floor(raw)
      : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return 587;
  return Math.min(65535, Math.max(1, n));
}

export async function getPlatformEmailSettings(
  client: pg.Pool | pg.PoolClient,
): Promise<PlatformEmailSettingsView> {
  const row = await readRow(client);
  const delivery = normalizeDelivery(row?.delivery);
  const keyConfigured = Boolean(row?.resend_api_key_ciphertext);
  const smtpPasswordConfigured = Boolean(row?.smtp_password_ciphertext);
  const envKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const smtpComplete = Boolean(
    row?.smtp_host?.trim() &&
      row?.smtp_user?.trim() &&
      smtpPasswordConfigured,
  );

  let active_source: PlatformEmailSettingsView["active_source"] = "none";
  if (delivery === "smtp") {
    active_source = smtpComplete ? "smtp" : "none";
  } else if (keyConfigured) {
    active_source = "database";
  } else if (envKey) {
    active_source = "environment";
  }

  return {
    delivery,
    from_name: row?.from_name ?? null,
    from_address: row?.from_address ?? null,
    reply_to: row?.reply_to ?? null,
    key_configured: keyConfigured,
    key_hint:
      keyConfigured && row?.key_last4
        ? `${row.key_prefix ?? "re_"}…${row.key_last4}`
        : null,
    smtp_host: row?.smtp_host ?? null,
    smtp_port: normalizeSmtpPort(row?.smtp_port ?? 587),
    smtp_secure: row?.smtp_secure === true,
    smtp_user: row?.smtp_user ?? null,
    smtp_password_configured: smtpPasswordConfigured,
    env_key_configured: envKey,
    env_from_configured: Boolean(process.env.INVITE_EMAIL_FROM?.trim()),
    master_key_configured: isPlatformEmailMasterKeyConfigured(),
    active_source,
    updated_at: row?.updated_at?.toISOString() ?? null,
    updated_by: row?.updated_by ?? null,
  };
}

const FROM_MAX = 320;

function validateEmailAddress(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length > FROM_MAX || /[\r\n]/.test(trimmed)) {
    throw new PlatformEmailSettingsError("invalid_input", `${label} is invalid`);
  }
  const address = /<([^<>]+)>\s*$/.exec(trimmed)?.[1] ?? trimmed;
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address)) {
    throw new PlatformEmailSettingsError(
      "invalid_input",
      `${label} must look like "Name <ops@example.com>" or "ops@example.com"`,
    );
  }
  return trimmed;
}

export type SavePlatformEmailSettingsInput = {
  delivery?: PlatformEmailDeliveryMode;
  fromName?: string | null;
  /** undefined = leave unchanged; "" = clear. */
  fromAddress?: string;
  replyTo?: string | null;
  resendApiKey?: string;
  clearKey?: boolean;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  /** undefined = leave; null or "" with clearSmtpPassword = clear. */
  smtpPassword?: string | null;
  clearSmtpPassword?: boolean;
  updatedBy?: string | null;
};

export async function savePlatformEmailSettings(
  client: pg.Pool | pg.PoolClient,
  input: SavePlatformEmailSettingsInput,
): Promise<PlatformEmailSettingsView> {
  const existing = await readRow(client);

  let delivery = normalizeDelivery(existing?.delivery);
  if (input.delivery === "smtp" || input.delivery === "platform") {
    delivery = input.delivery;
  }

  let fromName = existing?.from_name ?? null;
  if (input.fromName !== undefined) {
    const t = input.fromName?.trim() ?? "";
    fromName = t === "" ? null : t.slice(0, 120);
  }

  let from = existing?.from_address ?? null;
  if (input.fromAddress !== undefined) {
    from = input.fromAddress.trim() === "" ? null : validateEmailAddress(input.fromAddress, "From address");
  }

  let replyTo = existing?.reply_to ?? null;
  if (input.replyTo !== undefined) {
    const t = input.replyTo?.trim() ?? "";
    replyTo = t === "" ? null : validateEmailAddress(t, "Reply-To");
  }

  let ciphertext = existing?.resend_api_key_ciphertext ?? null;
  let prefix = existing?.key_prefix ?? null;
  let last4 = existing?.key_last4 ?? null;

  if (input.clearKey) {
    ciphertext = null;
    prefix = null;
    last4 = null;
  }
  const newKey = input.resendApiKey?.trim();
  if (newKey) {
    if (newKey.length < 12 || newKey.length > 512 || /\s/.test(newKey)) {
      throw new PlatformEmailSettingsError("invalid_input", "Resend API key looks invalid");
    }
    ciphertext = encryptSecret(newKey);
    prefix = newKey.startsWith("re_") ? "re_" : newKey.slice(0, 2);
    last4 = newKey.slice(-4);
  }

  let smtpHost = existing?.smtp_host ?? null;
  if (input.smtpHost !== undefined) {
    const t = input.smtpHost?.trim() ?? "";
    smtpHost = t === "" ? null : t.slice(0, 253);
  }

  let smtpPort = normalizeSmtpPort(existing?.smtp_port ?? 587);
  if (input.smtpPort !== undefined) {
    smtpPort = normalizeSmtpPort(input.smtpPort);
  }

  let smtpSecure = existing?.smtp_secure === true;
  if (input.smtpSecure !== undefined) {
    smtpSecure = input.smtpSecure === true;
  }

  let smtpUser = existing?.smtp_user ?? null;
  if (input.smtpUser !== undefined) {
    const t = input.smtpUser?.trim() ?? "";
    smtpUser = t === "" ? null : t.slice(0, 320);
  }

  let smtpPasswordCipher = existing?.smtp_password_ciphertext ?? null;
  if (input.clearSmtpPassword || input.smtpPassword === null) {
    smtpPasswordCipher = null;
  }
  const newSmtpPass = typeof input.smtpPassword === "string" ? input.smtpPassword : undefined;
  if (newSmtpPass !== undefined && newSmtpPass !== "") {
    if (newSmtpPass.length > 512) {
      throw new PlatformEmailSettingsError("invalid_input", "SMTP password is too long");
    }
    smtpPasswordCipher = encryptSecret(newSmtpPass);
  }

  await client.query(
    `INSERT INTO platform_email_settings (
       id, delivery, from_name, from_address, reply_to,
       resend_api_key_ciphertext, key_prefix, key_last4,
       smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password_ciphertext,
       updated_at, updated_by
     ) VALUES (
       1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13
     )
     ON CONFLICT (id) DO UPDATE SET
       delivery = EXCLUDED.delivery,
       from_name = EXCLUDED.from_name,
       from_address = EXCLUDED.from_address,
       reply_to = EXCLUDED.reply_to,
       resend_api_key_ciphertext = EXCLUDED.resend_api_key_ciphertext,
       key_prefix = EXCLUDED.key_prefix,
       key_last4 = EXCLUDED.key_last4,
       smtp_host = EXCLUDED.smtp_host,
       smtp_port = EXCLUDED.smtp_port,
       smtp_secure = EXCLUDED.smtp_secure,
       smtp_user = EXCLUDED.smtp_user,
       smtp_password_ciphertext = EXCLUDED.smtp_password_ciphertext,
       updated_at = now(),
       updated_by = EXCLUDED.updated_by`,
    [
      delivery,
      fromName,
      from,
      replyTo,
      ciphertext,
      prefix,
      last4,
      smtpHost,
      smtpPort,
      smtpSecure,
      smtpUser,
      smtpPasswordCipher,
      input.updatedBy ?? null,
    ],
  );
  return getPlatformEmailSettings(client);
}

export type ResolvedPlatformSmtp = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
};

export type ResolvedPlatformEmailDelivery = {
  mode: "resend" | "smtp" | "none";
  from: string;
  replyTo?: string;
  /** Resend API key when mode=resend. SERVER-SIDE ONLY. */
  apiKey: string | null;
  keySource: "database" | "environment" | "none";
  smtp: ResolvedPlatformSmtp | null;
};

/** @deprecated Prefer ResolvedPlatformEmailDelivery — kept for call-site compatibility. */
export type ResolvedPlatformEmailConfig = {
  apiKey: string | null;
  from: string;
  keySource: "database" | "environment" | "none";
};

/**
 * Effective platform delivery: SMTP when delivery=smtp and complete; otherwise Resend
 * (DB key then RESEND_API_KEY). Missing table / decrypt failures fall back without taking
 * email down when env Resend is present.
 */
export async function resolvePlatformEmailDelivery(
  client: pg.Pool | pg.PoolClient | null,
): Promise<ResolvedPlatformEmailDelivery> {
  if (!isOutboundEmailEnabled()) {
    return {
      mode: "none",
      from: process.env.INVITE_EMAIL_FROM?.trim() || DEFAULT_INVITE_FROM,
      apiKey: null,
      keySource: "none",
      smtp: null,
    };
  }
  let row: Row | null = null;
  if (client) {
    try {
      row = await readRow(client);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "42P01") {
        console.warn("[email] could not read platform email settings; using environment");
      }
    }
  }

  const delivery = normalizeDelivery(row?.delivery);
  const dbFromAddr = row?.from_address?.trim() || null;
  const dbFromName = row?.from_name?.trim() || null;
  const replyTo = row?.reply_to?.trim() || undefined;
  const envFrom = process.env.INVITE_EMAIL_FROM?.trim() || null;

  const from =
    (dbFromAddr
      ? formatFrom(dbFromName, /<([^<>]+)>\s*$/.exec(dbFromAddr)?.[1] ?? dbFromAddr)
      : null) ||
    envFrom ||
    DEFAULT_INVITE_FROM;

  if (delivery === "smtp") {
    const host = row?.smtp_host?.trim() || "";
    const user = row?.smtp_user?.trim() || "";
    let password: string | null = null;
    if (row?.smtp_password_ciphertext) {
      try {
        password = decryptSecret(row.smtp_password_ciphertext);
      } catch {
        console.warn(
          "[email] stored SMTP password could not be decrypted (AEGIS_BRIDGE_MASTER_KEY changed or missing?)",
        );
      }
    }
    if (host && user && password) {
      const smtpFrom =
        dbFromAddr
          ? formatFrom(dbFromName, /<([^<>]+)>\s*$/.exec(dbFromAddr)?.[1] ?? dbFromAddr)
          : formatFrom(dbFromName, user.includes("@") ? user : "noreply@localhost");
      return {
        mode: "smtp",
        from: smtpFrom,
        replyTo,
        apiKey: null,
        keySource: "none",
        smtp: {
          host,
          port: normalizeSmtpPort(row?.smtp_port ?? 587),
          secure: row?.smtp_secure === true,
          user,
          password,
        },
      };
    }
    return {
      mode: "none",
      from,
      replyTo,
      apiKey: null,
      keySource: "none",
      smtp: null,
    };
  }

  let dbKey: string | null = null;
  if (row?.resend_api_key_ciphertext) {
    try {
      dbKey = decryptSecret(row.resend_api_key_ciphertext);
    } catch {
      console.warn(
        "[email] stored Resend key could not be decrypted (AEGIS_BRIDGE_MASTER_KEY changed or missing?); falling back to RESEND_API_KEY",
      );
    }
  }
  const envKey = process.env.RESEND_API_KEY?.trim() || null;
  if (dbKey) {
    return {
      mode: "resend",
      from,
      replyTo,
      apiKey: dbKey,
      keySource: "database",
      smtp: null,
    };
  }
  if (envKey) {
    return {
      mode: "resend",
      from,
      replyTo,
      apiKey: envKey,
      keySource: "environment",
      smtp: null,
    };
  }
  return {
    mode: "none",
    from,
    replyTo,
    apiKey: null,
    keySource: "none",
    smtp: null,
  };
}

/** Effective Resend-shaped config (apiKey + from). Use resolvePlatformEmailDelivery for SMTP. */
export async function resolvePlatformEmailConfig(
  client: pg.Pool | pg.PoolClient | null,
): Promise<ResolvedPlatformEmailConfig> {
  const d = await resolvePlatformEmailDelivery(client);
  return {
    apiKey: d.mode === "resend" ? d.apiKey : null,
    from: d.from,
    keySource: d.keySource,
  };
}

/** True when a Resend key is stored in the database (does not decrypt). */
export async function isPlatformEmailKeyStored(
  client: pg.Pool | pg.PoolClient,
): Promise<boolean> {
  try {
    const row = await readRow(client);
    return Boolean(row?.resend_api_key_ciphertext);
  } catch {
    return false;
  }
}

/** True when platform delivery can send (SMTP complete or Resend key available). */
export async function isPlatformEmailDeliveryConfigured(
  client: pg.Pool | pg.PoolClient | null,
): Promise<boolean> {
  const d = await resolvePlatformEmailDelivery(client);
  return d.mode !== "none";
}
