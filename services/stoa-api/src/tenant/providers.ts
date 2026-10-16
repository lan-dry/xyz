import { getPool } from "../db/pool.js";

export type ProviderKind = "openai_compat" | "anthropic" | "google";

export type ProviderConnection = {
  apiKey: string;
  baseUrl: string;
};

export type ProviderKindStatus = {
  kind: ProviderKind;
  label: string;
  configured: boolean;
  baseUrl: string;
  keyHint: string | null;
};

export type AllProviderStatus = {
  providers: Record<ProviderKind, Omit<ProviderKindStatus, "kind">>;
  anyConfigured: boolean;
};

type ProviderSecrets = Partial<Record<ProviderKind, { apiKey?: string; baseUrl?: string }>> & {
  openai?: { apiKey?: string; baseUrl?: string };
};

export const PROVIDER_META: Record<
  ProviderKind,
  { label: string; defaultBaseUrl: string; hint: string }
> = {
  openai_compat: {
    label: "OpenAI-compatible",
    defaultBaseUrl: "https://api.openai.com",
    hint: "OpenAI, Azure OpenAI, LiteLLM, vLLM, etc.",
  },
  anthropic: {
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    hint: "Claude via Anthropic Messages API.",
  },
  google: {
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    hint: "Gemini via Google AI / Vertex-compatible key.",
  },
};

function readSecrets(settings: unknown): ProviderSecrets {
  if (!settings || typeof settings !== "object") {
    return {};
  }
  const providers = (settings as Record<string, unknown>).providers;
  if (!providers || typeof providers !== "object") {
    return {};
  }
  const raw = providers as ProviderSecrets;
  if (raw.openai?.apiKey && !raw.openai_compat?.apiKey) {
    raw.openai_compat = { ...raw.openai_compat, ...raw.openai };
  }
  return raw;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "••••";
  }
  return `••••${key.slice(-4)}`;
}

export async function getAllProviderStatus(tenantId: string): Promise<AllProviderStatus> {
  const row = await getPool().query<{ settings: unknown }>(
    `SELECT settings FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  const secrets = readSecrets(row.rows[0]?.settings);
  const providers = {} as AllProviderStatus["providers"];
  let anyConfigured = false;
  for (const kind of Object.keys(PROVIDER_META) as ProviderKind[]) {
    const apiKey = secrets[kind]?.apiKey?.trim();
    const baseUrl =
      secrets[kind]?.baseUrl?.trim().replace(/\/$/, "") ??
      PROVIDER_META[kind].defaultBaseUrl;
    const configured = Boolean(apiKey);
    if (configured) {
      anyConfigured = true;
    }
    providers[kind] = {
      label: PROVIDER_META[kind].label,
      configured,
      baseUrl,
      keyHint: apiKey ? maskApiKey(apiKey) : null,
    };
  }
  return { providers, anyConfigured };
}

/** @deprecated */
export async function getProviderStatus(tenantId: string): Promise<{
  openai: { configured: boolean; baseUrl: string; keyHint: string | null };
}> {
  const all = await getAllProviderStatus(tenantId);
  const o = all.providers.openai_compat;
  return {
    openai: {
      configured: o.configured,
      baseUrl: o.baseUrl,
      keyHint: o.keyHint,
    },
  };
}

export async function getProviderConnection(
  tenantId: string,
  kind: ProviderKind,
): Promise<ProviderConnection | null> {
  const row = await getPool().query<{ settings: unknown }>(
    `SELECT settings FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  const secrets = readSecrets(row.rows[0]?.settings);
  const apiKey = secrets[kind]?.apiKey?.trim();
  if (!apiKey) {
    return null;
  }
  const baseUrl =
    secrets[kind]?.baseUrl?.trim().replace(/\/$/, "") ??
    PROVIDER_META[kind].defaultBaseUrl;
  return { apiKey, baseUrl };
}

/** @deprecated */
export async function getOpenAiProviderConfig(
  tenantId: string,
): Promise<ProviderConnection | null> {
  return getProviderConnection(tenantId, "openai_compat");
}

export async function updateProviderConnection(
  tenantId: string,
  kind: ProviderKind,
  input: { apiKey?: string; baseUrl?: string; clearKey?: boolean },
): Promise<AllProviderStatus> {
  const row = await getPool().query<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  const current = row.rows[0]?.settings ?? {};
  const secrets = readSecrets(current);
  const entry = { ...secrets[kind] };
  if (input.clearKey) {
    delete entry.apiKey;
  } else if (input.apiKey?.trim()) {
    entry.apiKey = input.apiKey.trim();
  }
  if (input.baseUrl !== undefined) {
    entry.baseUrl =
      input.baseUrl.trim() || PROVIDER_META[kind].defaultBaseUrl;
  }
  const next = {
    ...current,
    providers: {
      ...secrets,
      [kind]: entry,
    },
  };
  await getPool().query(
    `UPDATE stoa_tenant SET settings = $2::jsonb WHERE id = $1`,
    [tenantId, JSON.stringify(next)],
  );
  return getAllProviderStatus(tenantId);
}

/** @deprecated */
export async function updateOpenAiProvider(
  tenantId: string,
  input: { apiKey?: string; baseUrl?: string; clearKey?: boolean },
): Promise<{ openai: { configured: boolean; baseUrl: string; keyHint: string | null } }> {
  const all = await updateProviderConnection(tenantId, "openai_compat", input);
  const o = all.providers.openai_compat;
  return {
    openai: {
      configured: o.configured,
      baseUrl: o.baseUrl,
      keyHint: o.keyHint,
    },
  };
}

export function parseModelRef(modelRef: string): {
  kind: ProviderKind;
  upstreamId: string;
} {
  const idx = modelRef.indexOf(":");
  if (idx <= 0) {
    return { kind: "openai_compat", upstreamId: modelRef };
  }
  const prefix = modelRef.slice(0, idx) as ProviderKind;
  if (prefix in PROVIDER_META) {
    return { kind: prefix, upstreamId: modelRef.slice(idx + 1) };
  }
  return { kind: "openai_compat", upstreamId: modelRef };
}

export function modelRef(kind: ProviderKind, upstreamId: string): string {
  return `${kind}:${upstreamId}`;
}
