"use client";

import { Check, Copy, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";

import type { RedactionManifestEntry } from "@/lib/stoa-client";

import styles from "./message-privacy.module.css";

const NOUNS: Record<string, [string, string]> = {
  email: ["email", "emails"],
  phone: ["phone number", "phone numbers"],
  payment_card: ["card number", "card numbers"],
  account_number: ["account or reference number", "account or reference numbers"],
  iban: ["IBAN", "IBANs"],
  national_id: ["ID number", "ID numbers"],
  ipv4: ["IP address", "IP addresses"],
  api_secrets: ["secret key", "secret keys"],
  person: ["name", "names"],
  address: ["address", "addresses"],
  date_of_birth: ["date of birth", "dates of birth"],
  custom_term: ["confidential word", "confidential words"],
  custom_pattern: ["protected item", "protected items"],
};

function describeManifest(
  manifest: RedactionManifestEntry[] | undefined,
  fallbackCount: number,
): string {
  const parts = (manifest ?? [])
    .filter((e) => e.count > 0)
    .map((e) => {
      const [one, many] = NOUNS[e.group] ?? [e.label, e.label];
      return `${e.count} ${e.count === 1 ? one : many}`;
    });
  if (parts.length === 0) {
    return `${fallbackCount} item${fallbackCount === 1 ? "" : "s"}`;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const PLACEHOLDER_SPLIT =
  /(\\?\[\s*[A-Z][A-Z0-9_]*_(?:\d+|WITHHELD)\s*\\?\]|\[REDACTED_[A-Z_]+\](?::\d+)?)/g;

/** Render upstream text with every placeholder visibly marked. */
export function HighlightedUpstream({ text }: { text: string }): ReactNode {
  const parts = text.split(PLACEHOLDER_SPLIT);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className={styles.placeholder}>
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function UserPrivacyStrip({
  redactionCount,
  manifest,
  upstream,
  providerLabel,
}: {
  redactionCount: number;
  manifest?: RedactionManifestEntry[];
  upstream?: string;
  providerLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (redactionCount <= 0) {
    return null;
  }
  const summary = describeManifest(manifest, redactionCount);
  return (
    <div className={styles.strip}>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!upstream}
        title={upstream ? "Show what the AI received" : undefined}
      >
        <ShieldCheck size={13} aria-hidden />
        <span>
          {summary} kept private
        </span>
        {upstream ? (
          open ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />
        ) : null}
      </button>
      {open && upstream ? (
        <div className={styles.proof}>
          <p className={styles.proofTitle}>
            Exactly what {providerLabel} received
          </p>
          <div className={styles.proofBody}>
            <HighlightedUpstream text={upstream} />
          </div>
          <p className={styles.proofFoot}>
            The highlighted values never left your organization. They are stored
            encrypted and shown only to you.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function AssistantActions({
  content,
  upstream,
  restoredCount,
}: {
  content: string;
  upstream?: string;
  restoredCount?: number;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const restored = restoredCount ?? 0;
  return (
    <div className={styles.assistantActions}>
      <div className={styles.actionRow}>
        <button type="button" className={styles.action} onClick={() => void copy()}>
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
        {restored > 0 && upstream ? (
          <button
            type="button"
            className={styles.restoredChip}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title="Show the reply exactly as the model wrote it"
          >
            <ShieldCheck size={13} aria-hidden />
            {restored} private value{restored === 1 ? "" : "s"} restored for you
            {open ? <EyeOff size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
          </button>
        ) : null}
      </div>
      {open && upstream ? (
        <div className={styles.proof}>
          <p className={styles.proofTitle}>Reply as written by the model</p>
          <div className={styles.proofBody}>
            <HighlightedUpstream text={upstream} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
