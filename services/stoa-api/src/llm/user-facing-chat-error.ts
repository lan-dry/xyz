export function toUserFacingChatError(raw: string, modelId?: string): string {
  const lower = raw.toLowerCase();
  const modelHint = modelId
    ? " Try another model."
    : " Contact your administrator.";

  if (
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit")
  ) {
    return "The AI service is busy or over its limit." + modelHint;
  }
  if (
    lower.includes("no longer available") ||
    lower.includes("not found") && lower.includes("model")
  ) {
    return "This model isn't available." + modelHint;
  }
  if (lower.includes("multiturn chat is not enabled")) {
    return "This model can't be used for chat." + modelHint;
  }
  if (lower.includes("computer-use")) {
    return "This model can't be used for chat." + modelHint;
  }
  if (lower.includes("billing")) {
    return "The AI service account has a billing problem." + modelHint;
  }
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length > 240) {
    return `${trimmed.slice(0, 240)}…${modelHint}`;
  }
  return trimmed + modelHint;
}
