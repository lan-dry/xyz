"use client";

import { useState } from "react";

import Link from "next/link";

import { CmsMarkdownField } from "@/components/content/cms-markdown-field";
import { CmsMediaUrlField } from "@/components/content/cms-media-url-field";
import { ui } from "@/components/ops-ui/ops-ui";

import forms from "./content-forms.module.css";

const TRACKS = [
  { value: "provenance", label: "Provenance" },
  { value: "replayability", label: "Replayability" },
  { value: "standards", label: "Standards" },
  { value: "policy", label: "Policy" },
  { value: "field_notes", label: "Field notes" },
  { value: "ops", label: "Ops / internal" },
] as const;

export type ResearchBylinePreview = { name: string; role: string };

export type ResearchFormDefaults = {
  title?: string;
  slug?: string;
  excerpt?: string;
  track?: string;
  status?: string;
  publishedAt?: Date | null;
  readingMinutes?: number;
  heroImageUrl?: string | null;
  ogImageUrl?: string | null;
  body?: string;
};

type Props = {
  defaults?: ResearchFormDefaults;
  byline?: ResearchBylinePreview;
  researchId?: string;
};

export function ResearchFormFields({ defaults, byline, researchId }: Props) {
  const [heroImageUrl, setHeroImageUrl] = useState(defaults?.heroImageUrl ?? "");
  const [ogImageUrl, setOgImageUrl] = useState(defaults?.ogImageUrl ?? "");

  const publishedLocal = defaults?.publishedAt
    ? new Date(defaults.publishedAt).toISOString().slice(0, 16)
    : "";

  return (
    <>
      {byline ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)", margin: "0 0 0.75rem" }}>
          Published as{" "}
          <strong style={{ color: "var(--console-fg)" }}>
            {byline.name} · {byline.role}
          </strong>
          .{" "}
          <Link href="/content/authors" className={ui.tableLink}>
            Edit my byline
          </Link>
        </p>
      ) : null}
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Title</span>
        <input name="title" defaultValue={defaults?.title ?? ""} className={ui.input} required />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Slug</span>
        <input
          name="slug"
          defaultValue={defaults?.slug ?? ""}
          className={ui.input}
          required
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          title="Lowercase letters, numbers, and hyphens only"
        />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Excerpt</span>
        <textarea
          name="excerpt"
          defaultValue={defaults?.excerpt ?? ""}
          rows={3}
          className={ui.textarea}
          required
        />
        <span className={forms.hint}>Plain text for cards and search results.</span>
      </label>
      <div className={forms.formGrid2}>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>Track</span>
          <select name="track" defaultValue={defaults?.track ?? "policy"} className={ui.select} required>
            {TRACKS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>Reading time (minutes)</span>
          <input
            name="readingMinutes"
            type="number"
            min={1}
            defaultValue={defaults?.readingMinutes ?? 8}
            className={ui.input}
          />
        </label>
      </div>
      <CmsMediaUrlField
        name="heroImageUrl"
        label="Hero image"
        value={heroImageUrl}
        onChange={setHeroImageUrl}
        excludeResearchId={researchId}
      />
      <CmsMediaUrlField
        name="ogImageUrl"
        label="Social preview image (optional)"
        value={ogImageUrl}
        onChange={setOgImageUrl}
        excludeResearchId={researchId}
      />
      <div className={forms.formGrid2}>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>Status</span>
          <select name="status" defaultValue={defaults?.status ?? "draft"} className={ui.select}>
            <option value="draft">Draft</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
        </label>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>Publish date</span>
          <input
            name="publishedAt"
            type="datetime-local"
            defaultValue={publishedLocal}
            className={ui.input}
          />
        </label>
      </div>
      <p className={forms.hint}>
        Publishing requires a byline. Drafts stay off the public research page. A future publish date schedules the piece.
      </p>
      <CmsMarkdownField
        name="body"
        label="Research document (Markdown)"
        defaultValue={defaults?.body ?? ""}
        rows={22}
        researchId={researchId}
        hint="Full paper-style content: sections, figures, code, citations. Renders like blog articles on www."
      />
    </>
  );
}
