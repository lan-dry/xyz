"use client";

import { createRole } from "@/app/(ops)/content/careers/actions";
import { CareerRoleFormFields } from "@/components/content/career-role-form-fields";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

export function CareerCreateForm() {
  return (
    <form
      action={createRole}
      className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}
      style={{ marginBottom: "1.25rem" }}
    >
      <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Create role</h3>
      <CareerRoleFormFields />
      <CmsFormSubmit label="Create" pendingLabel="Creating…" />
    </form>
  );
}
