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
      <input name="title" defaultValue={defaults?.title ?? ""} placeholder="Title" className={ui.input} required />
      <input
        name="slug"
        defaultValue={defaults?.slug ?? ""}
        placeholder="slug (URL, lowercase)"
        className={ui.input}
        required
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        title="Lowercase letters, numbers, and hyphens only"
      />
      <textarea
        name="excerpt"
        defaultValue={defaults?.excerpt ?? ""}
        placeholder="Dek / summary (plain text for cards and SEO)"
        rows={2}
        className={ui.textarea}
        required
      />
      <div className={forms.formGrid2}>
        <select name="track" defaultValue={defaults?.track ?? "policy"} className={ui.select} required>
          {TRACKS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          name="readingMinutes"
          type="number"
          min={1}
          defaultValue={defaults?.readingMinutes ?? 8}
          className={ui.input}
          title="Estimated reading time (minutes)"
        />
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
        <select name="status" defaultValue={defaults?.status ?? "draft"} className={ui.select}>
          <option value="draft">draft</option>
          <option value="scheduled">scheduled</option>
          <option value="published">published</option>
        </select>
        <label style={{ fontSize: "0.8125rem", fontWeight: 500, display: "grid", gap: "0.35rem" }}>
          Publish date &amp; time
          <input
            name="publishedAt"
            type="datetime-local"
            defaultValue={publishedLocal}
            className={ui.input}
            title="When the piece goes live on www/research (required for scheduled; defaults to now when you set status to published)."
          />
        </label>
      </div>
      <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", margin: "-0.25rem 0 0" }}>
        Publishing requires a byline. Drafts do not appear on www/research.
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
