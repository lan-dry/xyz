"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { docsSearchIndex, searchDocs, type DocsSearchEntry } from "@/lib/docs-search-index";

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

export function DocsSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocsSearchEntry[]>(docsSearchIndex.slice(0, 8));
  const [active, setActive] = useState(0);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) {
      setResults(searchDocs(query));
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    function onModalKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[active]) {
        e.preventDefault();
        go(results[active].href);
      }
    }
    window.addEventListener("keydown", onModalKey);
    return () => window.removeEventListener("keydown", onModalKey);
  }, [open, results, active, go]);

  const shortcut = isMac() ? "⌘K" : "Ctrl K";

  return (
    <>
      <button
        type="button"
        className="docs-search-trigger"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <span className="docs-search-placeholder">Search…</span>
        <kbd className="docs-search-kbd">{shortcut}</kbd>
      </button>

      {open ? (
        <div
          className="docs-search-overlay"
          role="presentation"
          onClick={close}
        >
          <div
            className="docs-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="docs-search-input"
              type="search"
              placeholder="Search docs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className="docs-search-results">
              {results.length === 0 ? (
                <li className="docs-search-empty">No results</li>
              ) : (
                results.map((r, i) => (
                  <li key={`${r.href}-${r.title}`}>
                    <button
                      type="button"
                      className={
                        i === active ? "docs-search-result active" : "docs-search-result"
                      }
                      onClick={() => go(r.href)}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="docs-search-result-title">{r.title}</span>
                      <span className="docs-search-result-section">{r.section}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="docs-search-hint">
              ↑↓ navigate · Enter open · Esc close
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

