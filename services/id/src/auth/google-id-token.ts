import { createPublicKey, createVerify } from "node:crypto";

type GoogleJwk = {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
};

type GoogleJwks = { keys: GoogleJwk[] };

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const JWKS_TTL_MS = 60 * 60 * 1000;
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

let jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;

async function fetchGoogleJwks(): Promise<GoogleJwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) {
    throw new Error("google_jwks_fetch_failed");
  }
  const data = (await res.json()) as GoogleJwks;
  jwksCache = { keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const json = Buffer.from(part, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

function verifyRs256Signature(
  signingInput: string,
  signatureB64: string,
  jwk: GoogleJwk,
): boolean {
  const key = createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();
  return verifier.verify(key, Buffer.from(signatureB64, "base64url"));
}

/**
 * Validate Google OpenID id_token using Google's JWKS (RS256).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expectedClientId: string,
): Promise<{ sub: string; email: string; name: string | null }> {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("google_id_token_malformed");
  }

  const header = decodeJwtPart(parts[0]!) as { alg?: string; kid?: string };
  const payload = decodeJwtPart(parts[1]!) as {
    aud?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    iss?: string;
    exp?: number;
  };

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("google_id_token_header");
  }

  const keys = await fetchGoogleJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    jwksCache = null;
    const refreshed = await fetchGoogleJwks();
    const retry = refreshed.find((k) => k.kid === header.kid);
    if (!retry) {
      throw new Error("google_id_token_unknown_kid");
    }
    if (!verifyRs256Signature(`${parts[0]}.${parts[1]}`, parts[2]!, retry)) {
      throw new Error("google_id_token_signature");
    }
  } else if (!verifyRs256Signature(`${parts[0]}.${parts[1]}`, parts[2]!, jwk)) {
    throw new Error("google_id_token_signature");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("google_id_token_missing_claims");
  }
  if (payload.aud !== expectedClientId) {
    throw new Error("google_id_token_audience");
  }
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new Error("google_id_token_issuer");
  }
  if (!payload.email_verified) {
    throw new Error("google_email_unverified");
  }
  if (payload.exp != null && payload.exp * 1000 < Date.now()) {
    throw new Error("google_id_token_expired");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ?? null,
  };
}
