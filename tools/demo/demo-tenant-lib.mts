/**
 * Shared helpers for the hosted Demo Bank tenant CLIs
 * (`pnpm pilot:provision-demo-tenant`, `pnpm pilot:seed-history`).
 *
 * HTTP only: these talk to the public ID + Aegis APIs like any client. They never
 * connect to the database directly, so they are safe to point at the hosted stack.
 *
 * Real people's emails and passwords live ONLY in the uncommitted local file
 * `.demo-tenant-emails.local.json` (gitignored). Shape: `.demo-tenant-emails.local.example.json`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "./load-env.mts";

export const PERSONA_KEYS = [
  "admin",
  "officer",
  "manager",
  "compliance",
  "fraud",
  "head",
  "dpo",
  "deputy",
] as const;
export type PersonaKey = (typeof PERSONA_KEYS)[number];

/** Bank role per persona. The admin and the deputy hold no bank role of their own. */
export const PERSONA_BANK_ROLE: Partial<Record<PersonaKey, string>> = {
  officer: "credit_officer",
  manager: "credit_manager",
  compliance: "compliance_officer",
  fraud: "fraud_analyst",
  head: "head_of_compliance",
  dpo: "dpo",
};

export type Persona = { email: string; display_name: string; password?: string };

export type TenantFile = {
  /** Aegis API origin, e.g. https://api.salanor.com */
  api_base: string;
  /** Salanor ID origin (defaults to api_base when ID is served on the same host). */
  id_base?: string;
  /** Console origin, used only to print case links. */
  console_origin?: string;
  organization?: { name?: string; slug?: string };
  /**
   * Optional stable Demo Bank ingest secret (>= 32 chars, no whitespace).
   * Used by Ops Populate / seed-history when DEMO_BANK_INGEST_KEY is unset.
   */
  ingest_key?: string;
  personas: Record<PersonaKey, Persona>;
};

export const TENANT_FILE_NAME = ".demo-tenant-emails.local.json";

/** Walk up from this file (source or dist/) to the monorepo root. */
export function repoRoot(): string {
  let dir = resolve(import.meta.dirname);
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(import.meta.dirname, "../..");
}

export function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

export function loadTenantFile(): TenantFile {
  loadEnvFile();
  const path = resolve(process.env.DEMO_TENANT_FILE?.trim() || resolve(repoRoot(), TENANT_FILE_NAME));
  if (!existsSync(path)) {
    fail(
      `Missing ${path}\n  Copy .demo-tenant-emails.local.example.json to ${TENANT_FILE_NAME} and fill in the real\n  addresses. That file is gitignored and must never be committed.`,
    );
  }
  let raw = readFileSync(path, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  let file: TenantFile;
  try {
    file = JSON.parse(raw) as TenantFile;
  } catch {
    fail(`${path} is not valid JSON.`);
  }
  if (!file.api_base?.trim()) fail(`${TENANT_FILE_NAME}: api_base is required.`);
  for (const key of PERSONA_KEYS) {
    const p = file.personas?.[key];
    if (!p?.email?.trim() || !p.display_name?.trim()) {
      fail(`${TENANT_FILE_NAME}: personas.${key} needs email and display_name.`);
    }
    if (/@example\.(invalid|com|org)$/i.test(p.email.trim()) || /REPLACE/i.test(p.email)) {
      fail(`${TENANT_FILE_NAME}: personas.${key}.email is still a placeholder.`);
    }
    if (p.password !== undefined && p.password.length < 10) {
      fail(`${TENANT_FILE_NAME}: personas.${key}.password must be at least 10 characters.`);
    }
  }
  if (!file.personas.admin.password) {
    fail(`${TENANT_FILE_NAME}: personas.admin.password is required (min 10 characters).`);
  }
  if (file.ingest_key !== undefined) {
    const key = file.ingest_key.trim();
    if (key.length < 32 || /\s/.test(key)) {
      fail(`${TENANT_FILE_NAME}: ingest_key must be at least 32 characters with no whitespace.`);
    }
    file.ingest_key = key;
  }
  const emails = PERSONA_KEYS.map((k) => file.personas[k].email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) {
    fail(`${TENANT_FILE_NAME}: every persona needs a distinct email.`);
  }
  file.api_base = file.api_base.trim().replace(/\/+$/, "");
  file.id_base = (file.id_base?.trim() || file.api_base).replace(/\/+$/, "");
  file.console_origin = file.console_origin?.trim().replace(/\/+$/, "");
  return file;
}

export function orgSlug(file: TenantFile): string {
  // Ops Demo tenants / CI can override without rewriting the local persona file.
  return (
    process.env.DEMO_ORG_SLUG?.trim() ||
    file.organization?.slug?.trim() ||
    "demo-bank"
  );
}
export function orgName(file: TenantFile): string {
  return (
    process.env.DEMO_ORG_NAME?.trim() ||
    file.organization?.name?.trim() ||
    "Demo Bank"
  );
}

/** Demo/test flags for provision (Ops create/reset + smoke/redteam-lab). */
export function orgDemoFlags(slug: string): { is_demo: boolean; is_test: boolean } {
  const isDemo = process.env.DEMO_ORG_IS_DEMO?.trim() !== "0";
  const isTest =
    process.env.DEMO_ORG_IS_TEST?.trim() === "1" ||
    /smoke/i.test(slug) ||
    slug === "redteam-lab";
  return { is_demo: isDemo, is_test: isTest };
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: unknown,
  ) {
    super(
      `${status} ${path}: ${
        body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : JSON.stringify(body)
      }`,
    );
  }
}

export async function httpJson<T>(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; data: T; headers: Headers }> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text.slice(0, 200) };
  }
  return { status: res.status, data: data as T, headers: res.headers };
}

/** A signed-in console session (ID login, cookie forwarded to the Aegis API). */
export class ConsoleSession {
  constructor(
    readonly apiBase: string,
    readonly idBase: string,
    readonly cookie: string,
    readonly organizationId: string,
  ) {}

  /** Sign in without knowing the organisation id, then read it from the console profile. */
  static async loginResolved(file: TenantFile, persona: Persona): Promise<ConsoleSession> {
    const first = await ConsoleSession.login(file, undefined, persona);
    const profile = await first.call<{ organization: { organization_id: string } }>(
      "/organization/profile",
    );
    return new ConsoleSession(
      first.apiBase,
      first.idBase,
      first.cookie,
      profile.data.organization.organization_id,
    );
  }

  static async login(
    file: TenantFile,
    organizationId: string | undefined,
    persona: Persona,
  ): Promise<ConsoleSession> {
    const res = await httpJson<{ error?: string; code?: string }>(
      `${file.id_base}/v1/id/auth/login`,
      {
        method: "POST",
        body: {
          email: persona.email.trim().toLowerCase(),
          password: persona.password,
          ...(organizationId ? { organization_id: organizationId } : {}),
        },
      },
    );
    if (res.status !== 200) {
      throw new HttpError(res.status, "/v1/id/auth/login", res.data);
    }
    const setCookies =
      typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    const cookie = setCookies
      .map((c) => c.split(";")[0] ?? "")
      .find((c) => c.startsWith("salanor_session="));
    if (!cookie) throw new Error("Login succeeded but no session cookie was returned.");
    return new ConsoleSession(
      file.api_base,
      file.id_base ?? file.api_base,
      cookie,
      organizationId ?? "",
    );
  }

  /** Salanor ID call with this session (e.g. invitations). */
  async idCall<T>(
    path: string,
    init: { method?: string; body?: unknown; okStatuses?: number[] } = {},
  ): Promise<{ status: number; data: T }> {
    const res = await httpJson<T>(`${this.idBase}/v1/id${path}`, {
      method: init.method,
      body: init.body,
      headers: { Cookie: this.cookie },
    });
    const ok = init.okStatuses ?? [200, 201];
    if (!ok.includes(res.status)) throw new HttpError(res.status, `id${path}`, res.data);
    return { status: res.status, data: res.data };
  }

  async call<T>(
    path: string,
    init: { method?: string; body?: unknown; okStatuses?: number[] } = {},
  ): Promise<{ status: number; data: T }> {
    const res = await httpJson<T>(`${this.apiBase}/v1/console${path}`, {
      method: init.method,
      body: init.body,
      headers: { Cookie: this.cookie },
    });
    const ok = init.okStatuses ?? [200, 201];
    if (!ok.includes(res.status)) throw new HttpError(res.status, path, res.data);
    return { status: res.status, data: res.data };
  }
}

/** Platform provisioning (ID service, bootstrap secret). The secret comes from the environment only. */
export function platformSecret(): string {
  loadEnvFile();
  const secret = process.env.PLATFORM_BOOTSTRAP_SECRET?.trim();
  if (!secret) {
    fail(
      "PLATFORM_BOOTSTRAP_SECRET is not set in your environment (never put it in the repo).\n  PowerShell:  $env:PLATFORM_BOOTSTRAP_SECRET = \"<value from the ID service>\"",
    );
  }
  return secret;
}

export async function platformCall<T>(
  file: TenantFile,
  path: string,
  init: { method?: string; body?: unknown; okStatuses?: number[] } = {},
): Promise<{ status: number; data: T }> {
  const res = await httpJson<T>(`${file.id_base}/v1/id/platform${path}`, {
    method: init.method,
    body: init.body,
    headers: { "X-Platform-Secret": platformSecret() },
  });
  const ok = init.okStatuses ?? [200, 201];
  if (!ok.includes(res.status)) throw new HttpError(res.status, `platform${path}`, res.data);
  return { status: res.status, data: res.data };
}

export async function findOrganizationId(
  file: TenantFile,
  slug: string,
): Promise<string | null> {
  const { data } = await platformCall<{
    organizations: Array<{ organization_id: string; slug: string }>;
  }>(file, `/organizations?q=${encodeURIComponent(slug)}`);
  return data.organizations.find((o) => o.slug === slug)?.organization_id ?? null;
}
