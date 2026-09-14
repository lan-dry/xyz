/** Build last N calendar-day buckets (oldest → newest) from ISO timestamps. */
export function seriesFromTimestamps(
  timestamps: string[],
  days = 7,
  now = new Date(),
): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (const iso of timestamps) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const index = Math.floor(
      (dayStart.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (index >= 0 && index < days) {
      buckets[index] += 1;
    }
  }
  return buckets;
}

/** Sum numeric values into daily buckets keyed by a date field on each row. */
export function sumSeriesFromTimestamps(
  rows: Array<{ at: string; amount: number }>,
  days = 7,
  now = new Date(),
): number[] {
  const buckets = Array.from({ length: days }, () => 0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  for (const row of rows) {
    const d = new Date(row.at);
    if (Number.isNaN(d.getTime())) continue;
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const index = Math.floor(
      (dayStart.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (index >= 0 && index < days) {
      buckets[index] += row.amount;
    }
  }
  return buckets;
}

/** Compare second half vs first half of a series (recent vs earlier in window). */
export function trendPercent(series: number[]): number | null {
  if (series.length < 2) return null;
  const mid = Math.floor(series.length / 2);
  const earlier = series.slice(0, mid).reduce((a, b) => a + b, 0);
  const recent = series.slice(mid).reduce((a, b) => a + b, 0);
  if (earlier === 0) {
    return recent > 0 ? 100 : 0;
  }
  return Math.round(((recent - earlier) / earlier) * 100);
}

export function sparklinePoints(
  values: number[],
  width: number,
  height: number,
): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length <= 1 ? width : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
