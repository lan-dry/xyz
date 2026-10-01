"use client";

import { updateNewsletterCampaign } from "@/app/(ops)/content/newsletter/actions";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

export type NewsletterCampaignEditDefaults = {
  subject: string;
  previewText: string | null;
  bodyMarkdown: string | null;
  scheduledAt: Date | null;
  status: string;
};

function toDatetimeLocal(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function NewsletterCampaignEditForm({
  campaignId,
  defaults,
}: {
  campaignId: string;
  defaults: NewsletterCampaignEditDefaults;
}) {
  const editable =
    defaults.status === "draft" ||
    defaults.status === "scheduled" ||
    defaults.status === "failed";

  if (!editable) {
    return null;
  }

  return (
    <form
      action={updateNewsletterCampaign.bind(null, campaignId)}
      className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}
      style={{ marginBottom: "1.25rem" }}
    >
      <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Edit campaign</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        Updates content and schedule. Saving with a future schedule sets status to scheduled; clear schedule for draft.
      </p>
      <input
        name="subject"
        defaultValue={defaults.subject}
        placeholder="Email subject"
        className={ui.input}
        required
      />
      <input
        name="previewText"
        defaultValue={defaults.previewText ?? ""}
        placeholder="Preview line (optional)"
        className={ui.input}
      />
      <label style={{ fontSize: "0.8125rem", fontWeight: 500, display: "grid", gap: "0.35rem" }}>
        Schedule send (optional, UTC)
        <input
          name="scheduledAt"
          type="datetime-local"
          defaultValue={toDatetimeLocal(defaults.scheduledAt)}
          className={ui.input}
        />
      </label>
      <textarea
        name="bodyMarkdown"
        rows={14}
        className={ui.textarea}
        defaultValue={defaults.bodyMarkdown ?? ""}
        required
        style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem" }}
      />
      <CmsFormSubmit label="Save changes" pendingLabel="Saving…" />
    </form>
  );
}
