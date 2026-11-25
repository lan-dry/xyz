"use client";

import { useState, type FormEvent } from "react";

export default function RequestAccessPage() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (String(form.get("website") ?? "").trim()) {
      setStatus("success");
      setFeedback("Request received. We will email you when your sandbox is ready.");
      return;
    }
    setStatus("loading");
    setFeedback(null);
    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          work_email: form.get("work_email"),
          company: form.get("company"),
          role: form.get("role"),
          country: form.get("country"),
          use_case: form.get("use_case"),
          website: "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && data.ok) {
        setStatus("success");
        setFeedback(data.message ?? "Request received. We will email you when your sandbox is ready.");
        e.currentTarget.reset();
        return;
      }
      setStatus("error");
      setFeedback(data.message ?? data.error ?? "Could not send the request.");
    } catch {
      setStatus("error");
      setFeedback("Network error. Try again in a moment.");
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-semibold text-ink">Request access</h1>
      <p className="mt-4 text-ink/90">
        Work email, company, role, and what you want to try. After approval we create a sandbox and
        send an admin invite. Synthetic data only.
      </p>
      <form className="mt-8 space-y-4" onSubmit={onSubmit}>
        <input className="hidden" name="website" tabIndex={-1} autoComplete="off" aria-hidden />
        <label className="block text-sm">
          Work email
          <input name="work_email" type="email" required className="mt-1 w-full rounded border border-ink/20 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Company
          <input name="company" required className="mt-1 w-full rounded border border-ink/20 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Role
          <input name="role" required className="mt-1 w-full rounded border border-ink/20 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Country
          <input name="country" required className="mt-1 w-full rounded border border-ink/20 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Use case
          <textarea name="use_case" required minLength={8} rows={4} className="mt-1 w-full rounded border border-ink/20 px-3 py-2" />
        </label>
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded bg-teal px-4 py-2 text-bone disabled:opacity-60"
        >
          {status === "loading" ? "Sending…" : "Request access"}
        </button>
        {feedback ? <p className="text-sm text-ink/90">{feedback}</p> : null}
      </form>
    </div>
  );
}
