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
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Subject</span>
        <input name="subject" defaultValue={defaults.subject} className={ui.input} required />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Preview line</span>
        <input name="previewText" defaultValue={defaults.previewText ?? ""} className={ui.input} />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Schedule send</span>
        <input
          name="scheduledAt"
          type="datetime-local"
          defaultValue={toDatetimeLocal(defaults.scheduledAt)}
          className={ui.input}
        />
        <span className={forms.hint}>Optional. A future time marks the campaign as scheduled.</span>
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Body</span>
        <textarea
          name="bodyMarkdown"
          rows={16}
          className={ui.textarea}
          defaultValue={defaults.bodyMarkdown ?? ""}
          required
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.875rem", minHeight: "16rem" }}
        />
        <span className={forms.hint}>Markdown is supported.</span>
      </label>
      <CmsFormSubmit label="Save changes" pendingLabel="Saving…" />
    </form>
  );
}
