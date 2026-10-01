"use client";

import { useState } from "react";

import { BlogMediaUpload } from "@/components/content/blog-media-upload";
import { ui } from "@/components/ops-ui/ops-ui";

type Props = {
  name: string;
  label: string;
  defaultValue?: string;
  rows?: number;
  required?: boolean;
  hint?: string;
  researchId?: string;
  openRoleId?: string;
};

/** Same authoring model as blog: Markdown + images under /blog/media/ (Git deploy). */
export function CmsMarkdownField({
  name,
  label,
  defaultValue = "",
  rows = 20,
  required = true,
  hint,
  researchId,
  openRoleId,
}: Props) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
        {label}
        <textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={rows}
          className={ui.textarea}
          style={{
            marginTop: "0.35rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "0.8125rem",
            lineHeight: 1.55,
          }}
          required={required}
        />
      </label>
      {hint ? (
        <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", margin: 0 }}>{hint}</p>
      ) : (
        <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", margin: 0 }}>
          Use Markdown: ## headings, lists, **bold**, code blocks, and{" "}
          <code>![caption](/blog/media/your-file.png)</code> after upload below.
        </p>
      )}
      <BlogMediaUpload
        onUploaded={(path) => {
          setValue((prev) => `${prev.trimEnd()}\n\n![Image](${path})\n`);
        }}
      />
      {researchId || openRoleId ? (
        <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", margin: 0 }}>
          Deleting an image line from Markdown and saving removes the file if nothing else references it.
        </p>
      ) : null}
    </div>
  );
}
