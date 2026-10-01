"use client";

import { updateRole } from "@/app/(ops)/content/careers/actions";
import { CareerRoleFormFields } from "@/components/content/career-role-form-fields";
import { CmsFormSubmit } from "@/components/content/cms-form-submit";
import type { CareerFormDefaults } from "@/components/content/career-role-form-fields";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";

type Props = {
  roleId: string;
  defaults: CareerFormDefaults;
};

export function CareerEditForm({ roleId, defaults }: Props) {
  return (
    <form action={updateRole.bind(null, roleId)} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
      <CareerRoleFormFields openRoleId={roleId} defaults={defaults} />
      <CmsFormSubmit label="Save" pendingLabel="Saving…" />
    </form>
  );
}
