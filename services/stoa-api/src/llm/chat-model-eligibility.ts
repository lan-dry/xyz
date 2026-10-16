import type { ProviderKind } from "../tenant/providers.js";

/** Models suitable for multi-turn workspace chat (excludes TTS, computer-use, etc.). */
export function isWorkspaceChatModel(
  provider: ProviderKind,
  upstreamId: string,
): boolean {
  const id = upstreamId.toLowerCase();
  if (provider === "openai_compat") {
    return !(
      id.includes("embedding") ||
      id.includes("whisper") ||
      id.includes("tts") ||
      id.includes("dall-e") ||
      id.includes("moderation")
    );
  }
  if (provider === "anthropic") {
    return true;
  }
  if (provider === "google") {
    if (
      id.includes("tts") ||
      id.includes("computer-use") ||
      id.includes("computer_use") ||
      id.includes("deep-research") ||
      id.includes("antigravity") ||
      id.includes("embedding") ||
      id.includes("aqa") ||
      id.includes("imagen") ||
      id.includes("veo") ||
      id.includes("gemma") ||
      id.includes("learnlm") ||
      /^gemini-1\.5-flash$/i.test(id) ||
      /^models\/gemini-1\.5-flash$/i.test(id)
    ) {
      return false;
    }
    return id.includes("gemini");
  }
  return true;
}

export function pickRecommendedChatModelId(
  models: { id: string; provider: ProviderKind; upstreamId?: string }[],
): string | null {
  const eligible = models.filter((m) => {
    const upstream =
      m.upstreamId ?? m.id.replace(/^google:|^anthropic:|^openai_compat:/, "");
    return isWorkspaceChatModel(m.provider, upstream);
  });
  const prefer = [
    /gemini-2\.5-flash(?!.*preview)/i,
    /gemini-2\.0-flash/i,
    /gemini-1\.5-flash(?!.*tts)/i,
    /gemini-2\.5-pro/i,
    /gemini-1\.5-pro/i,
    /^google:gemini/i,
  ];
  for (const re of prefer) {
    const hit = eligible.find(
      (m) => re.test(m.id) || re.test(m.upstreamId ?? m.id),
    );
    if (hit) {
      return hit.id;
    }
  }
  return eligible[0]?.id ?? null;
}
