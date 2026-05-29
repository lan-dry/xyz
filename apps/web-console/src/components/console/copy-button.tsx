"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { ui } from "./console-ui";

export function CopyButton({
  text,
  label = "Copy",
  iconOnly = false,
  className,
}: {
  text: string;
  label?: string;
  /** Icon only — for tight layouts beside secrets */
  iconOnly?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback ignored */
    }
  }

  return (
    <button
      type="button"
      className={`${ui.btn} ${ui.btnSecondary} ${iconOnly ? ui.btnIcon : ""} ${className ?? ""}`}
      onClick={() => void copy()}
      title={iconOnly ? (copied ? "Copied" : label || "Copy") : label}
      aria-label={iconOnly ? label || "Copy" : undefined}
    >
      {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {iconOnly ? null : copied ? "Copied" : label}
    </button>
  );
}
