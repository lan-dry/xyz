import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  return (
    process.env.AEGIS_APPROVAL_ACTION_SECRET?.trim() ||
    process.env.AEGIS_BRIDGE_MASTER_KEY?.trim() ||
    "dev-approval-action-secret-change-me"
  );
}

export type ApprovalActionClaims = {
  approvalId: string;
  organizationId: string;
  decision: "approved" | "rejected";
  exp: number;
};

export function signApprovalActionToken(claims: ApprovalActionClaims): string {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyApprovalActionToken(
  token: string,
): ApprovalActionClaims | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const claims = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as ApprovalActionClaims;
    if (
      !claims.approvalId ||
      !claims.organizationId ||
      (claims.decision !== "approved" && claims.decision !== "rejected")
    ) {
      return null;
    }
    if (typeof claims.exp !== "number" || Date.now() > claims.exp) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
