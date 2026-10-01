/** gray-matter may parse YAML dates as Date objects — normalize for sort/compare. */
export function toSortableIso(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
