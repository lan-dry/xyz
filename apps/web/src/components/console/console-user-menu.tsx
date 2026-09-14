"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Home, Moon, User } from "lucide-react";

import { consoleAegisPath } from "@/lib/app-paths";
import {
  applyConsoleTheme,
  readStoredConsoleTheme,
  resolveConsoleTheme,
  toggleConsoleTheme,
  type ConsoleTheme,
} from "@/lib/console/theme";

export function ConsoleUserMenu({
  email,
  initials,
  collapsed,
  signOutControl,
}: {
  email: string;
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

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((value) => !value)}
      className={`flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors duration-150 hover:bg-gray-100 ${
        collapsed ? "justify-center" : ""
      }`.trim()}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
        {initials}
      </span>
      {!collapsed ? <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{email}</span> : null}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative">
      {trigger}
      {open ? (
        <div
          className={`absolute z-30 min-w-52 rounded-xl border border-gray-200 bg-white p-1 shadow-xl ${
            collapsed ? "bottom-10 left-0" : "bottom-full left-0 mb-2"
          }`.trim()}
        >
          <p className="px-3 py-2 text-xs text-gray-500">{email}</p>
          <button
            type="button"
            onClick={handleToggleTheme}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100"
          >
            <Moon className="h-4 w-4 text-gray-500" />
            <span className="flex-1">Toggle theme</span>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              M
            </kbd>
          </button>
          <Link
            href={consoleAegisPath("/settings")}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 no-underline hover:bg-gray-100"
            onClick={() => setOpen(false)}
          >
            <User className="h-4 w-4 text-gray-500" />
            Profile & settings
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 no-underline hover:bg-gray-100"
            onClick={() => setOpen(false)}
          >
            <Home className="h-4 w-4 text-gray-500" />
            Salanor homepage
          </Link>
          <Link
            href="/aegis/docs"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 no-underline hover:bg-gray-100"
            onClick={() => setOpen(false)}
          >
            <BookOpen className="h-4 w-4 text-gray-500" />
            Getting started
          </Link>
          <div className="my-1 border-t border-gray-100" />
          <div className="px-1 py-1 [&_button]:flex [&_button]:w-full [&_button]:items-center [&_button]:rounded-lg [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:text-sm [&_button]:text-gray-700 [&_button]:hover:bg-gray-100">
            {signOutControl}
          </div>
        </div>
      ) : null}
    </div>
  );
}
