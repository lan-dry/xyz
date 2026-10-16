import { isWorkspaceChatModel } from "../llm/chat-model-eligibility.js";
import {
  discoverAllTenantModels,
  type DiscoveredModel,
} from "../llm/list-models.js";
import { getTenantSettings, resolveDefaultModelId } from "./settings.js";
import { parseModelRef } from "./providers.js";

export { resolveDefaultModelId };

export async function getAvailableModelsForTenant(
  tenantId: string,
): Promise<{
  models: DiscoveredModel[];
  source: "tenant" | "none";
  providerError?: string;
  providerErrors?: Partial<
    Record<"openai_compat" | "anthropic" | "google", string>
  >;
}> {
  const all = await discoverAllTenantModels(tenantId);
  const errorParts = Object.entries(all.errors).map(
    ([kind, msg]) => `${kind}: ${msg}`,
  );
  return {
    models: all.models,
    source: all.anyConfigured ? "tenant" : "none",
    providerError:
      all.models.length === 0 && errorParts.length > 0
        ? errorParts.join(" · ")
        : undefined,
    providerErrors: all.errors,
  };
}

export async function getEnabledModelsForTenant(
  tenantId: string,
): Promise<DiscoveredModel[]> {
  const [settings, available] = await Promise.all([
    getTenantSettings(tenantId),
    getAvailableModelsForTenant(tenantId),
  ]);
  const byId = new Map(available.models.map((m) => [m.id, m]));
  return settings.enabledModelIds
    .map((id) => byId.get(id))
    .filter((m): m is DiscoveredModel => {
      if (!m) {
        return false;
      }
      const { kind, upstreamId } = parseModelRef(m.id);
      return isWorkspaceChatModel(kind, upstreamId);
    });
}

export async function isModelAllowedForTenant(
  tenantId: string,
  modelId: string,
): Promise<boolean> {
  const settings = await getTenantSettings(tenantId);
  if (!settings.enabledModelIds.includes(modelId)) {
    return false;
  }
  const { models } = await getAvailableModelsForTenant(tenantId);
  return models.some((m) => m.id === modelId);
}
