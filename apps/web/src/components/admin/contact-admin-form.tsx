"use client";

import { useState } from "react";

import { adminInkCtaClass } from "@/components/admin/admin-cta";
import { ADMIN_CONTACT_STATUSES, type AdminContactStatus } from "@/lib/admin/contact-status";

export function ContactAdminForm({
  id,
  initialStatus,
  initialNotes,
  readOnly = false,
}: {
  id: string;
  initialStatus: AdminContactStatus;
  initialNotes: string;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<AdminContactStatus>(initialStatus);
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="admin-surface space-y-4 p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (readOnly) return;
        setSaving(true);
        setMessage(null);
        try {
          const res = await fetch(`/api/admin/contacts/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ status, adminNotes: notes }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: string };
            setMessage(data.error ?? "Failed to save");
            return;
          }
          setMessage("Saved");
        } finally {
          setSaving(false);
        }
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--admin-fg)]" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          className="admin-select w-full"
          value={status}
          disabled={readOnly}
          onChange={(e) => setStatus(e.target.value as AdminContactStatus)}
        >
          {ADMIN_CONTACT_STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-[var(--admin-fg)]" htmlFor="admin-notes">
          Internal notes
        </label>
        <textarea
          id="admin-notes"
          className="admin-textarea w-full resize-y"
          rows={6}
          value={notes}
          readOnly={readOnly}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {!readOnly ? (
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex h-9 items-center px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${adminInkCtaClass}`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {message ? <span className="text-sm text-[var(--admin-fg-subtle)]">{message}</span> : null}
        </div>
      ) : (
        <p className="text-sm text-[var(--admin-fg-subtle)]">Read-only — your role cannot update contact triage.</p>
      )}
    </form>
  );
}
