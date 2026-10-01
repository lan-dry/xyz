"use client";

import { deleteResearchPost, updateResearchPost } from "@/app/(ops)/content/research/actions";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import {
  ResearchFormFields,
  type ResearchBylinePreview,
  type ResearchFormDefaults,
} from "@/components/content/research-form-fields";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

type Props = {
  researchId: string;
  defaults: ResearchFormDefaults;
  byline: ResearchBylinePreview;
};

export function ResearchEditForm({ researchId, defaults, byline }: Props) {
  return (
    <>
      <form
        action={updateResearchPost.bind(null, researchId)}
        className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}
      >
        <ResearchFormFields defaults={defaults} byline={byline} researchId={researchId} />
        <CmsFormSubmit label="Save" pendingLabel="Saving…" />
      </form>
      <form
        action={deleteResearchPost.bind(null, researchId)}
        className={`${ui.card} ${ui.cardPad}`}
        style={{ marginTop: "1rem" }}
        onSubmit={(e) => {
          if (!confirm("Delete this research post and remove its unused media files?")) {
            e.preventDefault();
          }
        }}
      >
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
          Deletes the database record and runs media cleanup (files only removed when not referenced elsewhere).
        </p>
        <CmsFormSubmit label="Delete post" pendingLabel="Deleting…" variant="danger" />
      </form>
    </>
  );
}
