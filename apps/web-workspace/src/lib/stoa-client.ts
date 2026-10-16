import { formatApiError } from "./format-api-error";

export type ThreadSummary = {
  id: string;
  title: string;
  modelId: string;
  updatedAt: string;
  messageCount?: number;
};

export type RedactionManifestEntry = {
  group: string;
  label: string;
  count: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  /** What the member reads and copies: private values restored. */
  content: string;
  /** Exactly what the model provider received or returned, when it differs. */
  contentUpstream?: string;
  redactionCount: number;
  redactionManifest?: RedactionManifestEntry[];
  restoredCount?: number;
  createdAt: string;
  attachments?: MessageAttachment[];
};

export type StoaModel = {
  id: string;
  label: string;
  provider: string;
};

export type SessionInfo = {
  authMode: string;
  role: string;
  isAdmin: boolean;
  adminConsole?: {
    canAccess: boolean;
    canWrite: boolean;
    readOnly: boolean;
    siteManagerOnly: boolean;
    managedSiteIds: string[];
  };
  organizationId: string | null;
  user: { id: string; email: string; displayName: string };
  tenant: { slug: string; name: string };
  workspacePolicy?: {
    allowAttachments: boolean;
    maxFileMb: number;
    quotasEnforced: boolean;
  };
  workspaceChat?: {
    ready: boolean;
    setupPhase: "need_provider" | "need_policy" | "ready";
    providerConnected: boolean;
    googleConfigured: boolean;
    dlpProfile: string;
    enabledModelCount: number;
    defaultModelId: string | null;
  };
  workspaceDlp?: {
    profile: "standard" | "financial" | "strict";
    profileLabel: string;
    profileDescription: string;
    categories: { id: string; label: string }[];
    customTermCount: number;
    customPatternCount: number;
    usesCustomRules: boolean;
    method: "pattern_rules";
    memberNote: string;
    rehydrationNote?: string;
  };
};

export type MessageAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  byteSize: number;
};

export type ProviderKind = "openai_compat" | "anthropic" | "google";

export type ProviderKindMeta = {
  label: string;
  configured: boolean;
  baseUrl: string;
  keyHint: string | null;
};

export type AllProvidersStatus = {
  providers: Record<ProviderKind, ProviderKindMeta>;
  anyConfigured: boolean;
  note?: string;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  userEmail: string | null;
};

export type AdminOverview = {
  tenant: { name: string; slug: string };
  stats: {
    users: number;
    threads: number;
    messages: number;
    auditEvents: number;
  };
  enabledModels: StoaModel[];
  providerConnected: boolean;
  workspaceReady: boolean;
  provider: {
    connected: { label: string; keyHint: string | null }[];
    catalogCount: number;
    error: string | null;
  };
  policy: {
    profile: string;
    enabledModelCount: number;
    defaultModelId: string | null;
    allowAttachments: boolean;
    quotasEnforced: boolean;
    conversationReview: "metadata" | "redacted" | "full";
  };
  usage: {
    periodMonth: string;
    orgMessages: number;
    orgAttachmentMb: number;
  };
  privacy: {
    protectedMessages: number;
    valuesWithheld: number;
    byCategory: { group: string; label: string; count: number }[];
  };
};

export type AdminUser = {
  id: string;
  email: string;
  externalId: string;
  displayName: string | null;
  createdAt: string;
  threadCount: number;
  siteId: string | null;
  siteName: string | null;
};

export type AdminSite = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  directoryGroupExternalId: string | null;
  memberCount: number;
};

export type AdminSiteDetail = {
  site: AdminSite & {
    createdAt: string;
    updatedAt: string;
    threadCount: number;
    messageCount: number;
  };
};

export type AdminSiteMember = {
  id: string;
  email: string;
  externalId: string;
  displayName: string | null;
  threadCount: number;
};

export type AdminUserDetail = {
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
    siteId: string | null;
    siteName: string | null;
    threadCount: number;
    messageCount: number;
    monthMessages: number;
  };
  chatContentAccess: "metadata" | "redacted" | "full";
};

export type AdminThreadSummary = {
  id: string;
  title: string;
  modelId: string;
  updatedAt: string;
  messageCount: number;
};

export type AdminThreadReview = {
  thread: {
    id: string;
    title: string;
    modelId: string;
    userEmail: string;
  };
  contentAccess: "metadata" | "redacted" | "full";
  messages: {
    id: string;
    role: string;
    content: string | null;
    contentLength: number;
    redactionCount: number;
    redactionManifest?: RedactionManifestEntry[];
    createdAt: string;
  }[];
};

export type AdminReportsSummary = {
  periodMonth: string;
  usage: {
    orgMessages: number;
    orgAttachmentBytes: number;
    quotaPercent: number;
  };
  redactionTotal: number;
  models: { modelId: string; userMessages: number }[];
  topUsers: { email: string; userMessages: number }[];
  auditLast30Days: { eventType: string; count: number }[];
  siteActivity: { site: string; userMessages: number }[];
  insights: string[];
  chatContentAccess: "metadata" | "redacted" | "full";
};

export type AdminSettings = {
  availableModels: StoaModel[];
  providerSource: "tenant" | "none";
  providerConfigured?: boolean;
  providerError: string | null;
  providerErrors?: Partial<Record<ProviderKind, string>>;
  settings: {
    enabledModelIds: string[];
    defaultModelId: string | null;
    dlp: {
      profile: "standard" | "financial" | "strict";
      customTerms: string[];
      customPatterns: {
        id: string;
        label: string;
        regex: string;
        token: string;
        enabled: boolean;
      }[];
    };
    adminMask: {
      chatContentAccess: "metadata" | "redacted" | "full";
    };
    uploads: {
      allowAttachments: boolean;
      maxFileMb: number;
      allowedMimeTypes: string[];
    };
    quotas: {
      enforce: boolean;
      maxMessagesPerUserMonth: number;
      maxMessagesOrgMonth: number;
      maxAttachmentMbPerOrgMonth: number;
    };
    retention: {
      enforce: boolean;
      messageRetentionDays: number | null;
      threadRetentionDays: number | null;
      attachmentRetentionDays: number | null;
      scheduleEnabled: boolean;
      scheduleUtcHour: number;
    };
    compliance: {
      siemWebhookUrl: string | null;
      siemNotifyOnRetentionRun: boolean;
      siemStreamAuditEvents: boolean;
      siemWebhookSecretSet: boolean;
      exportSigningSecretSet: boolean;
    };
    email: {
      fromName: string | null;
      fromAddress: string | null;
      replyTo: string | null;
    };
  };
  enabledModels: StoaModel[];
};

export type AdminSiteManager = {
  stoaUserId: string;
  email: string;
  externalId: string;
  displayName: string | null;
};

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(formatApiError(body || response.statusText));
  }
  return response.json() as Promise<T>;
}

type ChatMutationBody = {
  error?: string;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
  threadTitle?: string;
};

async function parseChatMutationResponse(
  response: Response,
): Promise<{ messages: ChatMessage[]; threadTitle: string; providerError?: string }> {
  const bodyText = await response.text();
  let data: ChatMutationBody = {};
  if (bodyText.trim()) {
    try {
      data = JSON.parse(bodyText) as ChatMutationBody;
    } catch {
      if (!response.ok) {
        throw new Error(formatApiError(bodyText || response.statusText));
      }
    }
  }
  if (!response.ok) {
    if (data.userMessage) {
      return {
        messages: data.assistantMessage
          ? [data.userMessage, data.assistantMessage]
          : [data.userMessage],
        threadTitle: data.threadTitle ?? "New chat",
        providerError: data.error ?? formatApiError(bodyText || response.statusText),
      };
    }
    throw new Error(formatApiError(bodyText || response.statusText));
  }
  if (!data.userMessage) {
    throw new Error("Invalid response from chat API.");
  }
  return {
    messages: data.assistantMessage
      ? [data.userMessage, data.assistantMessage]
      : [data.userMessage],
    threadTitle: data.threadTitle ?? "New chat",
  };
}

function stoaFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`/api/stoa/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function fetchSession(): Promise<SessionInfo> {
  return parseJson(await stoaFetch("me"));
}

export async function fetchModels(): Promise<StoaModel[]> {
  const data = await parseJson<{ models: StoaModel[] }>(
    await stoaFetch("models"),
  );
  return data.models;
}

export async function listThreads(): Promise<ThreadSummary[]> {
  const data = await parseJson<{ threads: ThreadSummary[] }>(
    await stoaFetch("threads"),
  );
  return data.threads;
}

export async function createThread(
  modelId: string,
  options?: { forceNew?: boolean },
): Promise<ThreadSummary & { reused?: boolean }> {
  const data = await parseJson<{
    id: string;
    title: string;
    modelId: string;
    reused?: boolean;
  }>(
    await stoaFetch("threads", {
      method: "POST",
      body: JSON.stringify({ modelId, forceNew: options?.forceNew === true }),
    }),
  );
  return {
    id: data.id,
    title: data.title,
    modelId: data.modelId,
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    reused: data.reused,
  };
}

export async function updateThread(
  threadId: string,
  patch: { modelId?: string; title?: string },
): Promise<{ id: string; title: string; modelId: string }> {
  return parseJson(
    await stoaFetch(`threads/${threadId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );
}

export async function updateThreadModel(
  threadId: string,
  modelId: string,
): Promise<void> {
  await updateThread(threadId, { modelId });
}

export async function updateThreadTitle(
  threadId: string,
  title: string,
): Promise<void> {
  await updateThread(threadId, { title });
}

export async function deleteThread(threadId: string): Promise<void> {
  await parseJson(
    await stoaFetch(`threads/${threadId}`, {
      method: "DELETE",
    }),
  );
}

export async function listMessages(threadId: string): Promise<ChatMessage[]> {
  const data = await parseJson<{ messages: ChatMessage[] }>(
    await stoaFetch(`threads/${threadId}/messages`),
  );
  return data.messages;
}

export async function uploadAttachment(file: File): Promise<MessageAttachment> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/stoa/attachments", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(formatApiError(body));
  }
  const data = (await response.json()) as {
    attachment: MessageAttachment & { scanStatus: string };
  };
  return data.attachment;
}

export async function fetchAdminUsage(): Promise<{
  periodMonth: string;
  usage: { orgMessages: number; orgAttachmentBytes: number };
  quotas: AdminSettings["settings"]["quotas"];
  trackingReady?: boolean;
  notice?: string;
  users: {
    id: string;
    email: string;
    displayName: string | null;
    threadCount: number;
    messageCount: number;
    attachmentBytes: number;
    createdAt: string;
  }[];
}> {
  return parseJson(await stoaFetch("admin/usage"));
}

export async function sendMessage(
  threadId: string,
  content: string,
  attachmentIds?: string[],
): Promise<{
  messages: ChatMessage[];
  threadTitle: string;
  providerError?: string;
}> {
  return parseChatMutationResponse(
    await stoaFetch(`threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, attachmentIds }),
    }),
  );
}

export async function editMessage(
  threadId: string,
  messageId: string,
  content: string,
): Promise<{
  messages: ChatMessage[];
  threadTitle: string;
  providerError?: string;
}> {
  return parseChatMutationResponse(
    await stoaFetch(`threads/${threadId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  );
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return parseJson(await stoaFetch("admin/overview"));
}

export async function fetchAdminUsers(): Promise<{ users: AdminUser[] }> {
  return parseJson(await stoaFetch("admin/users"));
}

export async function fetchAdminProviders(): Promise<AllProvidersStatus> {
  return parseJson(await stoaFetch("admin/providers"));
}

export async function saveProvider(
  kind: ProviderKind,
  input: { apiKey?: string; baseUrl?: string; clearKey?: boolean },
): Promise<AllProvidersStatus> {
  return parseJson(
    await stoaFetch(`admin/providers/${kind}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export async function testProvider(
  kind: ProviderKind,
  input?: { apiKey?: string; baseUrl?: string },
): Promise<{
  ok: boolean;
  provider?: ProviderKind;
  modelCount?: number;
  sampleModelIds?: string[];
  models?: StoaModel[];
  error?: string;
}> {
  const response = await stoaFetch(`admin/providers/${kind}/test`, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
  return response.json() as Promise<{
    ok: boolean;
    provider?: ProviderKind;
    modelCount?: number;
    sampleModelIds?: string[];
    models?: StoaModel[];
    error?: string;
  }>;
}

export async function fetchProviderModels(): Promise<{
  models: StoaModel[];
  source: "tenant" | "none";
  error: string | null;
  errors?: Partial<Record<ProviderKind, string>>;
}> {
  return parseJson(await stoaFetch("admin/providers/models"));
}

export async function fetchAdminAudit(input: {
  limit: number;
  offset: number;
}): Promise<{ events: AuditEvent[]; total: number }> {
  const params = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
  });
  return parseJson(await stoaFetch(`admin/audit?${params.toString()}`));
}

export async function fetchAdminSettings(): Promise<AdminSettings> {
  return parseJson(await stoaFetch("admin/settings"));
}

export async function fetchAdminSites(): Promise<{ sites: AdminSite[] }> {
  return parseJson(await stoaFetch("admin/sites"));
}

export async function fetchAdminSiteDetail(
  siteId: string,
): Promise<AdminSiteDetail> {
  return parseJson(await stoaFetch(`admin/sites/${siteId}`));
}

export async function fetchAdminSiteMembers(siteId: string): Promise<{
  members: AdminSiteMember[];
}> {
  return parseJson(await stoaFetch(`admin/sites/${siteId}/members`));
}

export async function updateAdminSite(
  siteId: string,
  input: {
    name?: string;
    description?: string | null;
    directoryGroupExternalId?: string | null;
  },
): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/sites/${siteId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export async function createAdminSite(input: {
  name: string;
  slug?: string;
}): Promise<{ site: AdminSite }> {
  const data = await parseJson<{
    site: {
      id: string;
      name: string;
      slug: string;
      memberCount: number;
    };
  }>(
    await stoaFetch("admin/sites", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return {
    site: {
      ...data.site,
      description: null,
      directoryGroupExternalId: null,
    },
  };
}

export async function deleteAdminSite(siteId: string): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/sites/${siteId}`, { method: "DELETE" }),
  );
}

export async function assignUserSite(
  stoaUserId: string,
  siteId: string | null,
): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/users/${stoaUserId}/site`, {
      method: "PATCH",
      body: JSON.stringify({ siteId }),
    }),
  );
}

export async function fetchAdminUserDetail(
  stoaUserId: string,
): Promise<AdminUserDetail> {
  return parseJson(await stoaFetch(`admin/users/${stoaUserId}`));
}

export async function fetchAdminUserThreads(
  stoaUserId: string,
): Promise<{ threads: AdminThreadSummary[] }> {
  return parseJson(await stoaFetch(`admin/users/${stoaUserId}/threads`));
}

export async function fetchAdminThreadReview(
  threadId: string,
): Promise<AdminThreadReview> {
  return parseJson(await stoaFetch(`admin/threads/${threadId}`));
}

export async function fetchAdminReportsSummary(): Promise<AdminReportsSummary> {
  return parseJson(await stoaFetch("admin/reports/summary"));
}

export async function fetchAdminExecutiveSummary(): Promise<{ summary: string }> {
  return parseJson(
    await stoaFetch("admin/reports/executive-summary", { method: "POST" }),
  );
}

export async function fetchAdminSiteManagers(siteId: string): Promise<{
  managers: AdminSiteManager[];
}> {
  return parseJson(await stoaFetch(`admin/sites/${siteId}/managers`));
}

export async function addAdminSiteManager(
  siteId: string,
  stoaUserId: string,
): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/sites/${siteId}/managers`, {
      method: "POST",
      body: JSON.stringify({ stoaUserId }),
    }),
  );
}

export async function removeAdminSiteManager(
  siteId: string,
  stoaUserId: string,
): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/sites/${siteId}/managers/${stoaUserId}`, {
      method: "DELETE",
    }),
  );
}

export async function runAdminRetention(): Promise<{
  ok: boolean;
  result: {
    threadsDeleted: number;
    messagesDeleted: number;
    attachmentsDeleted: number;
  };
}> {
  return parseJson(
    await stoaFetch("admin/compliance/retention/run", { method: "POST" }),
  );
}

export async function fetchAdminComplianceStatus(): Promise<{
  exportSigningConfigured: boolean;
  retentionEnforced: boolean;
}> {
  return parseJson(await stoaFetch("admin/compliance/status"));
}

export async function testAdminSiemWebhook(): Promise<{ ok: boolean }> {
  return parseJson(
    await stoaFetch("admin/compliance/siem/test", { method: "POST" }),
  );
}

export function adminExportAuditUrl(from?: string, to?: string): string {
  const params = new URLSearchParams({ format: "csv" });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/api/stoa/admin/exports/audit?${params.toString()}`;
}

export function adminExportAuditBundleUrl(from?: string, to?: string): string {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const q = params.toString();
  return `/api/stoa/admin/exports/audit/bundle${q ? `?${q}` : ""}`;
}

export function adminExportUsageUrl(format: "csv" | "json" = "csv"): string {
  return `/api/stoa/admin/exports/usage?format=${format}`;
}

export type GatewayCredential = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export async function fetchGatewayCredentials(): Promise<{
  credentials: GatewayCredential[];
  endpoint: string;
}> {
  return parseJson(await stoaFetch("admin/gateway/credentials"));
}

export async function createGatewayCredential(name: string): Promise<{
  credential: GatewayCredential;
  api_key: string;
  message: string;
}> {
  return parseJson(
    await stoaFetch("admin/gateway/credentials", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  );
}

export async function revokeGatewayCredential(
  credentialId: string,
): Promise<void> {
  await parseJson(
    await stoaFetch(`admin/gateway/credentials/${credentialId}`, {
      method: "DELETE",
    }),
  );
}

export async function saveAdminSettings(input: {
  enabledModelIds?: string[];
  defaultModelId?: string | null;
  dlp?: {
    profile?: "standard" | "financial" | "strict";
    customTerms?: string[];
    customPatterns?: AdminSettings["settings"]["dlp"]["customPatterns"];
  };
  adminMask?: {
    chatContentAccess?: "metadata" | "redacted" | "full";
  };
  uploads?: { allowAttachments?: boolean; maxFileMb?: number };
  quotas?: {
    enforce?: boolean;
    maxMessagesPerUserMonth?: number;
    maxMessagesOrgMonth?: number;
    maxAttachmentMbPerOrgMonth?: number;
  };
  retention?: Partial<AdminSettings["settings"]["retention"]>;
  compliance?: {
    siemWebhookUrl?: string | null;
    siemWebhookSecret?: string | null;
    siemNotifyOnRetentionRun?: boolean;
    siemStreamAuditEvents?: boolean;
    exportSigningSecret?: string | null;
  };
  email?: Partial<AdminSettings["settings"]["email"]>;
}): Promise<AdminSettings> {
  return parseJson(
    await stoaFetch("admin/settings", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export type DlpPreview = {
  upstream: string;
  redactionCount: number;
  manifest: RedactionManifestEntry[];
  items: {
    token: string;
    value: string;
    label: string;
    /** Safe fact the model receives instead of the value, e.g. "Visa card ending 1111". */
    modelHint: string | null;
  }[];
};

/** Runs the redaction policy (including unsaved form values) on sample text without storing it. */
export async function previewDlp(input: {
  text: string;
  dlp: NonNullable<Parameters<typeof saveAdminSettings>[0]["dlp"]>;
}): Promise<DlpPreview> {
  return parseJson(
    await stoaFetch("admin/dlp/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}
