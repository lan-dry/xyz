"use client";

import { useCallback, useRef, useState } from "react";

import styles from "./hero-data-visual.module.css";

const NODES = [
  { id: "wrap", label: "SDK intercept", value: "<5ms", x: 18, y: 22 },
  { id: "policy", label: "Policy gate", value: "OPA/WASM", x: 72, y: 18 },
  { id: "sign", label: "Ed25519 sign", value: "BYOK", x: 82, y: 48 },
  { id: "chain", label: "Hash chain", value: "append-only", x: 58, y: 72 },
  { id: "witness", label: "Merkle witness", value: "60s", x: 28, y: 68 },
  { id: "export", label: "Compliance", value: "SOC 2 · EU AI", x: 12, y: 44 },
] as const;

const EDGES: [string, string][] = [
  ["wrap", "policy"],
  ["policy", "sign"],
  ["sign", "chain"],
  ["chain", "witness"],
  ["witness", "export"],
  ["export", "wrap"],
];

export function HeroDataVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 50, y: 50 });

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCursor({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }, []);

  const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

  return (
    <div
      ref={ref}
      className={styles.visual}
      onMouseMove={onMove}
      onMouseLeave={() => {
        setActive(null);
        setCursor({ x: 50, y: 50 });
      }}
      style={
        {
          "--mx": `${cursor.x}%`,
          "--my": `${cursor.y}%`,
        } as React.CSSProperties
      }
      aria-hidden
    >
      <div className={styles.ambient} />
      <svg className={styles.edges} viewBox="0 0 100 100" preserveAspectRatio="none">
        {EDGES.map(([a, b]) => {
          const na = nodeMap[a];
          const nb = nodeMap[b];
          if (!na || !nb) return null;
          const lit = active === a || active === b;
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              className={lit ? styles.edgeActive : styles.edge}
            />
          );
        })}
      </svg>
      {NODES.map((node) => (
        <button
          key={node.id}
          type="button"
          className={`${styles.node} ${active === node.id ? styles.nodeActive : ""}`}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          onMouseEnter={() => setActive(node.id)}
          onMouseLeave={() => setActive(null)}
          tabIndex={-1}
        >
          <span className={styles.nodeValue}>{node.value}</span>
          <span className={styles.nodeLabel}>{node.label}</span>
        </button>
      ))}
    </div>
  );
}
