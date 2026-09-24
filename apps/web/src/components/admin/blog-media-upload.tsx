"use client";

import { useState } from "react";

import { uploadBlogMedia } from "@/app/(admin)/admin/blog/actions";

export function BlogMediaUpload({ onUploaded }: { onUploaded: (publicPath: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <label className="text-sm font-medium text-[var(--admin-fg)]">
        Upload image or video
        <input
          type="file"
          accept="image/*,video/mp4,video/webm"
          className="mt-1 block w-full text-sm"
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
      {pending ? <p className="text-sm text-[var(--admin-fg-subtle)]">Uploading…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
