"use client";

import { CmsMarkdownField } from "@/components/content/cms-markdown-field";
import { ui } from "@/components/ops-ui/ops-ui";

import forms from "./content-forms.module.css";

export type CareerFormDefaults = {
  title?: string;
  slug?: string;
  team?: string;
  location?: string;
  seniority?: string;
  employmentType?: string;
  compensationRange?: string | null;
  status?: string;
  postedAt?: Date | null;
  closesAt?: Date | null;
  summary?: string;
  requirements?: string;
};

export function CareerRoleFormFields({
  defaults,
  openRoleId,
}: {
  defaults?: CareerFormDefaults;
  openRoleId?: string;
}) {
  const postedLocal = defaults?.postedAt ? new Date(defaults.postedAt).toISOString().slice(0, 16) : "";
  const closesLocal = defaults?.closesAt ? new Date(defaults.closesAt).toISOString().slice(0, 16) : "";

  return (
    <>
      <div className={forms.formGrid2}>
        <input name="title" defaultValue={defaults?.title ?? ""} placeholder="Role title" className={ui.input} required />
        <input name="slug" defaultValue={defaults?.slug ?? ""} placeholder="slug (URL)" className={ui.input} required />
        <input name="team" defaultValue={defaults?.team ?? ""} placeholder="Team" className={ui.input} required />
        <input name="location" defaultValue={defaults?.location ?? "Remote"} placeholder="Location" className={ui.input} required />
        <input name="seniority" defaultValue={defaults?.seniority ?? ""} placeholder="Seniority" className={ui.input} required />
        <select name="employmentType" defaultValue={defaults?.employmentType ?? "full_time"} className={ui.select}>
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
          <option value="contract">Contract</option>
        </select>
      </div>
      <CmsMarkdownField
        name="summary"
        label="Role overview (Markdown)"
        defaultValue={defaults?.summary ?? ""}
        rows={12}
        openRoleId={openRoleId}
      />
      <CmsMarkdownField
        name="requirements"
        label="Requirements & responsibilities (Markdown)"
        defaultValue={defaults?.requirements ?? ""}
        rows={14}
        openRoleId={openRoleId}
      />
      <div className={forms.formGrid3}>
        <input
          name="compensationRange"
          defaultValue={defaults?.compensationRange ?? ""}
          placeholder="Compensation (optional)"
          className={ui.input}
        />
        <select name="status" defaultValue={defaults?.status ?? "draft"} className={ui.select}>
          <option value="draft">draft (hidden on www)</option>
          <option value="open">open</option>
          <option value="closed">closed</option>
        </select>
        <input name="postedAt" type="datetime-local" defaultValue={postedLocal} className={ui.input} />
      </div>
      <input name="closesAt" type="datetime-local" defaultValue={closesLocal} placeholder="Closes at" className={ui.input} />
    </>
  );
}
