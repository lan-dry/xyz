"use client";

import { createResearchPost } from "@/app/(ops)/content/research/actions";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import {
  ResearchFormFields,
  type ResearchBylinePreview,
} from "@/components/content/research-form-fields";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

export function ResearchCreateForm({ byline }: { byline: ResearchBylinePreview }) {
  return (
    <form
      action={createResearchPost}
      className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}
      style={{ marginBottom: "1.25rem" }}
    >
      <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Create research post</h3>
      <ResearchFormFields byline={byline} />
      <CmsFormSubmit label="Create" pendingLabel="Creating…" />
    </form>
  );
}
