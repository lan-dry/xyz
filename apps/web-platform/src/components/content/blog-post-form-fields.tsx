"use client";

import { useState } from "react";

import { BlogMediaUpload } from "@/components/content/blog-media-upload";
import { ui } from "@/components/ops-ui/ops-ui";

import forms from "./content-forms.module.css";

type Props = {
  defaults?: {
    title?: string;
    slug?: string;
    excerpt?: string;
    authorName?: string;
    authorRole?: string | null;
    tags?: string[];
    status?: "draft" | "published";
    publishedAt?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    coverImageUrl?: string | null;
  };
  defaultAuthorName?: string;
  defaultAuthorEmail?: string;
  bodyMarkdown: string;
};

export function BlogPostFormFields({
  defaults,
  defaultAuthorName,
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
      <input
        name="title"
        defaultValue={defaults?.title ?? ""}
        placeholder="Title"
        className={ui.input}
        required
      />
      <input
        name="slug"
        defaultValue={defaults?.slug ?? ""}
        placeholder="slug (URL)"
        className={ui.input}
        required
      />
      <textarea
        name="excerpt"
        defaultValue={defaults?.excerpt ?? ""}
        placeholder="Excerpt"
        rows={2}
        className={ui.textarea}
        required
      />
      <div className={forms.formGrid2}>
        <input
          name="authorName"
          defaultValue={defaults?.authorName ?? defaultAuthorName ?? ""}
          placeholder="Public author name"
          className={ui.input}
          required
        />
        <input
          name="authorRole"
          defaultValue={defaults?.authorRole ?? ""}
          placeholder="Author role (optional)"
          className={ui.input}
        />
      </div>
      <input
        name="tags"
        defaultValue={defaults?.tags?.join(", ") ?? ""}
        placeholder="Tags (comma-separated)"
        className={ui.input}
      />
      <div className={`${forms.formGrid3} ${forms.formGrid2}`}>
        <select name="status" defaultValue={defaults?.status ?? "draft"} className={ui.select}>
          <option value="draft">draft (unpublished)</option>
          <option value="published">published</option>
        </select>
        <input
          name="publishedAt"
          type="datetime-local"
          defaultValue={publishedLocal}
          className={ui.input}
        />
        <input
          name="coverImageUrl"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="Cover image URL (/blog/media/…)"
          className={ui.input}
        />
      </div>
      <BlogMediaUpload onUploaded={(path) => setCoverImageUrl(path)} />
      <details style={{ fontSize: "0.8125rem", color: "var(--console-fg-muted)" }}>
        <summary style={{ cursor: "pointer", fontWeight: 500, color: "var(--console-fg)" }}>
          SEO (optional)
        </summary>
        <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.5rem" }}>
          <input name="seoTitle" defaultValue={defaults?.seoTitle ?? ""} placeholder="SEO title" className={ui.input} />
          <textarea
            name="seoDescription"
            defaultValue={defaults?.seoDescription ?? ""}
            placeholder="SEO description"
            rows={2}
            className={ui.textarea}
          />
        </div>
      </details>
      <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
        Body (Markdown)
        <textarea
          name="bodyMarkdown"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className={ui.textarea}
          style={{ marginTop: "0.35rem", fontFamily: "ui-monospace, monospace", fontSize: "0.8125rem" }}
          required
        />
      </label>
      <BlogMediaUpload
        onUploaded={(path) => {
          setBody((prev) => `${prev.trimEnd()}\n\n![Image](${path})\n`);
        }}
      />
      {defaultAuthorEmail ? (
        <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>
          Git frontmatter records editor audit ({defaultAuthorEmail}).
        </p>
      ) : null}
    </>
  );
}
