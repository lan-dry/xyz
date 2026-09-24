"use client";

import { useState } from "react";

import { uploadBlogMedia } from "@/app/(ops)/content/blog/actions";

export function BlogMediaUpload({ onUploaded }: { onUploaded: (publicPath: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <label style={{ fontSize: "0.8125rem", fontWeight: 500 }}>
        Upload image or video
        <input
          type="file"
          accept="image/*,video/mp4,video/webm"
          style={{ display: "block", marginTop: "0.25rem", fontSize: "0.8125rem" }}
          disabled={pending}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setPending(true);
            setError(null);
            try {
              const fd = new FormData();
              fd.set("file", file);
              const result = await uploadBlogMedia(fd);
              onUploaded(result.publicPath);
              e.target.value = "";
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setPending(false);
            }
          }}
        />
      </label>
      {pending ? <p style={{ fontSize: "0.75rem", color: "var(--console-fg-muted)" }}>Uploading…</p> : null}
      {error ? <p style={{ fontSize: "0.75rem", color: "var(--console-danger)" }}>{error}</p> : null}
    </div>
  );
}
