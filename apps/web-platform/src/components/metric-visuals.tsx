import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { sparklinePoints } from "@/lib/metric-series";

export function MetricSparkline({
  values,
  color = "var(--console-accent-bright)",
  width = 88,
  height = 28,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.every((v) => v === 0)) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden
        style={{ display: "block", opacity: 0.35 }}
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const points = sparklinePoints(values, width, height);
  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ display: "block" }}
    >
      <polygon points={fillPoints} fill={color} opacity={0.14} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MetricTrend({
  percent,
  label = "vs prior half of week",
}: {
  percent: number | null;
  label?: string;
}) {
  if (percent === null) return null;

  const up = percent > 0;
  const down = percent < 0;
  const color = up
    ? "var(--console-accent-bright)"
    : down
      ? "var(--ops-danger)"
      : "var(--text-dim)";

  const Icon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6875rem",
        fontWeight: 500,
        color,
      }}
      title={label}
    >
      <Icon size={12} aria-hidden />
      {up ? "+" : ""}
      {percent}%
      <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>{label}</span>
    </span>
  );
}
