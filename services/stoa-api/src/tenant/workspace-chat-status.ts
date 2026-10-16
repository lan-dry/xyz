import { getEnabledModelsForTenant, getAvailableModelsForTenant } from "./model-access.js";
import { getAllProviderStatus } from "./providers.js";
import { getTenantSettings } from "./settings.js";

export type WorkspaceChatSetupPhase =
  | "need_provider"
  | "need_policy"
  | "ready";

export type WorkspaceChatStatus = {
  ready: boolean;
  setupPhase: WorkspaceChatSetupPhase;
  providerConnected: boolean;
  googleConfigured: boolean;
  dlpProfile: string;
  enabledModelCount: number;
  defaultModelId: string | null;
};

export async function resolveWorkspaceChatStatus(
  tenantId: string,
): Promise<WorkspaceChatStatus> {
  const settings = await getTenantSettings(tenantId);
  const [available, allProviders, enabled] = await Promise.all([
    getAvailableModelsForTenant(tenantId),
    getAllProviderStatus(tenantId),
    getEnabledModelsForTenant(tenantId),
  ]);
  const providerConnected =
    available.source !== "none" || allProviders.anyConfigured;
  const ready =
    providerConnected &&
    enabled.length > 0 &&
    Boolean(
      settings.defaultModelId && enabled.some((m) => m.id === settings.defaultModelId)
        ? settings.defaultModelId
        : enabled[0]?.id,
    );
  let setupPhase: WorkspaceChatSetupPhase = "ready";
  if (!ready) {
    setupPhase = providerConnected ? "need_policy" : "need_provider";
  }
  return {
    ready,
    setupPhase,
    providerConnected,
    googleConfigured: allProviders.providers.google.configured,
    dlpProfile: settings.dlp.profile,
    enabledModelCount: enabled.length,
    defaultModelId: settings.defaultModelId,
  };
}
