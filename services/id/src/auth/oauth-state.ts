import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

type OAuthStatePayload = {
  n: string;
  returnTo: string;
  provider: string;
  exp: number;
  /** Enterprise SSO: organization slug the user entered at login */
  orgSlug?: string;
};

export function stateSecret(): string {
  const isProd = process.env.NODE_ENV === "production";
  const auth = process.env.AUTH_SECRET?.trim();
  if (auth) return auth;
  if (isProd) {
    throw new Error("AUTH_SECRET is required for OAuth in production");
  }
  const fallback = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!fallback) {
    throw new Error("AUTH_SECRET or PLATFORM_BOOTSTRAP_SECRET required for OAuth");
  }
  return fallback;
}

function encodePayload(payload: OAuthStatePayload): string {
  const json = JSON.stringify(payload);
  const body = Buffer.from(json).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function decodePayload(token: string): OAuthStatePayload | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  try {
    if (
      expected.length !== sig.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  } catch {
    return null;
  }
}

export function createOAuthState(input: {
  provider: string;
  returnTo: string;
  orgSlug?: string;
}): string {
  const safeReturn =
    input.returnTo.startsWith("/") && !input.returnTo.startsWith("//")
      ? input.returnTo
      : "/aegis/traces";
  const orgSlug = input.orgSlug?.trim().toLowerCase();
  return encodePayload({
    n: randomBytes(16).toString("hex"),
    returnTo: safeReturn,
    provider: input.provider,
    exp: Date.now() + 10 * 60 * 1000,
    ...(orgSlug ? { orgSlug } : {}),
  });
}

/** Require query `state` to match the httpOnly cookie (double-submit). */
export function verifyOAuthState(
  queryState: string,
  cookieState: string | undefined,
  expectedProvider: string,
): { returnTo: string; orgSlug?: string } | null {
  if (!queryState || !cookieState) return null;
  try {
    const a = Buffer.from(decodeURIComponent(queryState));
    const b = Buffer.from(decodeURIComponent(cookieState));
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  const payload = decodePayload(decodeURIComponent(queryState));
  if (!payload || payload.provider !== expectedProvider) return null;
  if (payload.exp < Date.now()) return null;
  return { returnTo: payload.returnTo, orgSlug: payload.orgSlug };
}
