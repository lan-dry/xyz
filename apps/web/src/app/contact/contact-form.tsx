"use client";

import { useCallback, useState, type FormEvent } from "react";

type ContactReason = "design_partner" | "press" | "careers" | "security";

const REASON_LABELS: Record<ContactReason, string> = {
  design_partner: "Design partner",
  press: "Press",
  careers: "Careers",
  security: "Security disclosure",
};

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [reason, setReason] = useState<ContactReason>("design_partner");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFeedback(null);
      setSubmittedId(null);
      setStatus("loading");

      let sourcePath = "/contact";
      if (typeof window !== "undefined") {
        sourcePath = `${window.location.pathname}${window.location.search || ""}`;
      }

      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            organization: organization.trim() || undefined,
            role: senderRole.trim() || undefined,
            reason,
            message,
            sourcePath,
            website: honeypot,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          id?: string;
        };

        if (res.status === 201 && data.id) {
          setStatus("success");
          setSubmittedId(data.id);
          setFeedback("Thanks — we received your message.");
          setMessage("");
          return;
        }

        if (res.status === 429) {
          setStatus("error");
          setFeedback(
            data.error || "Too many submissions. Please try again later.",
          );
          return;
        }

        setStatus("error");
        setFeedback(data.error || "Something went wrong. Please try again.");
      } catch {
        setStatus("error");
        setFeedback("Network error. Check your connection and try again.");
      }
    },
    [name, email, organization, senderRole, reason, message, honeypot],
  );

  const disabled =
    status === "loading" || !name.trim() || !email.trim() || !message.trim();

  return (
    <form className="mt-10 max-w-lg space-y-4" onSubmit={onSubmit} noValidate>
      <p className="sr-only" aria-hidden>
        Leave the next field empty.
      </p>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-ink">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label
          htmlFor="organization"
          className="block text-sm font-medium text-ink"
        >
          Organization <span className="text-ink/60">(optional)</span>
        </label>
        <input
          id="organization"
          name="organization"
          type="text"
          maxLength={200}
          autoComplete="organization"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label htmlFor="role" className="block text-sm font-medium text-ink">
          Title / role <span className="text-ink/60">(optional)</span>
        </label>
        <input
          id="role"
          name="role"
          type="text"
          maxLength={120}
          autoComplete="organization-title"
          value={senderRole}
          onChange={(e) => setSenderRole(e.target.value)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label htmlFor="reason" className="block text-sm font-medium text-ink">
          Reason
        </label>
        <select
          id="reason"
          name="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value as ContactReason)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        >
          {(Object.keys(REASON_LABELS) as ContactReason[]).map((value) => (
            <option key={value} value={value}>
              {REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-ink">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          maxLength={12000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded border border-ink/20 bg-bone px-3 py-2 text-ink"
        />
      </div>

      {feedback && (
        <p
          className={`text-sm ${
            status === "success" ? "text-teal" : "text-red-700"
          }`}
          role={status === "error" ? "alert" : "status"}
        >
          {feedback}
          {submittedId ? ` Reference: ${submittedId.slice(0, 8)}…` : null}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className={`rounded px-4 py-2 text-bone transition ${
          disabled
            ? "cursor-not-allowed bg-teal/50 opacity-70"
            : "bg-teal hover:opacity-95"
        }`}
      >
        {status === "loading" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
