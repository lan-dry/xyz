export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return "***";
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}***@${domain}`;
}

export function maskDisplayValue(
  value: string | null | undefined,
  kind: "email" | "text",
): string | null {
  if (value == null || value === "") {
    return value ?? null;
  }
  if (kind === "email") {
    return maskEmail(value);
  }
  if (value.length <= 4) {
    return "****";
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
