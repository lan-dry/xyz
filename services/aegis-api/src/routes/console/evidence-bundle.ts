import { Hono } from "hono";
import { getPool } from "../../db/pool.js";
import {
  auditReceiptAccess,
  RECEIPT_ACCESS_ACTIONS,
} from "../../console/receipt-access-audit.js";
import { logReceiptAccess } from "../../forensic/access-log.js";
import {
  type EvidenceBundle,
  evidenceBundleFilename,
  loadEvidenceBundle,
  renderEvidencePdf,
} from "../../forensic/evidence-bundle.js";
import {
  requireConsoleSession,
  type ConsoleVariables,
} from "../../middleware/console-session.js";
import { markOnboardingStep } from "../../tenants/onboarding-checklist.js";

export const evidenceBundleRoutes = new Hono<{ Variables: ConsoleVariables }>();

/**
 * Signed forensic receipt bundle for one case (trace). Verifies offline with
 * verifyForensicBundle / aegis-verify. Reading a receipt is logged.
 */
evidenceBundleRoutes.get(
  "/traces/:traceId/evidence-bundle",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const traceId = c.req.param("traceId");
    if (!traceId) return c.json({ error: "traceId required" }, 422);

    const pool = getPool();
    const bundle = await loadEvidenceBundle(pool, session.organizationId, traceId);
    if (!bundle) {
      return c.json(
        {
          error:
            "No signed receipt exists for this case. Only cases decided with receipt signing enabled have an evidence bundle.",
          code: "no_signed_receipt",
        },
        404,
      );
    }
    await recordAccess(session, bundle, "download_bundle");
    await markOnboardingStep(pool, session.organizationId, "verify_bundle");

    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${evidenceBundleFilename(bundle, "json")}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);

/** One-page plain-facts PDF. For reading; the JSON bundle is the proof. */
evidenceBundleRoutes.get(
  "/traces/:traceId/evidence-bundle.pdf",
  requireConsoleSession,
  async (c) => {
    const session = c.get("consoleSession");
    const traceId = c.req.param("traceId");
    if (!traceId) return c.json({ error: "traceId required" }, 422);

    const bundle = await loadEvidenceBundle(
      getPool(),
      session.organizationId,
      traceId,
    );
    if (!bundle) {
      return c.json(
        {
          error: "No signed receipt exists for this case.",
          code: "no_signed_receipt",
        },
        404,
      );
    }
    await recordAccess(session, bundle, "download_pdf");

    const pdf = await renderEvidencePdf(bundle);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${evidenceBundleFilename(bundle, "pdf")}"`,
        "Cache-Control": "no-store",
      },
    });
  },
);

async function recordAccess(
  session: { organizationId: string; userId: string; email: string },
  bundle: EvidenceBundle,
  action: "download_bundle" | "download_pdf",
): Promise<void> {
  // Access log page entry (one per download, tagged with the case).
  await auditReceiptAccess(
    getPool(),
    {
      organizationId: session.organizationId,
      membershipId: session.userId,
      email: session.email,
    },
    {
      action: RECEIPT_ACCESS_ACTIONS.evidenceDownloaded,
      resourceId: bundle.case_id ?? bundle.trace_id,
      resourceType: "case",
      dedupe: false,
      metadata: {
        case_id: bundle.case_id,
        trace_id: bundle.trace_id,
        format: action === "download_pdf" ? "pdf" : "json",
        receipts: bundle.receipts.length,
      },
    },
  );
  const receiptIds = bundle.receipts.map((r) => r.receipt_id);
  try {
    for (const receiptId of receiptIds) {
      await logReceiptAccess(getPool(), {
        organization_id: session.organizationId,
        receipt_id: receiptId,
        actor_membership_id: session.userId,
        actor_email: session.email,
        action,
      });
    }
  } catch (err) {
    // Download must not fail because the access log is unavailable.
    console.error(
      "[evidence-bundle] access log write failed",
      err instanceof Error ? err.message : err,
    );
  }
}
