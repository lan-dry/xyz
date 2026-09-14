"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type TocHeading = {
  id: string;
  text: string;
  level: 2 | 3;
};

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isMac() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
}

const SCROLL_LINE = 100;

function pickActiveHeading(items: TocHeading[]): string {
  if (items.length === 0) return "";

  let current = items[0].id;
  for (const { id } of items) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= SCROLL_LINE) {
      current = id;
    }
  }

  const atBottom =
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 48;
  if (atBottom) {
    return items[items.length - 1].id;
  }

  return current;
}

function filterHeadings(headings: TocHeading[], query: string): TocHeading[] {
  const q = query.trim().toLowerCase();
  if (!q) return headings;
  return headings.filter((h) => h.text.toLowerCase().includes(q));
}

/** Scan article headings, scroll spy, and in-page jump search (Ctrl+Shift+K). */
export function OnThisPage() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpQuery, setJumpQuery] = useState("");
  const [jumpActive, setJumpActive] = useState(0);

  const scrollToHeading = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setActiveId(id);
  }, []);

  const closeJump = useCallback(() => {
    setJumpOpen(false);
    setJumpQuery("");
    setJumpActive(0);
  }, []);

  useEffect(() => {
    setHeadings([]);
    setActiveId("");

    const article = document.querySelector(".docs-article");
    if (!article) return;

    const nodes = article.querySelectorAll("h2, h3");
    const items: TocHeading[] = [];

    nodes.forEach((node) => {
      const el = node as HTMLElement;
      const level = el.tagName === "H2" ? 2 : 3;
      const text = el.textContent?.trim() ?? "";
      if (!text) return;

      let id = el.id;
      if (!id) {
        id = slugify(text);
        el.id = id;
      }
      items.push({ id, text, level });
    });

    setHeadings(items);
    if (items[0]) setActiveId(items[0].id);

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setActiveId(pickActiveHeading(items));
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumpOpen(true);
      }
      if (e.key === "Escape") {
        closeJump();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeJump]);

  const jumpResults = filterHeadings(headings, jumpQuery);

  useEffect(() => {
    if (jumpOpen) {
      setJumpActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [jumpOpen, jumpQuery]);

  useEffect(() => {
    if (!jumpOpen) return;
    function onModalKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setJumpActive((i) => Math.min(i + 1, jumpResults.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setJumpActive((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && jumpResults[jumpActive]) {
        e.preventDefault();
        scrollToHeading(jumpResults[jumpActive].id);
        closeJump();
      }
    }
    window.addEventListener("keydown", onModalKey);
    return () => window.removeEventListener("keydown", onModalKey);
  }, [jumpOpen, jumpResults, jumpActive, scrollToHeading, closeJump]);

  if (headings.length === 0) {
    return null;
  }

  const jumpShortcut = isMac() ? "⌘⇧K" : "Ctrl Shift K";

  return (
    <>
      <aside className="docs-toc" aria-label="On this page">
        <p className="toc-label">On this page</p>
        <button
          type="button"
          className="toc-search-trigger"
          onClick={() => setJumpOpen(true)}
          aria-label="Jump to section on this page"
        >
          <span className="toc-search-placeholder">Jump to…</span>
          <kbd className="toc-search-kbd">{jumpShortcut}</kbd>
        </button>
        <ul className="toc-list">
          {headings.map((h) => (
            <li key={h.id} className={h.level === 3 ? "toc-item toc-item-nested" : "toc-item"}>
              <a
                href={`#${h.id}`}
                className={activeId === h.id ? "toc-link active" : "toc-link"}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToHeading(h.id);
                }}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </aside>

      {jumpOpen ? (
        <div
          className="docs-search-overlay"
          role="presentation"
          onClick={closeJump}
        >
          <div
            className="docs-search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Jump to section"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="docs-search-input"
              type="search"
              placeholder="Jump to section on this page…"
              value={jumpQuery}
              onChange={(e) => setJumpQuery(e.target.value)}
            />
            <ul className="docs-search-results">
              {jumpResults.length === 0 ? (
                <li className="docs-search-empty">No matching sections</li>
              ) : (
                jumpResults.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className={
                        i === jumpActive ? "docs-search-result active" : "docs-search-result"
                      }
                      onClick={() => {
                        scrollToHeading(h.id);
                        closeJump();
                      }}
                      onMouseEnter={() => setJumpActive(i)}
                    >
                      <span className="docs-search-result-title">{h.text}</span>
                      <span className="docs-search-result-section">
                        {h.level === 3 ? "Subsection" : "Section"}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <p className="docs-search-hint">
              ↑↓ navigate · Enter jump · Esc close
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
