"use client";

import { useCallback, useRef, useState } from "react";

import styles from "./data-point-field.module.css";

export type DataPoint = {
  id: string;
  value: string;
  label: string;
  /** Plain-English line for investors (optional). */
  gloss?: string;
  detail: string;
};

export function DataPointField({ points }: { points: readonly DataPoint[] }) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = fieldRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCursor({
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  }, []);

  return (
    <div
      ref={fieldRef}
      className={styles.field}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setActiveId(null);
        setCursor({ x: 0.5, y: 0.5 });
      }}
      style={
        {
          "--cursor-x": `${cursor.x * 100}%`,
          "--cursor-y": `${cursor.y * 100}%`,
        } as React.CSSProperties
      }
    >
      <div className={styles.glow} aria-hidden />
      <ul className={styles.list}>
        {points.map((point, index) => (
          <li key={point.id}>
            <article
              className={`${styles.point} ${activeId === point.id ? styles.pointActive : ""}`}
              style={{ "--i": index } as React.CSSProperties}
              onMouseEnter={() => setActiveId(point.id)}
              onMouseLeave={() => setActiveId(null)}
            >
              <span className={styles.value}>{point.value}</span>
              <span className={styles.label}>{point.label}</span>
              {point.gloss ? <p className={styles.gloss}>{point.gloss}</p> : null}
              <p className={styles.detail}>{point.detail}</p>
              <span className={styles.rail} aria-hidden />
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}
