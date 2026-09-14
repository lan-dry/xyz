"use client";

import { useEffect, useState } from "react";

import btn from "./buttons.module.css";
import { consoleAppUrl } from "@/lib/site-urls";

type SessionState = "loading" | "signed-in" | "signed-out";

/**
 * Uses same-origin /api/id/auth/me (Next rewrite → Salanor ID).
 * With SESSION_COOKIE_DOMAIN=.salanor.com, login on app.* is visible on marketing host.
 */
export function ConsoleNavLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const [state, setState] = useState<SessionState>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/id/auth/me", { credentials: "include" });
        if (!cancelled) {
          setState(res.ok ? "signed-in" : "signed-out");
        }
      } catch {
        if (!cancelled) setState("signed-out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const href = consoleAppUrl();
  const label = state === "signed-in" ? "Console" : "Sign in";
  const cls = `${btn.btnGhost} ${btn.btnGhostNav} ${className ?? ""}`.trim();

  if (state === "loading") {
    return (
      <span className={cls} style={{ opacity: 0.6 }} aria-hidden>
        Console
      </span>
    );
  }

  return (
    <a href={href} className={cls} onClick={onClick}>
      {label}
    </a>
  );
}
