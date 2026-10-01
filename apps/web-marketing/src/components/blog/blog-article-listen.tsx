"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { injectHeadingIds } from "@/lib/blog/utils";
import { sendBlogEngagement } from "@/lib/blog/engagement-client";

import styles from "./blog.module.css";

type Props = {
  slug: string;
  title: string;
  contentHtml: string;
};

type ListenState = "idle" | "playing" | "paused" | "unsupported";

const SPEEDS = [0.85, 1, 1.15, 1.35] as const;
const STORAGE_PREFIX = "salanor.blog.listen.v1";
const CHARS_PER_SEC_BASE = 14;

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}:${slug}`;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function blockPlainText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 6h12v12H6V6z" />
    </svg>
  );
}

export function BlogArticleListen({ slug, title, contentHtml }: Props) {
  const [state, setState] = useState<ListenState>("idle");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [charIndex, setCharIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const proseRef = useRef<HTMLDivElement>(null);
  const blockRangesRef = useRef<{ el: Element; start: number; end: number }[]>([]);

  const htmlWithIds = useMemo(() => injectHeadingIds(contentHtml), [contentHtml]);

  const { plainText, titlePrefixLen } = useMemo(() => {
    const prefix = `${title}. `;
    if (typeof document === "undefined") {
      const body = contentHtml
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { plainText: prefix + body, titlePrefixLen: prefix.length };
    }
    const div = document.createElement("div");
    div.innerHTML = htmlWithIds;
    const blocks = div.querySelectorAll("p, h2, h3, h4, li");
    const parts: string[] = [];
    for (const el of blocks) {
      const t = blockPlainText(el);
      if (t) parts.push(t);
    }
    const body = parts.join(" ");
    return { plainText: prefix + body, titlePrefixLen: prefix.length };
  }, [title, contentHtml, htmlWithIds]);

  const totalChars = plainText.length;
  const estimatedTotalSec = useMemo(
    () => Math.max(30, Math.round(totalChars / (CHARS_PER_SEC_BASE * speed))),
    [totalChars, speed],
  );

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const listenStartedAt = useRef<number | null>(null);
  const accumulatedSec = useRef(0);
  const startCharRef = useRef(0);
  const playbackWallStart = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const boundaryCharRef = useRef(0);

  const persistPosition = useCallback(
    (index: number) => {
      try {
        if (index <= 0) {
          localStorage.removeItem(storageKey(slug));
          return;
        }
        localStorage.setItem(
          storageKey(slug),
          JSON.stringify({ charIndex: index, at: Date.now() }),
        );
      } catch {
        /* ignore */
      }
    },
    [slug],
  );

  const loadSavedPosition = useCallback((): number => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as { charIndex?: number };
      const idx = parsed.charIndex ?? 0;
      return idx > 0 && idx < totalChars ? idx : 0;
    } catch {
      return 0;
    }
  }, [slug, totalChars]);

  const flushListenSeconds = useCallback(() => {
    if (listenStartedAt.current === null) return;
    const delta = (Date.now() - listenStartedAt.current) / 1000;
    listenStartedAt.current = null;
    if (delta < 0.5) return;
    accumulatedSec.current += delta;
    void sendBlogEngagement({
      slug,
      event: "listen_seconds",
      valueNum: Math.round(delta),
    });
  }, [slug]);

  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    playbackWallStart.current = null;
  }, []);

  const speakFrom = useCallback(
    (fromChar: number, resumeEvent: boolean) => {
      if (!plainText) return;
      cancelSpeech();
      const text = plainText.slice(Math.max(0, fromChar));
      if (!text.trim()) return;

      startCharRef.current = fromChar;
      boundaryCharRef.current = fromChar;
      playbackWallStart.current = Date.now();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = speed;
      utterance.onstart = () => {
        listenStartedAt.current = Date.now();
        playbackWallStart.current = Date.now();
        setState("playing");
        if (!resumeEvent) {
          void sendBlogEngagement({ slug, event: "listen_start" });
        } else {
          void sendBlogEngagement({ slug, event: "listen_resume" });
        }
      };
      utterance.onpause = () => {
        /* UI pause is handled in pause(); browsers often never fire this. */
      };
      utterance.onresume = () => {
        listenStartedAt.current = Date.now();
        playbackWallStart.current = Date.now();
        setState("playing");
      };
      utterance.onend = () => {
        flushListenSeconds();
        setState("idle");
        setCharIndex(totalChars);
        setElapsedSec(estimatedTotalSec);
        persistPosition(0);
        playbackWallStart.current = null;
        void sendBlogEngagement({
          slug,
          event: "listen_complete",
          valueNum: Math.round(accumulatedSec.current),
        });
        accumulatedSec.current = 0;
      };
      utterance.onboundary = (e) => {
        if (e.charLength > 0 && totalChars > 0) {
          const absolute = startCharRef.current + e.charIndex;
          boundaryCharRef.current = absolute;
          setCharIndex(absolute);
          persistPosition(absolute);
        }
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [
      plainText,
      cancelSpeech,
      speed,
      slug,
      flushListenSeconds,
      persistPosition,
      totalChars,
      estimatedTotalSec,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("unsupported");
    }
    const saved = loadSavedPosition();
    if (saved > 0) {
      setCharIndex(saved);
      setElapsedSec(Math.round((saved / Math.max(1, totalChars)) * estimatedTotalSec));
    }

    return () => {
      flushListenSeconds();
      cancelSpeech();
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [flushListenSeconds, cancelSpeech, loadSavedPosition, totalChars, estimatedTotalSec]);

  useEffect(() => {
    const root = proseRef.current;
    if (!root) return;
    const blocks = root.querySelectorAll("p, h2, h3, h4, li");
    let offset = titlePrefixLen;
    const ranges: { el: Element; start: number; end: number }[] = [];
    for (const el of blocks) {
      const t = blockPlainText(el);
      if (!t) continue;
      const start = offset;
      const end = offset + t.length + 1;
      ranges.push({ el, start, end });
      offset = end;
    }
    blockRangesRef.current = ranges;
  }, [htmlWithIds, titlePrefixLen]);

  useEffect(() => {
    for (const { el, start, end } of blockRangesRef.current) {
      const active = charIndex >= start && charIndex < end;
      el.classList.toggle(styles.listenReadingBlock, active);
    }
  }, [charIndex, htmlWithIds]);

  useEffect(() => {
    if (state !== "playing") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }

    const charsPerSec = CHARS_PER_SEC_BASE * speed;
    tickRef.current = window.setInterval(() => {
      const wall = playbackWallStart.current;
      if (wall === null) return;
      const since = (Date.now() - wall) / 1000;
      const timeBasedChar = Math.min(
        totalChars,
        startCharRef.current + Math.round(since * charsPerSec),
      );
      const merged = Math.max(boundaryCharRef.current, timeBasedChar);
      setCharIndex(merged);
      setElapsedSec(Math.min(estimatedTotalSec, Math.round((merged / Math.max(1, totalChars)) * estimatedTotalSec)));
    }, 200);

    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [state, speed, totalChars, estimatedTotalSec]);

  const start = () => {
    const from = charIndex > 0 && charIndex < totalChars ? charIndex : loadSavedPosition();
    setCharIndex(from);
    boundaryCharRef.current = from;
    setElapsedSec(Math.round((from / Math.max(1, totalChars)) * estimatedTotalSec));
    speakFrom(from, from > 0);
  };

  const pause = () => {
    const idx = Math.max(charIndex, boundaryCharRef.current);
    flushListenSeconds();
    cancelSpeech();
    boundaryCharRef.current = idx;
    setCharIndex(idx);
    setElapsedSec(
      Math.min(estimatedTotalSec, Math.round((idx / Math.max(1, totalChars)) * estimatedTotalSec)),
    );
    setState("paused");
    persistPosition(idx);
    void sendBlogEngagement({ slug, event: "listen_pause" });
  };

  const resume = () => {
    speakFrom(boundaryCharRef.current, true);
  };

  const stop = () => {
    flushListenSeconds();
    cancelSpeech();
    setState("idle");
    setCharIndex(0);
    setElapsedSec(0);
    boundaryCharRef.current = 0;
    startCharRef.current = 0;
    persistPosition(0);
    accumulatedSec.current = 0;
  };

  const onSeek = (value: number) => {
    const idx = Math.round((value / 100) * totalChars);
    setCharIndex(idx);
    boundaryCharRef.current = idx;
    setElapsedSec(Math.round((idx / Math.max(1, totalChars)) * estimatedTotalSec));
    persistPosition(idx);
    if (state === "playing" || state === "paused") {
      flushListenSeconds();
      cancelSpeech();
      speakFrom(idx, true);
    }
  };

  const onSpeedChange = (next: (typeof SPEEDS)[number]) => {
    setSpeed(next);
    if (state === "playing") {
      const idx = charIndex;
      flushListenSeconds();
      cancelSpeech();
      setTimeout(() => speakFrom(idx, true), 50);
    }
  };

  if (state === "unsupported") {
    return (
      <>
        <p className={styles.listenHint} role="status">
          Listen is not supported in this browser. Try Chrome or Edge on desktop.
        </p>
        <div className={styles.prose} dangerouslySetInnerHTML={{ __html: htmlWithIds }} />
      </>
    );
  }

  const progressPct = totalChars > 0 ? Math.min(100, Math.round((charIndex / totalChars) * 100)) : 0;
  const showResumeHint = charIndex > 0 && state === "idle" && progressPct < 100;

  return (
    <>
      <div className={styles.listenPlayer} aria-label="Listen to article">
        <div className={styles.listenPlayerTop}>
          <span className={styles.listenLabel}>Listen</span>
          <div className={styles.listenControls}>
            {state === "idle" ? (
              <button type="button" className={styles.listenIconBtn} onClick={start} title="Play">
                <IconPlay />
                <span className={styles.listenIconLabel}>Play</span>
              </button>
            ) : state === "playing" ? (
              <button type="button" className={styles.listenIconBtn} onClick={pause} title="Pause">
                <IconPause />
                <span className={styles.listenIconLabel}>Pause</span>
              </button>
            ) : (
              <button type="button" className={styles.listenIconBtn} onClick={resume} title="Resume">
                <IconPlay />
                <span className={styles.listenIconLabel}>Resume</span>
              </button>
            )}
            {state !== "idle" ? (
              <>
                <button type="button" className={styles.listenIconBtnSecondary} onClick={stop} title="Stop">
                  <IconStop />
                  <span className={styles.listenIconLabel}>Stop</span>
                </button>
              </>
            ) : null}
          </div>
          <div className={styles.listenTime}>
            {formatTime(elapsedSec)} / {formatTime(estimatedTotalSec)}
          </div>
          <label className={styles.listenSpeed}>
            Speed
            <select
              value={speed}
              onChange={(e) => onSpeedChange(Number(e.target.value) as (typeof SPEEDS)[number])}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={progressPct}
          className={styles.listenSeek}
          aria-label="Playback position"
          onChange={(e) => onSeek(Number(e.target.value))}
        />
        {showResumeHint ? (
          <p className={styles.listenResumeHint}>
            Saved position — press Play to continue where you left off.
          </p>
        ) : null}
      </div>
      <div
        ref={proseRef}
        className={styles.prose}
        dangerouslySetInnerHTML={{ __html: htmlWithIds }}
      />
    </>
  );
}
