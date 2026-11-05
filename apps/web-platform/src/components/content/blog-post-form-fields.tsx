"use client";

import Link from "next/link";
import { useState } from "react";

import { BlogMediaUpload } from "@/components/content/blog-media-upload";
import { ui } from "@/components/ops-ui/ops-ui";

import forms from "./content-forms.module.css";

type Props = {
  defaults?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    tags?: string[];
    status?: "draft" | "published";
    publishedAt?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    coverImageUrl?: string | null;
  };
  defaultAuthorEmail?: string;
  bodyMarkdown: string;
};

export function BlogPostFormFields({
  defaults,
  defaultAuthorEmail,
  bodyMarkdown,
}: Props) {
  const [coverImageUrl, setCoverImageUrl] = useState(defaults?.coverImageUrl ?? "");
  const [body, setBody] = useState(bodyMarkdown);

  const publishedLocal =
    defaults?.publishedAt && defaults.status === "published"
      ? new Date(defaults.publishedAt).toISOString().slice(0, 16)
      : "";

  return (
    <>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Title</span>
        <input name="title" defaultValue={defaults?.title ?? ""} className={ui.input} required />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Slug</span>
        <input
          name="slug"
          defaultValue={defaults?.slug ?? ""}
          placeholder="governed-refunds"
          className={ui.input}
          required
        />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Excerpt</span>
        <textarea
          name="excerpt"
          defaultValue={defaults?.excerpt ?? ""}
          rows={2}
          className={ui.textarea}
          required
        />
      </label>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Body</span>
        <textarea
          name="bodyMarkdown"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className={`${ui.textarea} ${forms.body}`}
          required
        />
        <span className={forms.hint}>Markdown is supported.</span>
      </label>
      <BlogMediaUpload
        onUploaded={(path) => {
          setBody((prev) => `${prev.trimEnd()}\n\n![Image](${path})\n`);
        }}
      />
      <p className={forms.hint}>
        The public byline is{" "}
        <Link href="/content/authors" className={ui.tableLink}>
          My public profile
        </Link>
        . Name, title, photo, and links are not entered on this form.
      </p>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Tags</span>
        <input
          name="tags"
          defaultValue={defaults?.tags?.join(", ") ?? ""}
          placeholder="governance, payments"
          className={ui.input}
        />
        <span className={forms.hint}>Comma-separated. Shown on the article.</span>
      </label>
      <div className={forms.formGrid2}>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>Status</span>
          <select name="status" defaultValue={defaults?.status ?? "draft"} className={ui.select}>
            <option value="draft">Draft</option>
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
          <span className={forms.hint}>A future date keeps the post off the public site until then.</span>
        </label>
      </div>
      <label className={forms.field}>
        <span className={forms.fieldLabel}>Cover image</span>
        <input
          name="coverImageUrl"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="/blog/media/…"
          className={ui.input}
        />
      </label>
      <BlogMediaUpload onUploaded={(path) => setCoverImageUrl(path)} />
      <details className={forms.seo}>
        <summary>SEO</summary>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>SEO title</span>
          <input name="seoTitle" defaultValue={defaults?.seoTitle ?? ""} className={ui.input} />
        </label>
        <label className={forms.field}>
          <span className={forms.fieldLabel}>SEO description</span>
          <textarea
            name="seoDescription"
            defaultValue={defaults?.seoDescription ?? ""}
            rows={3}
            className={ui.textarea}
          />
        </label>
      </details>
      {defaultAuthorEmail ? (
        <p className={forms.hint}>Saved under your account ({defaultAuthorEmail}).</p>
      ) : null}
    </>
  );
}
