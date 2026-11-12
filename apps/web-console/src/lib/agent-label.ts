/** Prefer the agent display name; use the id only when no name exists. */
export function agentLabel(
  name: string | null | undefined,
  agentId: string,
): string {
  const trimmed = name?.trim();
  return trimmed || agentId;
}
