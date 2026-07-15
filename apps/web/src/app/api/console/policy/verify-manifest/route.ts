import { NextRequest, NextResponse } from "next/server";

import { resolvePolicySigningKey, verifyPolicyManifest } from "@/lib/aegis/policy-manifest";
import { withConsoleOrg } from "@/lib/console/api-route";
import { requireConsoleContextApi } from "@/lib/console/session";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ctx = await requireConsoleContextApi();
  return withConsoleOrg(ctx.activeOrgId, "viewer", async () => {
    const signingKey = resolvePolicySigningKey();
    if (!signingKey) {
      return NextResponse.json(
        { error: "Policy signing key is not configured (set POLICY_SIGNING_KEY or AUTH_SECRET)." },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const manifest =
      body && typeof body === "object" && !Array.isArray(body) && "manifest" in body
        ? (body as { manifest: unknown }).manifest
        : body;

    const verified = verifyPolicyManifest(manifest, signingKey);
    if (!verified.ok) {
      return NextResponse.json(
        {
          valid: false,
          errors: verified.errors,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      valid: true,
      manifest: verified.manifest,
    });
  });
}
