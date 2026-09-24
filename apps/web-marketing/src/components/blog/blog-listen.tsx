"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sendBlogEngagement } from "@/lib/blog/engagement-client";
import { htmlToPlainText } from "@/lib/blog/plain-text";

import styles from "./blog.module.css";

type Props = {
  slug: string;
  title: string;
  contentHtml: string;
};

type ListenState = "idle" | "playing" | "paused" | "unsupported";

const SPEEDS = [0.85, 1, 1.15, 1.35] as const;
const STORAGE_PREFIX = "salanor.blog.listen.v1";

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}:${slug}`;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

export function BlogListen({ slug, title, contentHtml }: Props) {
  const [state, setState] = useState<ListenState>("idle");
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [charIndex, setCharIndex] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const plainText = useMemo(() => `${title}. ${htmlToPlainText(contentHtml)}`, [title, contentHtml]);
  const totalChars = plainText.length;
  const estimatedTotalSec = useMemo(
    () => Math.max(30, Math.round(totalChars / (14 * speed))),
    [totalChars, speed],
  );

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const listenStartedAt = useRef<number | null>(null);
  const accumulatedSec = useRef(0);
  const startCharRef = useRef(0);
  const tickRef = useRef<number | null>(null);

  const persistPosition = useCallback(
    (index: number) => {
      try {
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
  }, []);

  const speakFrom = useCallback(
    (fromChar: number, resumeEvent: boolean) => {
      if (!plainText) return;
      cancelSpeech();
      const text = plainText.slice(Math.max(0, fromChar));
      if (!text.trim()) return;

      startCharRef.current = fromChar;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = speed;
      utterance.onstart = () => {
        listenStartedAt.current = Date.now();
        setState("playing");
        if (!resumeEvent) {
          void sendBlogEngagement({ slug, event: "listen_start" });
        } else {
          void sendBlogEngagement({ slug, event: "listen_resume" });
        }
      };
      utterance.onpause = () => {
        flushListenSeconds();
        setState("paused");
        void sendBlogEngagement({ slug, event: "listen_pause" });
      };
      utterance.onresume = () => {
        listenStartedAt.current = Date.now();
        setState("playing");
        void sendBlogEngagement({ slug, event: "listen_resume" });
      };
      utterance.onend = () => {
        flushListenSeconds();
        setState("idle");
        setCharIndex(totalChars);
        persistPosition(0);
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
          setCharIndex(absolute);
          persistPosition(absolute);
        }
      };
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    },
    [
      plainText,
      state,
      cancelSpeech,
      speed,
      slug,
      flushListenSeconds,
      persistPosition,
      totalChars,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setState("unsupported");
    }
    const saved = loadSavedPosition();
    if (saved > 0) setCharIndex(saved);

    return () => {
      flushListenSeconds();
      cancelSpeech();
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [flushListenSeconds, cancelSpeech, loadSavedPosition]);

  useEffect(() => {
    if (state !== "playing") {
      if (tickRef.current) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    tickRef.current = window.setInterval(() => {
      const ratio = totalChars > 0 ? charIndex / totalChars : 0;
      setElapsedSec(Math.round(ratio * estimatedTotalSec));
    }, 500);
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [state, charIndex, totalChars, estimatedTotalSec]);

  const start = () => {
    const from = charIndex > 0 && charIndex < totalChars ? charIndex : loadSavedPosition();
    setCharIndex(from);
    speakFrom(from, from > 0);
  };

  const pause = () => {
    window.speechSynthesis.pause();
  };

  const resume = () => {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else {
      speakFrom(charIndex, true);
    }
  };

  const stop = () => {
    flushListenSeconds();
    cancelSpeech();
    setState("idle");
    persistPosition(charIndex);
    accumulatedSec.current = 0;
  };

  const onSeek = (value: number) => {
    const idx = Math.round((value / 100) * totalChars);
    setCharIndex(idx);
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
      <p className={styles.listenHint} role="status">
        Listen is not supported in this browser. Try Chrome or Edge on desktop.
      </p>
    );
  }

  const progressPct = totalChars > 0 ? Math.min(100, Math.round((charIndex / totalChars) * 100)) : 0;

  return (
    <div className={styles.listenPlayer} aria-label="Listen to article">
      <div className={styles.listenPlayerTop}>
        <span className={styles.listenLabel}>Listen</span>
        <div className={styles.listenControls}>
          {state === "idle" ? (
            <button type="button" className={styles.listenIconBtn} onClick={start} title="Play">
              <IconPlay />
              <span className={styles.listenIconLabel}>Play</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.listenIconBtn}
                onClick={state === "playing" ? pause : resume}
                title={state === "playing" ? "Pause" : "Resume"}
              >
                {state === "playing" ? <IconPause /> : <IconPlay />}
                <span className={styles.listenIconLabel}>{state === "playing" ? "Pause" : "Resume"}</span>
              </button>
              <button type="button" className={styles.listenIconBtnSecondary} onClick={stop} title="Stop">
                <IconStop />
                <span className={styles.listenIconLabel}>Stop</span>
              </button>
            </>
          )}
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
      {charIndex > 0 && state === "idle" ? (
        <p className={styles.listenResumeHint}>Saved position — press Play to continue where you left off.</p>
      ) : null}
    </div>
  );
}
