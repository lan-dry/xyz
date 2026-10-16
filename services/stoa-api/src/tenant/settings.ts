import type { DlpProfile } from "../dlp/patterns.js";
import { getPool } from "../db/pool.js";

export type TenantCustomDlpPattern = {
  id: string;
  label: string;
  regex: string;
  token: string;
  enabled: boolean;
};

export type TenantDlpSettings = {
  profile: DlpProfile;
  /** Case-insensitive whole-word blocklist applied after profile patterns. */
  customTerms: string[];
  customPatterns: TenantCustomDlpPattern[];
};

export type AdminChatContentAccess = "metadata" | "redacted" | "full";

export type TenantAdminMaskSettings = {
  /** What admins may see when reviewing member conversations. */
  chatContentAccess: AdminChatContentAccess;
};

export type TenantUploadSettings = {
  allowAttachments: boolean;
  maxFileMb: number;
  allowedMimeTypes: string[];
};

export type TenantQuotaSettings = {
  enforce: boolean;
  maxMessagesPerUserMonth: number;
  maxMessagesOrgMonth: number;
  maxAttachmentMbPerOrgMonth: number;
};

export type TenantRetentionSettings = {
  enforce: boolean;
  messageRetentionDays: number | null;
  threadRetentionDays: number | null;
  attachmentRetentionDays: number | null;
  scheduleEnabled: boolean;
  /** UTC hour (0–23) when daily scheduled retention may run. */
  scheduleUtcHour: number;
};

export type TenantEmailSettings = {
  fromName: string | null;
  fromAddress: string | null;
  replyTo: string | null;
};

export type TenantComplianceSettings = {
  siemWebhookUrl: string | null;
  siemWebhookSecret: string | null;
  siemNotifyOnRetentionRun: boolean;
  siemStreamAuditEvents: boolean;
  exportSigningSecret: string | null;
};

export type TenantSettings = {
  enabledModelIds: string[];
  defaultModelId: string | null;
  dlp: TenantDlpSettings;
  adminMask: TenantAdminMaskSettings;
  uploads: TenantUploadSettings;
  quotas: TenantQuotaSettings;
  retention: TenantRetentionSettings;
  compliance: TenantComplianceSettings;
  email: TenantEmailSettings;
};

const DEFAULT_SETTINGS: TenantSettings = {
  enabledModelIds: [],
  defaultModelId: null,
  dlp: { profile: "financial", customTerms: [], customPatterns: [] },
  adminMask: {
    chatContentAccess: "redacted",
  },
  uploads: {
    allowAttachments: true,
    maxFileMb: 10,
    allowedMimeTypes: [
      "image/png",
      "image/jpeg",
      "image/webp",
      "application/pdf",
      "text/plain",
      "text/csv",
    ],
  },
  quotas: {
    enforce: true,
    maxMessagesPerUserMonth: 2000,
    maxMessagesOrgMonth: 50000,
    maxAttachmentMbPerOrgMonth: 5120,
  },
  retention: {
    enforce: false,
    messageRetentionDays: null,
    threadRetentionDays: null,
    attachmentRetentionDays: null,
    scheduleEnabled: false,
    scheduleUtcHour: 3,
  },
  compliance: {
    siemWebhookUrl: null,
    siemWebhookSecret: null,
    siemNotifyOnRetentionRun: false,
    siemStreamAuditEvents: false,
    exportSigningSecret: null,
  },
  email: {
    fromName: null,
    fromAddress: null,
    replyTo: null,
  },
};

function normalizeRetentionDays(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const n = Math.floor(value);
  if (n < 1 || n > 3650) {
    return null;
  }
  return n;
}

function normalizeCustomPatterns(raw: unknown): TenantCustomDlpPattern[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: TenantCustomDlpPattern[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const regex = typeof row.regex === "string" ? row.regex.trim() : "";
    const token =
      typeof row.token === "string" && row.token.trim()
        ? row.token.trim()
        : "[REDACTED_CUSTOM]";
    if (!regex || regex.length > 500) {
      continue;
    }
    try {
       
      new RegExp(regex);
    } catch {
      continue;
    }
    out.push({
      id:
        typeof row.id === "string" && row.id.trim()
          ? row.id.trim()
          : `custom-${out.length + 1}`,
      label: typeof row.label === "string" ? row.label.trim().slice(0, 80) : "",
      regex,
      token,
      enabled: row.enabled !== false,
    });
    if (out.length >= 32) {
      break;
    }
  }
  return out;
}

function normalizeCustomTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const terms = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 64);
  return [...new Set(terms)].slice(0, 128);
}

function normalizeScheduleUtcHour(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.retention.scheduleUtcHour;
  }
  const h = Math.floor(value);
  if (h < 0 || h > 23) {
    return DEFAULT_SETTINGS.retention.scheduleUtcHour;
  }
  return h;
}

export function normalizeDlp(raw: unknown): TenantDlpSettings {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_SETTINGS.dlp;
  }
  const obj = raw as Record<string, unknown>;
  const profile = obj.profile;
  let resolved: DlpProfile = "financial";
  if (profile === "standard" || profile === "financial" || profile === "strict") {
    resolved = profile;
  } else {
    const email = obj.email !== false;
    const phone = obj.phone !== false;
    if (email && phone) {
      resolved = "financial";
    } else if (email) {
      resolved = "standard";
    } else {
      resolved = "strict";
    }
  }
  return {
    profile: resolved,
    customTerms: normalizeCustomTerms(obj.customTerms),
    customPatterns: normalizeCustomPatterns(obj.customPatterns),
  };
}

function normalizeSettings(raw: unknown): TenantSettings {
  if (!raw || typeof raw !== "object") {
    return DEFAULT_SETTINGS;
  }
  const obj = raw as Record<string, unknown>;
  const enabledRaw = obj.enabledModelIds;
  const enabledModelIds = Array.isArray(enabledRaw)
    ? enabledRaw.filter((id): id is string => typeof id === "string")
    : DEFAULT_SETTINGS.enabledModelIds;
  const defaultModelId =
    typeof obj.defaultModelId === "string" ? obj.defaultModelId : null;

  const maskRaw = obj.adminMask;
  const maskObj =
    maskRaw && typeof maskRaw === "object"
      ? (maskRaw as Record<string, unknown>)
      : {};
  const uploadsRaw = obj.uploads;
  const uploadsObj =
    uploadsRaw && typeof uploadsRaw === "object"
      ? (uploadsRaw as Record<string, unknown>)
      : {};

  const quotasRaw = obj.quotas;
  const quotasObj =
    quotasRaw && typeof quotasRaw === "object"
      ? (quotasRaw as Record<string, unknown>)
      : {};
  const retentionRaw = obj.retention;
  const retentionObj =
    retentionRaw && typeof retentionRaw === "object"
      ? (retentionRaw as Record<string, unknown>)
      : {};
  const complianceRaw = obj.compliance;
  const complianceObj =
    complianceRaw && typeof complianceRaw === "object"
      ? (complianceRaw as Record<string, unknown>)
      : {};
  const emailRaw = obj.email;
  const emailObj =
    emailRaw && typeof emailRaw === "object"
      ? (emailRaw as Record<string, unknown>)
      : {};

  const uploadsNormalized = {
    allowAttachments:
      typeof uploadsObj.allowAttachments === "boolean"
        ? uploadsObj.allowAttachments
        : DEFAULT_SETTINGS.uploads.allowAttachments,
    maxFileMb:
      typeof uploadsObj.maxFileMb === "number" &&
      uploadsObj.maxFileMb >= 1 &&
      uploadsObj.maxFileMb <= 100
        ? uploadsObj.maxFileMb
        : DEFAULT_SETTINGS.uploads.maxFileMb,
    allowedMimeTypes: Array.isArray(uploadsObj.allowedMimeTypes)
      ? uploadsObj.allowedMimeTypes.filter((m): m is string => typeof m === "string")
      : DEFAULT_SETTINGS.uploads.allowedMimeTypes,
  };

  return {
    enabledModelIds,
    defaultModelId,
    dlp: normalizeDlp(obj.dlp),
    adminMask: {
      chatContentAccess:
        maskObj.chatContentAccess === "metadata" ||
        maskObj.chatContentAccess === "redacted" ||
        maskObj.chatContentAccess === "full"
          ? maskObj.chatContentAccess
          : DEFAULT_SETTINGS.adminMask.chatContentAccess,
    },
    uploads: uploadsNormalized,
    quotas: {
      enforce:
        typeof quotasObj.enforce === "boolean"
          ? quotasObj.enforce
          : DEFAULT_SETTINGS.quotas.enforce,
      maxMessagesPerUserMonth:
        typeof quotasObj.maxMessagesPerUserMonth === "number"
          ? Math.max(0, quotasObj.maxMessagesPerUserMonth)
          : DEFAULT_SETTINGS.quotas.maxMessagesPerUserMonth,
      maxMessagesOrgMonth:
        typeof quotasObj.maxMessagesOrgMonth === "number"
          ? Math.max(0, quotasObj.maxMessagesOrgMonth)
          : DEFAULT_SETTINGS.quotas.maxMessagesOrgMonth,
      maxAttachmentMbPerOrgMonth:
        typeof quotasObj.maxAttachmentMbPerOrgMonth === "number"
          ? Math.max(0, quotasObj.maxAttachmentMbPerOrgMonth)
          : DEFAULT_SETTINGS.quotas.maxAttachmentMbPerOrgMonth,
    },
    retention: {
      enforce:
        typeof retentionObj.enforce === "boolean"
          ? retentionObj.enforce
          : DEFAULT_SETTINGS.retention.enforce,
      messageRetentionDays: normalizeRetentionDays(
        retentionObj.messageRetentionDays,
      ),
      threadRetentionDays: normalizeRetentionDays(
        retentionObj.threadRetentionDays,
      ),
      attachmentRetentionDays: normalizeRetentionDays(
        retentionObj.attachmentRetentionDays,
      ),
      scheduleEnabled:
        typeof retentionObj.scheduleEnabled === "boolean"
          ? retentionObj.scheduleEnabled
          : DEFAULT_SETTINGS.retention.scheduleEnabled,
      scheduleUtcHour: normalizeScheduleUtcHour(retentionObj.scheduleUtcHour),
    },
    compliance: {
      siemWebhookUrl:
        typeof complianceObj.siemWebhookUrl === "string"
          ? complianceObj.siemWebhookUrl.trim() || null
          : DEFAULT_SETTINGS.compliance.siemWebhookUrl,
      siemWebhookSecret:
        typeof complianceObj.siemWebhookSecret === "string"
          ? complianceObj.siemWebhookSecret.trim() || null
          : DEFAULT_SETTINGS.compliance.siemWebhookSecret,
      siemNotifyOnRetentionRun:
        typeof complianceObj.siemNotifyOnRetentionRun === "boolean"
          ? complianceObj.siemNotifyOnRetentionRun
          : DEFAULT_SETTINGS.compliance.siemNotifyOnRetentionRun,
      siemStreamAuditEvents:
        typeof complianceObj.siemStreamAuditEvents === "boolean"
          ? complianceObj.siemStreamAuditEvents
          : DEFAULT_SETTINGS.compliance.siemStreamAuditEvents,
      exportSigningSecret:
        typeof complianceObj.exportSigningSecret === "string"
          ? complianceObj.exportSigningSecret.trim() || null
          : DEFAULT_SETTINGS.compliance.exportSigningSecret,
    },
    email: {
      fromName:
        typeof emailObj.fromName === "string"
          ? emailObj.fromName.trim().slice(0, 80) || null
          : DEFAULT_SETTINGS.email.fromName,
      fromAddress:
        typeof emailObj.fromAddress === "string"
          ? emailObj.fromAddress.trim().slice(0, 320) || null
          : DEFAULT_SETTINGS.email.fromAddress,
      replyTo:
        typeof emailObj.replyTo === "string"
          ? emailObj.replyTo.trim().slice(0, 320) || null
          : DEFAULT_SETTINGS.email.replyTo,
    },
  };
}

function readSettingsObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return { ...(raw as Record<string, unknown>) };
}

export async function getTenantSettings(
  tenantId: string,
): Promise<TenantSettings> {
  const row = await getPool().query<{ settings: unknown }>(
    `SELECT settings FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  return normalizeSettings(row.rows[0]?.settings);
}

export async function updateTenantSettings(
  tenantId: string,
  patch: {
    enabledModelIds?: string[];
    defaultModelId?: string | null;
    dlp?: Partial<TenantDlpSettings>;
    adminMask?: Partial<TenantAdminMaskSettings>;
    uploads?: Partial<TenantUploadSettings>;
    quotas?: Partial<TenantQuotaSettings>;
    retention?: Partial<TenantRetentionSettings>;
    compliance?: Partial<TenantComplianceSettings>;
    email?: Partial<TenantEmailSettings>;
  },
): Promise<TenantSettings> {
  const row = await getPool().query<{ settings: unknown }>(
    `SELECT settings FROM stoa_tenant WHERE id = $1`,
    [tenantId],
  );
  const rawSettings = readSettingsObject(row.rows[0]?.settings);
  const current = normalizeSettings(rawSettings);
  const next: TenantSettings = {
    enabledModelIds: patch.enabledModelIds ?? current.enabledModelIds,
    defaultModelId:
      patch.defaultModelId !== undefined
        ? patch.defaultModelId
        : current.defaultModelId,
    dlp: {
      profile: patch.dlp?.profile ?? current.dlp.profile,
      customTerms: patch.dlp?.customTerms ?? current.dlp.customTerms,
      customPatterns: patch.dlp?.customPatterns ?? current.dlp.customPatterns,
    },
    adminMask: {
      chatContentAccess:
        patch.adminMask?.chatContentAccess ??
        current.adminMask.chatContentAccess,
    },
    uploads: {
      allowAttachments:
        patch.uploads?.allowAttachments ?? current.uploads.allowAttachments,
      maxFileMb: patch.uploads?.maxFileMb ?? current.uploads.maxFileMb,
      allowedMimeTypes:
        patch.uploads?.allowedMimeTypes ?? current.uploads.allowedMimeTypes,
    },
    quotas: {
      enforce: patch.quotas?.enforce ?? current.quotas.enforce,
      maxMessagesPerUserMonth:
        patch.quotas?.maxMessagesPerUserMonth ??
        current.quotas.maxMessagesPerUserMonth,
      maxMessagesOrgMonth:
        patch.quotas?.maxMessagesOrgMonth ??
        current.quotas.maxMessagesOrgMonth,
      maxAttachmentMbPerOrgMonth:
        patch.quotas?.maxAttachmentMbPerOrgMonth ??
        current.quotas.maxAttachmentMbPerOrgMonth,
    },
    retention: {
      enforce: patch.retention?.enforce ?? current.retention.enforce,
      messageRetentionDays:
        patch.retention?.messageRetentionDays !== undefined
          ? normalizeRetentionDays(patch.retention.messageRetentionDays)
          : current.retention.messageRetentionDays,
      threadRetentionDays:
        patch.retention?.threadRetentionDays !== undefined
          ? normalizeRetentionDays(patch.retention.threadRetentionDays)
          : current.retention.threadRetentionDays,
      attachmentRetentionDays:
        patch.retention?.attachmentRetentionDays !== undefined
          ? normalizeRetentionDays(patch.retention.attachmentRetentionDays)
          : current.retention.attachmentRetentionDays,
      scheduleEnabled:
        patch.retention?.scheduleEnabled ?? current.retention.scheduleEnabled,
      scheduleUtcHour:
        patch.retention?.scheduleUtcHour !== undefined
          ? normalizeScheduleUtcHour(patch.retention.scheduleUtcHour)
          : current.retention.scheduleUtcHour,
    },
    compliance: {
      siemWebhookUrl:
        patch.compliance?.siemWebhookUrl !== undefined
          ? patch.compliance.siemWebhookUrl?.trim() || null
          : current.compliance.siemWebhookUrl,
      siemWebhookSecret:
        patch.compliance?.siemWebhookSecret !== undefined
          ? patch.compliance.siemWebhookSecret?.trim() || null
          : current.compliance.siemWebhookSecret,
      siemNotifyOnRetentionRun:
        patch.compliance?.siemNotifyOnRetentionRun ??
        current.compliance.siemNotifyOnRetentionRun,
      siemStreamAuditEvents:
        patch.compliance?.siemStreamAuditEvents ??
        current.compliance.siemStreamAuditEvents,
      exportSigningSecret:
        patch.compliance?.exportSigningSecret !== undefined
          ? patch.compliance.exportSigningSecret?.trim() || null
          : current.compliance.exportSigningSecret,
    },
    email: {
      fromName:
        patch.email?.fromName !== undefined
          ? patch.email.fromName?.trim().slice(0, 80) || null
          : current.email.fromName,
      fromAddress:
        patch.email?.fromAddress !== undefined
          ? patch.email.fromAddress?.trim().slice(0, 320) || null
          : current.email.fromAddress,
      replyTo:
        patch.email?.replyTo !== undefined
          ? patch.email.replyTo?.trim().slice(0, 320) || null
          : current.email.replyTo,
    },
  };
  if (patch.enabledModelIds !== undefined && next.enabledModelIds.length === 0) {
    throw new Error("Enable at least one model from your connected provider");
  }
  if (
    next.defaultModelId &&
    next.enabledModelIds.length > 0 &&
    !next.enabledModelIds.includes(next.defaultModelId)
  ) {
    throw new Error("Default model must be one of the enabled models");
  }
  const merged = {
    ...rawSettings,
    ...next,
  };
  await getPool().query(
    `UPDATE stoa_tenant SET settings = $2::jsonb WHERE id = $1`,
    [tenantId, JSON.stringify(merged)],
  );
  return next;
}

export async function resolveDefaultModelId(
  tenantId: string,
): Promise<string | null> {
  const settings = await getTenantSettings(tenantId);
  if (
    settings.defaultModelId &&
    settings.enabledModelIds.includes(settings.defaultModelId)
  ) {
    return settings.defaultModelId;
  }
  return settings.enabledModelIds[0] ?? null;
}
