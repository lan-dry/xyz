"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";

import styles from "./contact-form.module.css";

export function RequestAccessForm() {
  const gotchaRef = useRef<HTMLInputElement>(null);
  const [workEmail, setWorkEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [useCase, setUseCase] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setFeedback(null);
      if (gotchaRef.current?.value?.trim()) {
        setStatus("success");
        setFeedback("Request received. We will email you when your sandbox is ready.");
        return;
      }
      setStatus("loading");
      try {
        const res = await fetch("/api/access-request", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            work_email: workEmail,
            company,
            role,
            country,
            use_case: useCase,
            website: "",
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (res.ok && data.ok) {
          setStatus("success");
          setFeedback(data.message ?? "Request received. We will email you when your sandbox is ready.");
          setWorkEmail("");
          setCompany("");
          setRole("");
          setCountry("");
          setUseCase("");
          return;
        }
        setStatus("error");
        setFeedback(data.message ?? data.error ?? "Could not send the request.");
      } catch {
        setStatus("error");
        setFeedback("Network error. Try again in a moment.");
      }
    },
    [workEmail, company, role, country, useCase],
  );

  const disabled =
    status === "loading" ||
    !workEmail.trim() ||
    !company.trim() ||
    !role.trim() ||
    !country.trim() ||
    useCase.trim().length < 8;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.honeypot} aria-hidden="true">
        <label htmlFor="access-website">Website</label>
        <input ref={gotchaRef} id="access-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Work email</span>
        <input
          className={styles.input}
          type="email"
          required
          autoComplete="email"
          value={workEmail}
          onChange={(e) => setWorkEmail(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Company</span>
        <input
          className={styles.input}
          type="text"
          required
          maxLength={120}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Role</span>
        <input
          className={styles.input}
          type="text"
          required
          maxLength={80}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Country</span>
        <input
          className={styles.input}
          type="text"
          required
          maxLength={80}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Use case</span>
        <textarea
          className={styles.textarea}
          required
          rows={4}
          maxLength={2000}
          value={useCase}
          onChange={(e) => setUseCase(e.target.value)}
        />
      </label>
      <button className={styles.submit} type="submit" disabled={disabled}>
        {status === "loading" ? "Sending…" : "Request access"}
      </button>
      {feedback ? (
        <p
          className={`${styles.feedback} ${status === "error" ? styles.feedbackError : styles.feedbackSuccess}`}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
      <p className={styles.feedback}>Personal email domains such as Gmail are not accepted. Sandboxes use synthetic data only.</p>
    </form>
  );
}
