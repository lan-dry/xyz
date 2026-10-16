export function isPgMissingRelation(error: unknown, relation?: string): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: string }).code;
  if (code !== "42P01") {
    return false;
  }
  if (!relation) {
    return true;
  }
  const message = String((error as { message?: string }).message ?? "");
  return message.includes(relation);
}
