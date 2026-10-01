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
      <input name="subject" placeholder="Email subject" className={ui.input} required />
      <input
        name="previewText"
        placeholder="Preview line (inbox snippet, optional)"
        className={ui.input}
      />
      <label style={{ fontSize: "0.8125rem", fontWeight: 500, display: "grid", gap: "0.35rem" }}>
        Schedule send (optional)
        <input name="scheduledAt" type="datetime-local" className={ui.input} />
      </label>
      <textarea
        name="bodyMarkdown"
        rows={14}
        className={ui.textarea}
        placeholder="## Heading&#10;&#10;Your update in Markdown…"
        required
        style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem" }}
      />
      <CmsFormSubmit label="Save" pendingLabel="Saving…" />
    </form>
  );
}
