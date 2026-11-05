"use client";

import { createNewsletterCampaign } from "@/app/(ops)/content/newsletter/actions";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

export function NewsletterCampaignForm() {
  return (
    <form action={createNewsletterCampaign} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
      <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>New campaign</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        Confirmed subscribers only. Test, then send now or schedule (UTC stored; use your local picker).
      </p>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Subject</span>
        <input name="subject" placeholder="What the reader sees in the inbox" className={ui.input} required />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Preview line</span>
        <input
          name="previewText"
          placeholder="Optional inbox snippet"
          className={ui.input}
        />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Schedule send (optional)</span>
        <input name="scheduledAt" type="datetime-local" className={ui.input} />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Body</span>
        <textarea
          name="bodyMarkdown"
          rows={12}
          className={`${ui.textarea} ${forms.body}`}
          placeholder={"## Heading\n\nYour update…"}
          required
        />
        <span className={forms.hint}>Markdown is supported.</span>
      </label>
      <CmsFormSubmit label="Save" pendingLabel="Saving…" />
    </form>
  );
}
