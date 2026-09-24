"use client";

import { useState } from "react";

import { BlogMediaUpload } from "@/components/admin/blog-media-upload";

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

export function BlogPostFormFields({ defaults, defaultAuthorName, defaultAuthorEmail, bodyMarkdown }: Props) {
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
        className="admin-input w-full"
        required
      />
      <input
        name="slug"
        defaultValue={defaults?.slug ?? ""}
        placeholder="slug (URL)"
        className="admin-input w-full"
        required
      />
      <textarea
        name="excerpt"
        defaultValue={defaults?.excerpt ?? ""}
        placeholder="Excerpt"
        rows={2}
        className="admin-textarea w-full resize-y"
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="authorName"
          defaultValue={defaults?.authorName ?? defaultAuthorName ?? ""}
          placeholder="Public author name"
          className="admin-input w-full"
          required
        />
        <input
          name="authorRole"
          defaultValue={defaults?.authorRole ?? ""}
          placeholder="Author role (optional)"
          className="admin-input w-full"
        />
      </div>
      <input
        name="tags"
        defaultValue={defaults?.tags?.join(", ") ?? ""}
        placeholder="Tags (comma-separated)"
        className="admin-input w-full"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <select name="status" defaultValue={defaults?.status ?? "draft"} className="admin-select w-full">
          <option value="draft">draft (unpublished)</option>
          <option value="published">published</option>
        </select>
        <input
          name="publishedAt"
          type="datetime-local"
          defaultValue={publishedLocal}
          className="admin-input w-full"
        />
        <input
          name="coverImageUrl"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="Cover image URL (/blog/media/…)"
          className="admin-input w-full"
        />
      </div>
      <BlogMediaUpload
        onUploaded={(path) => {
          setCoverImageUrl(path);
        }}
      />
      <details className="text-sm text-[var(--admin-fg-subtle)]">
        <summary className="cursor-pointer font-medium text-[var(--admin-fg)]">SEO (optional)</summary>
        <div className="mt-2 grid gap-2">
          <input
            name="seoTitle"
            defaultValue={defaults?.seoTitle ?? ""}
            placeholder="SEO title"
            className="admin-input w-full"
          />
          <textarea
            name="seoDescription"
            defaultValue={defaults?.seoDescription ?? ""}
            placeholder="SEO description"
            rows={2}
            className="admin-textarea w-full resize-y"
          />
        </div>
      </details>
      <label className="text-sm font-medium text-[var(--admin-fg)]">
        Body (Markdown)
        <textarea
          name="bodyMarkdown"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className="admin-textarea mt-1 w-full resize-y font-mono text-sm"
          required
        />
      </label>
      <BlogMediaUpload
        onUploaded={(path) => {
          const snippet = `\n\n![Image](${path})\n`;
          setBody((prev) => `${prev.trimEnd()}${snippet}`);
        }}
      />
      {defaultAuthorEmail ? (
        <p className="text-xs text-[var(--admin-fg-subtle)]">
          Saves record your staff email ({defaultAuthorEmail}) in Git frontmatter as editor audit.
        </p>
      ) : null}
    </>
  );
}
