"use client";

import { useState } from "react";

import styles from "./newsletter-signup.module.css";

type Props = {
  /** `inline` = email + Subscribe in one row (pre-footer band). */
  layout?: "compact" | "inline";
};

export function NewsletterSignup({ layout = "compact" }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "website_footer" }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Could not subscribe.");
        return;
      }
      setStatus("ok");
      setMessage(data.message ?? "Check your email to confirm.");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("Network error. Try again.");
    }
  }

  const formClass = layout === "inline" ? styles.formInline : styles.form;

  return (
    <div className={layout === "compact" ? styles.compact : undefined}>
      {layout === "compact" ? (
        <>
          <h4>Updates</h4>
          <p className={styles.lead}>Research and product notes — double opt-in, unsubscribe anytime.</p>
        </>
      ) : null}
      <form onSubmit={onSubmit} className={formClass}>
        <label className="sr-only" htmlFor="newsletter-email">
          Email
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          required
          disabled={status === "loading"}
          className={styles.input}
        />
        <button type="submit" className={styles.btn} disabled={status === "loading"}>
          {status === "loading" ? "…" : "Subscribe"}
        </button>
        <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className={styles.trap} aria-hidden />
      </form>
      {message ? (
        <p className={status === "error" ? styles.error : styles.ok} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
