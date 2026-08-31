import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCOUNT_BOOTSTRAP_COOKIE = "salanor_account_bootstrap";

const BOOTSTRAP_TTL_MS = 30 * 60 * 1000;

function bootstrapSecret(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ??
    process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET required for account bootstrap tokens");
  }
  return secret;
}

function signPayload(payload: string): string {
  return createHmac("sha256", bootstrapSecret()).update(payload, "utf8").digest("base64url");
}

/** Short-lived token allowing org creation when account has no active membership. */
export function createAccountBootstrapToken(accountId: string): string {
  const exp = Date.now() + BOOTSTRAP_TTL_MS;
  const nonce = randomBytes(8).toString("hex");
  const payload = `${accountId}.${exp}.${nonce}`;
  return `v1.${payload}.${signPayload(payload)}`;
}

export function verifyAccountBootstrapToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    return null;
  }
  const accountId = parts[1];
  const exp = Number(parts[2]);
  const nonce = parts[3];
  const sig = parts[4];
  if (!accountId || !nonce || !sig || !Number.isFinite(exp)) {
    return null;
  }
  if (exp <= Date.now()) {
    return null;
  }
  const payload = `${accountId}.${exp}.${nonce}`;
  const expected = signPayload(payload);
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  return accountId;
}
