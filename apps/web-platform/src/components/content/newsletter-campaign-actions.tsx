"use client";

import {
  cancelScheduledCampaignAction,
  sendNewsletterCampaignAction,
  testNewsletterCampaignAction,
} from "@/app/(ops)/content/newsletter/actions";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import { ui } from "@/components/ops-ui/ops-ui";

export function NewsletterCampaignActions({ campaignId, status }: { campaignId: string; status: string }) {
  if (status === "sent" || status === "sending") {
    return <span className={ui.badgeMuted}>{status}</span>;
  }

  const canSend = status === "draft" || status === "scheduled" || status === "failed";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      {canSend ? (
        <>
          <form
            action={testNewsletterCampaignAction.bind(null, campaignId)}
            onSubmit={(e) => {
              if (!confirm("Send a test copy to your Platform Ops email?")) e.preventDefault();
            }}
          >
            <button type="submit" className={`${ui.btn} ${ui.btnGhost}`}>
              Test
            </button>
          </form>
          <form
            action={sendNewsletterCampaignAction.bind(null, campaignId)}
            onSubmit={(e) => {
              if (!confirm("Send this campaign to all active subscribers now?")) e.preventDefault();
            }}
          >
            <CmsFormSubmit label={status === "scheduled" ? "Send now" : "Send"} pendingLabel="Sending…" />
          </form>
        </>
      ) : null}
      {status === "scheduled" ? (
        <form action={cancelScheduledCampaignAction.bind(null, campaignId)}>
          <button type="submit" className={`${ui.btn} ${ui.btnGhost}`}>
            Cancel schedule
          </button>
        </form>
      ) : null}
    </div>
  );
}
