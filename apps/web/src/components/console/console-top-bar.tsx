"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { consoleAegisPath } from "@/lib/app-paths";

import { consoleInkCtaClass } from "./console-cta";

export function ConsoleTopBar() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function sendFeedback() {
    const body = encodeURIComponent(message.trim() || "(no message)");
    window.location.href = `mailto:founders@salanor.com?subject=Aegis%20Console%20Feedback&body=${body}`;
    setOpen(false);
    setMessage("");
  }

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end border-b border-[var(--console-border)] bg-[var(--console-bg)]/95 px-6 backdrop-blur lg:px-10">
      <div className="flex items-center gap-4 text-sm text-[var(--console-fg-subtle)]">
        <div ref={wrapRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value);
            }}
            className="inline-flex h-8 items-center rounded-full border border-[var(--console-border)] bg-[var(--console-surface)] px-3 text-sm font-medium text-[var(--console-fg)] no-underline transition-colors duration-150 hover:bg-[var(--console-surface-hover)]"
          >
            Feedback
          </button>
          {open ? (
            <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)] p-4 shadow-xl">
              <p className="text-sm font-medium text-[var(--console-fg)]">Send feedback</p>
              <p className="mt-1 text-xs text-[var(--console-fg-subtle)]">Share bugs, ideas, or polish requests for the console.</p>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                    event.preventDefault();
                    sendFeedback();
                  }
                }}
                placeholder="What would make this better?"
                rows={4}
                className="console-input mt-3 w-full resize-none py-2"
              />
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-[var(--console-fg-subtle)]">Ctrl+Enter to send</span>
                <button
                  type="button"
                  onClick={sendFeedback}
                  disabled={!message.trim()}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${consoleInkCtaClass}`}
                >
                  Send
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <Link
          href={consoleAegisPath("/help")}
          className="text-[var(--console-fg-subtle)] no-underline transition-colors duration-150 hover:text-[var(--console-fg)]"
        >
          Help
        </Link>
        <Link
          href="/standards"
          className="text-[var(--console-fg-subtle)] no-underline transition-colors duration-150 hover:text-[var(--console-fg)]"
        >
          Docs
        </Link>
      </div>
    </div>
  );
}
