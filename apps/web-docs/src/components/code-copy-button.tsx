"use client";

import { useState } from "react";

type Props = {
  raw: string;
};

export function CodeCopyButton({ raw }: Props) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="code-copy"
      onClick={() => {
        void navigator.clipboard.writeText(raw.trim()).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
