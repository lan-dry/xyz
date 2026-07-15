const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "UTC",
});

export function formatDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return `${DATE_TIME_FORMATTER.format(date)} UTC`;
}
