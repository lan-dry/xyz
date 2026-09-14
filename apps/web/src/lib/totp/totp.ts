import { timingSafeEqual } from "node:crypto";

import QRCode from "qrcode";
import speakeasy from "@levminer/speakeasy";

const DIGITS = 6;
const STEP_SECONDS = 30;
const WINDOW = 1;

function normalizeToken(token: string): string | null {
  const trimmed = token.trim();
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function safeEqualCode(a: string, b: string): boolean {
  const left = Buffer.from(a.padStart(DIGITS, "0"), "utf8");
  const right = Buffer.from(b.padStart(DIGITS, "0"), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type TotpSetupBundle = {
  secretBase32: string;
  manualKey: string;
  otpauthUrl: string;
  qrDataUrl: string;
};

export async function createTotpSetupBundle(input: { email?: string | null; issuer?: string }): Promise<TotpSetupBundle> {
  const issuer = input.issuer?.trim() || "Salanor";
  const account = input.email?.trim().toLowerCase() || "user";
  const label = `${issuer}:${account}`;
  const generated = speakeasy.generateSecret({
    name: label,
    issuer,
    length: 32,
  });
  const otpauthUrl = generated.otpauth_url;
  if (!generated.base32 || !otpauthUrl) {
    throw new Error("Failed to generate TOTP secret");
  }
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 256 });
  return {
    secretBase32: generated.base32,
    manualKey: generated.base32,
    otpauthUrl,
    qrDataUrl,
  };
}

export function verifyTotpCode(secretBase32: string, token: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  const nowStep = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
    const expected = speakeasy.totp({
      secret: secretBase32,
      encoding: "base32",
      digits: DIGITS,
      step: STEP_SECONDS,
      time: (nowStep + offset) * STEP_SECONDS,
    });
    if (safeEqualCode(expected, normalized)) {
      return true;
    }
  }
  return false;
}
