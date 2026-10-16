import {
  getProviderConnection,
  modelRef,
  PROVIDER_META,
  type ProviderKind,
} from "../tenant/providers.js";
import { isWorkspaceChatModel } from "./chat-model-eligibility.js";
import { formatUpstreamError } from "./provider-error.js";
import { humanizeUpstreamBody } from "./sanitize-upstream-body.js";

export type DiscoveredModel = {
  id: string;
  label: string;
  provider: ProviderKind;
  upstreamId: string;
};

async function discoverOpenAiCompat(
  access: { apiKey: string; baseUrl: string },
): Promise<{ models: DiscoveredModel[]; error?: string }> {
  try {
    const response = await fetch(`${access.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${access.apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        models: [],
        error: formatUpstreamError(text, response.status),
      };
    }
    const body = (await response.json()) as { data?: { id: string }[] };
    const ids = (body.data ?? [])
      .map((m) => m.id)
      .filter((id) => {
        const lower = id.toLowerCase();
        return !(
          lower.includes("embedding") ||
          lower.includes("whisper") ||
          lower.includes("tts") ||
          lower.includes("dall-e") ||
          lower.includes("moderation")
        );
      });
    ids.sort();
    return {
      models: ids.map((upstreamId) => ({
        id: modelRef("openai_compat", upstreamId),
        label: upstreamId,
        provider: "openai_compat" as const,
        upstreamId,
      })),
    };
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverAnthropic(
  access: { apiKey: string; baseUrl: string },
): Promise<{ models: DiscoveredModel[]; error?: string }> {
  try {
    const response = await fetch(`${access.baseUrl}/v1/models`, {
      headers: {
        "x-api-key": access.apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        models: [],
        error: formatUpstreamError(text, response.status),
      };
    }
    const body = (await response.json()) as { data?: { id: string; display_name?: string }[] };
    const rows = body.data ?? [];
    rows.sort((a, b) => a.id.localeCompare(b.id));
    return {
      models: rows.map((m) => ({
        id: modelRef("anthropic", m.id),
        label: m.display_name ?? m.id,
        provider: "anthropic" as const,
        upstreamId: m.id,
      })),
    };
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function discoverGoogle(
  access: { apiKey: string; baseUrl: string },
): Promise<{ models: DiscoveredModel[]; error?: string }> {
  try {
    const base = access.baseUrl.replace(/\/$/, "");
    const response = await fetch(
      `${base}/v1beta/models?key=${encodeURIComponent(access.apiKey)}`,
    );
    if (!response.ok) {
      const text = await response.text();
      const html = humanizeUpstreamBody(text, response.status);
      return {
        models: [],
        error: html ?? formatUpstreamError(text, response.status),
      };
    }
    const body = (await response.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    const models = (body.models ?? []).filter((m) => {
      if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) {
        return false;
      }
      const upstreamId = m.name.replace(/^models\//, "");
      return isWorkspaceChatModel("google", upstreamId);
    });
    models.sort((a, b) => a.name.localeCompare(b.name));
    return {
      models: models.map((m) => {
        const upstreamId = m.name.replace(/^models\//, "");
        return {
          id: modelRef("google", upstreamId),
          label: m.displayName ?? upstreamId,
          provider: "google" as const,
          upstreamId,
        };
      }),
    };
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function discoverModelsForKind(
  kind: ProviderKind,
  access: { apiKey: string; baseUrl: string },
): Promise<{ models: DiscoveredModel[]; error?: string }> {
  switch (kind) {
    case "openai_compat":
      return discoverOpenAiCompat(access);
    case "anthropic":
      return discoverAnthropic(access);
    case "google":
      return discoverGoogle(access);
    default:
      return { models: [], error: "Unknown provider" };
  }
}

export async function discoverAllTenantModels(tenantId: string): Promise<{
  models: DiscoveredModel[];
  errors: Partial<Record<ProviderKind, string>>;
  anyConfigured: boolean;
}> {
  const errors: Partial<Record<ProviderKind, string>> = {};
  const models: DiscoveredModel[] = [];
  let anyConfigured = false;
  for (const kind of Object.keys(PROVIDER_META) as ProviderKind[]) {
    const access = await getProviderConnection(tenantId, kind);
    if (!access) {
      continue;
    }
    anyConfigured = true;
    const result = await discoverModelsForKind(kind, access);
    if (result.error) {
      errors[kind] = result.error;
    }
    models.push(...result.models);
  }
  models.sort((a, b) => a.label.localeCompare(b.label));
  return { models, errors, anyConfigured };
}

export async function discoverGatewayModels(
  tenantId: string,
  probe?: { kind?: ProviderKind; apiKey: string; baseUrl: string },
): Promise<{
  models: DiscoveredModel[];
  source: "tenant" | "none";
  error?: string;
}> {
  if (probe) {
    const kind = probe.kind ?? "openai_compat";
    const result = await discoverModelsForKind(kind, {
      apiKey: probe.apiKey,
      baseUrl: probe.baseUrl,
    });
    return {
      models: result.models,
      source: "tenant",
      error: result.error,
    };
  }
  const all = await discoverAllTenantModels(tenantId);
  if (!all.anyConfigured) {
    return { models: [], source: "none" };
  }
  const firstError = Object.values(all.errors)[0];
  return {
    models: all.models,
    source: "tenant",
    error: all.models.length === 0 ? firstError : undefined,
  };
}
