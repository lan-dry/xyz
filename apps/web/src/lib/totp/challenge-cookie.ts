const COOKIE_NAME = "salanor_totp_challenge";
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 12;

type ChallengePayload = {
  userId: string;
  exp: number;
};

function challengeSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for TOTP challenge cookies");
  }
  return secret;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function utf8ToBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

function base64UrlToUtf8(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(challengeSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(payload));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function issueTotpChallengeCookie(userId: string, maxAgeSeconds = DEFAULT_MAX_AGE_SECONDS): Promise<string> {
  const payload: ChallengePayload = {
    userId,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const body = utf8ToBase64Url(JSON.stringify(payload));
  const signature = await signPayload(body);
  return `${body}.${signature}`;
}

export async function validateTotpChallengeCookie(value: string | undefined, expectedUserId: string): Promise<boolean> {
  if (!value) return false;
  const [body, signature] = value.split(".");
  if (!body || !signature) return false;
  const isValidSignature = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    base64UrlToBytes(signature),
    new TextEncoder().encode(body),
  );
  if (!isValidSignature) {
    return false;
  }
  let payload: ChallengePayload;
  try {
    payload = JSON.parse(base64UrlToUtf8(body)) as ChallengePayload;
  } catch {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return payload.userId === expectedUserId && payload.exp > now;
}

export const TOTP_CHALLENGE_COOKIE_NAME = COOKIE_NAME;
export const TOTP_CHALLENGE_COOKIE_MAX_AGE_SECONDS = DEFAULT_MAX_AGE_SECONDS;
