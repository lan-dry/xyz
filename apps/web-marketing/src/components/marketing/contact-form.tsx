"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import styles from "./contact-form.module.css";

type ContactReason =
  | "design_partner"
  | "investor"
  | "enterprise"
  | "press"
  | "security";

const REASON_LABELS: Record<ContactReason, string> = {
  design_partner: "Design partner",
  investor: "Investor / diligence",
  enterprise: "Enterprise evaluation",
  press: "Press",
  security: "Security disclosure",
};

export function ContactForm() {
  const gotchaRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [reason, setReason] = useState<ContactReason>("design_partner");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFeedback(null);

      if (gotchaRef.current?.value?.trim()) {
        setStatus("error");
        setFeedback("Something went wrong. Please try again or email partners@salanor.com.");
        return;
      }

      setStatus("loading");

      const sourcePath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search || ""}`
          : "/contact";

      try {
        const payload: Record<string, string> = {
          name,
          email,
          reason,
          message,
          sourcePath,
        };
        if (organization.trim()) payload.organization = organization.trim();
        if (senderRole.trim()) payload.role = senderRole.trim();

        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string };

        if (res.status === 201 && data.id) {
          setStatus("success");
          setFeedback("Thank you — we received your message and will respond within two business days.");
          setName("");
          setEmail("");
          setOrganization("");
          setSenderRole("");
          setMessage("");
          return;
        }

        setStatus("error");
        setFeedback(data.error ?? "Something went wrong. Please try again or email partners@salanor.com.");
      } catch {
        setStatus("error");
        setFeedback("Network error. Email partners@salanor.com directly.");
      }
    },
    [name, email, organization, senderRole, reason, message],
  );

  const disabled =
    status === "loading" || !name.trim() || !email.trim() || message.trim().length < 5;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="contact-gotcha">Leave blank</label>
        <input
          ref={gotchaRef}
          id="contact-gotcha"
          name="_gotcha"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Name</span>
        <input
          className={styles.input}
          type="text"
          required
          maxLength={120}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Work email</span>
        <input
          className={styles.input}
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          Organization <span className={styles.optional}>(optional)</span>
        </span>
        <input
          className={styles.input}
          type="text"
          maxLength={200}
          autoComplete="organization"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>
          Title <span className={styles.optional}>(optional)</span>
        </span>
        <input
          className={styles.input}
          type="text"
          maxLength={120}
          autoComplete="organization-title"
          value={senderRole}
          onChange={(e) => setSenderRole(e.target.value)}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Topic</span>
        <select
          className={styles.select}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value as ContactReason)}
        >
          {(Object.keys(REASON_LABELS) as ContactReason[]).map((value) => (
            <option key={value} value={value}>
              {REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Message</span>
        <textarea
          className={styles.textarea}
          required
          rows={5}
          maxLength={12000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us about your agents, compliance timeline, or diligence questions."
        />
      </label>

      {feedback ? (
        <p
          className={`${styles.feedback} ${status === "success" ? styles.feedbackSuccess : styles.feedbackError}`}
          role={status === "error" ? "alert" : "status"}
        >
          {feedback}
        </p>
      ) : null}

      <button type="submit" className={styles.submit} disabled={disabled}>
        {status === "loading" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
