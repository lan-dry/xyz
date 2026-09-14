"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/console/button";
import { consoleAegisPath } from "@/lib/app-paths";
import { isValidOrganizationSlug, slugifyOrganizationSlug } from "@/lib/console/orgs";

type CreateOrganizationFormProps = {
  variant?: "page" | "modal";
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function CreateOrganizationForm({
  variant = "page",
  onSuccess,
  onCancel,
}: CreateOrganizationFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedSlug = slugifyOrganizationSlug(slug || name);
  const slugValid = isValidOrganizationSlug(normalizedSlug);
  const isModal = variant === "modal";
  const inputClass = isModal
    ? "console-input mt-1 w-full"
    : "mt-1 block w-full rounded-lg border border-black/10 px-3 py-2 focus:border-teal focus:outline-none";
  const slugInputClass = isModal
    ? "console-input mt-1 w-full font-mono text-sm"
    : "mt-1 block w-full rounded-lg border border-black/10 px-3 py-2 font-mono text-sm focus:border-teal focus:outline-none";

  return (
    <form
      className={isModal ? "space-y-4" : "space-y-4 rounded-xl border border-black/10 bg-white p-5"}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await fetch("/api/console/orgs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, slug: normalizedSlug }),
          });

          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            setError(payload.error ?? "Unable to create organization");
            return;
          }

          setName("");
          setSlug("");
          setSlugTouched(false);
          router.refresh();
          if (onSuccess) {
            onSuccess();
          } else {
            router.push(consoleAegisPath());
          }
        });
      }}
    >
      <div>
        <label className={`block text-sm ${isModal ? "text-gray-600" : "text-ink/80"}`}>
          Organization name
          <input
            className={inputClass}
            value={name}
            onChange={(e) => {
              const nextName = e.target.value;
              setName(nextName);
              if (!slugTouched) {
                setSlug(slugifyOrganizationSlug(nextName));
              }
            }}
            placeholder="Acme Security"
            required
          />
        </label>
      </div>

      <div>
        <label className={`block text-sm ${isModal ? "text-gray-600" : "text-ink/80"}`}>
          Organization slug
          <input
            className={slugInputClass}
            value={slug}
            onChange={(e) => {
              const next = e.target.value;
              setSlug(next);
              setSlugTouched(next.trim().length > 0);
            }}
            placeholder="acme-security"
            required
          />
        </label>
        <div className="mt-1 flex items-center justify-between text-xs">
          <p className={slugValid ? "text-emerald-700" : "text-red-700"}>
            {slugValid
              ? `Slug preview: ${normalizedSlug}`
              : "Slug must be 3-48 chars using lowercase letters, numbers, and hyphens."}
          </p>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              const synced = slugifyOrganizationSlug(name);
              setSlug(synced);
              setSlugTouched(false);
            }}
          >
            Sync from name
          </Button>
        </div>
      </div>

      {error ? <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div className={`flex items-center gap-3 ${isModal ? "justify-end" : ""}`}>
        {isModal && onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending || !slugValid}>
          Create organization
        </Button>
      </div>
    </form>
  );
}
