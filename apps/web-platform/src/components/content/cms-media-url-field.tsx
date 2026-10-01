"use client";

import { useState } from "react";

import { removeBlogMediaNow } from "@/app/(ops)/content/blog/media-actions";
import { BlogMediaUpload } from "@/components/content/blog-media-upload";
import { ui } from "@/components/ops-ui/ops-ui";

type Props = {
  name: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** When set, immediate delete checks refs excluding this research post (edit flow). */
  excludeResearchId?: string;
  excludeOpenRoleId?: string;
};

export function CmsMediaUrlField({
  name,
  label,
  value,
  onChange,
  placeholder = "/blog/media/…",
  excludeResearchId,
  excludeOpenRoleId,
}: Props) {
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const isBlogMedia = value.trim().startsWith("/blog/media/");

  return (
    <div style={{ display: "grid", gap: "0.5rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
        {label}
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem", flexWrap: "wrap" }}>
          <input
            name={name}
            value={value}
            onChange={(e) => {
              setRemoveError(null);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
            className={ui.input}
            style={{ flex: "1 1 12rem", minWidth: 0 }}
          />
          {value.trim() ? (
            <button
              type="button"
              className={`${ui.btn} ${ui.btnGhost}`}
              disabled={removing}
              onClick={async () => {
                const path = value.trim();
                if (path.startsWith("/blog/media/")) {
                  setRemoving(true);
                  setRemoveError(null);
                  try {
                    await removeBlogMediaNow(path, { excludeResearchId, excludeOpenRoleId });
                  } catch (err) {
                    setRemoveError(err instanceof Error ? err.message : "Could not remove file");
                    return;
                  } finally {
                    setRemoving(false);
                  }
                }
                onChange("");
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </button>
          ) : null}
        </div>
      </label>
      {isBlogMedia ? (
        <img
          src={value}
          alt=""
          style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, objectFit: "cover" }}
        />
      ) : null}
      {removeError ? (
        <p style={{ fontSize: "0.75rem", color: "var(--console-danger)", margin: 0 }}>{removeError}</p>
      ) : (
        <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)", margin: 0 }}>
          Remove deletes the file when it is not used elsewhere. Saving the post also cleans unused uploads.
        </p>
      )}
      <BlogMediaUpload onUploaded={(path) => onChange(path)} />
    </div>
  );
}
