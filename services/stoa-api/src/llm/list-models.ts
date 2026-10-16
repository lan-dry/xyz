import { getProviderConnection } from "../tenant/providers.js";
import type { ProviderKind } from "../tenant/providers.js";
import {
  discoverGatewayModels,
  discoverAllTenantModels,
  discoverModelsForKind,
  type DiscoveredModel,
} from "./discover-providers.js";

export type { DiscoveredModel };
export { discoverGatewayModels, discoverAllTenantModels, discoverModelsForKind };

export type GatewayCredentials = {
  kind: ProviderKind;
  apiKey: string;
  baseUrl: string;
};

export async function resolveTenantGatewayAccess(
  tenantId: string,
): Promise<{ apiKey: string; baseUrl: string } | null> {
  return getProviderConnection(tenantId, "openai_compat");
}

/** @deprecated use discoverGatewayModels */
export const discoverOpenAiModels = discoverGatewayModels;
