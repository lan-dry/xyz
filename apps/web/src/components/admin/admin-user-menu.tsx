"use client";

import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Home, Moon } from "lucide-react";

import {
  applyConsoleTheme,
  readStoredConsoleTheme,
  resolveConsoleTheme,
  toggleConsoleTheme,
  type ConsoleTheme,
} from "@/lib/console/theme";

export function AdminUserMenu({
  email,
  role,
  readOnly,
  initials,
  collapsed,
  signOutControl,
}: {
  email: string;
  role: string;
  readOnly?: boolean;
  initials: string;
  collapsed: boolean;
  signOutControl: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ConsoleTheme>("light");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initial = readStoredConsoleTheme() ?? resolveConsoleTheme();
    applyConsoleTheme(initial);
    setTheme(initial);
  }, []);

  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (open) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (event.key.toLowerCase() === "m" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        const next = toggleConsoleTheme();
        setTheme(next);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleToggleTheme() {
    const next = toggleConsoleTheme();
    setTheme(next);
    setOpen(false);
  }

  return createElement(
    "div",
    { ref: wrapRef, className: "relative" },
    createElement(
      "button",
      {
        type: "button",
        onClick: () => setOpen((value) => !value),
        className: `flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors duration-150 hover:bg-[var(--admin-surface-hover)] ${
          collapsed ? "justify-center" : ""
        }`.trim(),
      },
      createElement(
        "span",
        {
          className:
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--admin-surface-muted)] text-xs font-semibold text-[var(--admin-fg-muted)]",
        },
        initials,
      ),
      !collapsed
        ? createElement(
            "span",
            { className: "min-w-0 flex-1 truncate text-xs text-[var(--admin-fg-subtle)]" },
            email,
          )
        : null,
    ),
    open
      ? createElement(
          "div",
          {
            className: `absolute z-30 min-w-52 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-1 shadow-xl ${
              collapsed ? "bottom-10 left-0" : "bottom-full left-0 mb-2"
            }`.trim(),
          },
          createElement(
            "div",
            { className: "px-3 py-2" },
            createElement("p", { className: "text-xs text-[var(--admin-fg-subtle)]" }, email),
            createElement(
              "p",
              { className: "mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--admin-fg-muted)]" },
              `${role}${readOnly ? " · read-only" : ""}`,
            ),
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: handleToggleTheme,
              className:
                "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--admin-fg)] transition-colors duration-150 hover:bg-[var(--admin-surface-hover)]",
            },
            createElement(Moon, { className: "h-4 w-4 text-[var(--admin-fg-subtle)]" }),
            createElement("span", { className: "flex-1" }, theme === "dark" ? "Light mode" : "Dark mode"),
            createElement(
              "kbd",
              {
                className:
                  "rounded border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--admin-fg-subtle)]",
              },
              "M",
            ),
          ),
          createElement(
            Link,
            {
              href: "/",
              className:
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--admin-fg)] no-underline hover:bg-[var(--admin-surface-hover)]",
              onClick: () => setOpen(false),
            },
            createElement(Home, { className: "h-4 w-4 text-[var(--admin-fg-subtle)]" }),
            createElement("span", null, "Salanor homepage"),
          ),
          createElement("div", { className: "my-1 border-t border-[var(--admin-border-subtle)]" }),
          createElement(
            "div",
            {
              className:
                "px-1 py-1 [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:text-sm [&_button]:text-[var(--admin-fg)] [&_button]:hover:bg-[var(--admin-surface-hover)]",
            },
            signOutControl,
          ),
        )
      : null,
  );
}
