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
