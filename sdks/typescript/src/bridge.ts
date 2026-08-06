import { AsyncLocalStorage } from "node:async_hooks";

import {
  newSpanId,
  newTraceId,
  recordDataAccess,
  recordDecision,
  recordLlmInvocation,
  recordProvenanceClaim,
  recordTraceStart,
  type RecordContext,
} from "./record.js";
import {
  wrapFetch,
  type WrapFetchConfig,
  type WrapFetchContext,
} from "./proxy/wrap-fetch.js";

const activeSession = new AsyncLocalStorage<GovernanceSession>();

export type GovernanceBridgeConfig = {
  apiBaseUrl: string;
  ingestApiKey: string;
  organizationId: string;
  agentId: string;
  keyId: string;
  privateKeyB64: string;
  actorPrincipal: string;
};

export type TraceStartInput = {
  triggerSource: string;
  triggerDetail?: string;
  businessContext?: string;
};

export type LlmRecordInput = {
  toolName: string;
  purpose: string;
  prompt: string;
  response: string;
  dataTouched?: string[];
  parentEventId?: string;
  spanId?: string;
  spanLabel?: string;
  payload?: Record<string, unknown>;
};

export type DecisionRecordInput = {
  decision: string;
  rationale: string;
  parentEventId?: string;
  spanId?: string;
  spanLabel?: string;
};

export type DataAccessRecordInput = {
  operation: "read" | "write";
  resource: string;
  fields?: string[];
  classification?: string;
  parentEventId?: string;
  spanId?: string;
  spanLabel?: string;
};

export type GovernedFetchInput = Omit<WrapFetchContext, "organizationId" | "agentId" | "keyId" | "traceId">;

function preview(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function signOptions(config: GovernanceBridgeConfig) {
  return { privateKeyB64: config.privateKeyB64, keyId: config.keyId };
}

function ingestOptions(config: GovernanceBridgeConfig) {
  return { apiBaseUrl: config.apiBaseUrl, ingestApiKey: config.ingestApiKey };
}

/** Returns the active governance session when inside `withTrace`. */
export function getActiveGovernanceSession(): GovernanceSession | undefined {
  return activeSession.getStore();
}

export class GovernanceSession {
  readonly traceId: string;
  readonly recordCtx: RecordContext;
  private readonly config: GovernanceBridgeConfig;
  private readonly defaultSpanId: string;
  private started = false;
  private closed = false;
  private rootEventId?: string;

  constructor(config: GovernanceBridgeConfig, traceId?: string) {
    this.config = config;
    this.traceId = traceId ?? newTraceId();
    this.defaultSpanId = newSpanId();
    this.recordCtx = {
      organizationId: config.organizationId,
      agentId: config.agentId,
      keyId: config.keyId,
      traceId: this.traceId,
      actorPrincipal: config.actorPrincipal,
    };
  }

  get spanId(): string {
    return this.defaultSpanId;
  }

  async start(input: TraceStartInput): Promise<string> {
    this.rootEventId = await recordTraceStart(
      this.recordCtx,
      input,
      {
        sign: signOptions(this.config),
        ingest: ingestOptions(this.config),
        spanId: this.defaultSpanId,
        spanLabel: "Session",
      },
    );
    this.started = true;
    return this.rootEventId;
  }

  async recordLlm(input: LlmRecordInput): Promise<string> {
    return recordLlmInvocation(
      this.recordCtx,
      {
        toolName: input.toolName,
        purpose: input.purpose,
        promptPreview: preview(input.prompt),
        responsePreview: preview(input.response),
        dataTouched: input.dataTouched,
        parentEventId: input.parentEventId ?? this.rootEventId,
        payload: input.payload,
      },
      {
        sign: signOptions(this.config),
        ingest: ingestOptions(this.config),
        spanId: input.spanId ?? this.defaultSpanId,
        spanLabel: input.spanLabel ?? "LLM",
      },
    );
  }

  async recordDecision(input: DecisionRecordInput): Promise<string> {
    return recordDecision(
      this.recordCtx,
      {
        decision: input.decision,
        rationale: input.rationale,
        parentEventId: input.parentEventId ?? this.rootEventId,
      },
      {
        sign: signOptions(this.config),
        ingest: ingestOptions(this.config),
        spanId: input.spanId ?? this.defaultSpanId,
        spanLabel: input.spanLabel ?? "Decision",
      },
    );
  }

  async recordDataAccess(input: DataAccessRecordInput): Promise<string> {
    return recordDataAccess(
      this.recordCtx,
      {
        operation: input.operation,
        resource: input.resource,
        fields: input.fields,
        classification: input.classification,
        parentEventId: input.parentEventId ?? this.rootEventId,
      },
      {
        sign: signOptions(this.config),
        ingest: ingestOptions(this.config),
        spanId: input.spanId ?? this.defaultSpanId,
        spanLabel: input.spanLabel ?? "Data access",
      },
    );
  }

  async governedFetch(
    url: string | URL,
    init: RequestInit | undefined,
    context: GovernedFetchInput,
  ): Promise<Response> {
    const wrapConfig: WrapFetchConfig = {
      context: {
        organizationId: this.config.organizationId,
        agentId: this.config.agentId,
        keyId: this.config.keyId,
        traceId: this.traceId,
        ...context,
      },
      sign: signOptions(this.config),
      ingest: ingestOptions(this.config),
    };
    return wrapFetch(url, init, wrapConfig);
  }

  async close(input?: { claim?: string; authority?: string }): Promise<string | undefined> {
    if (this.closed || !this.started) {
      return undefined;
    }
    this.closed = true;
    return recordProvenanceClaim(
      this.recordCtx,
      {
        claim: input?.claim ?? "Trace session completed.",
        authority: input?.authority ?? this.config.actorPrincipal,
        businessContext: "Governance bridge session closed.",
      },
      {
        sign: signOptions(this.config),
        ingest: ingestOptions(this.config),
        spanId: this.defaultSpanId,
        spanLabel: "Session close",
      },
    );
  }
}

export class GovernanceBridge {
  constructor(private readonly config: GovernanceBridgeConfig) {}

  static fromEnv(
    env: Record<string, string | undefined> = process.env,
    prefix = "AEGIS",
  ): GovernanceBridge | null {
    const enabled = env[`${prefix}_ENABLED`]?.trim();
    if (enabled !== "1" && enabled !== "true") {
      return null;
    }

    const apiBaseUrl = env[`${prefix}_API_URL`]?.trim();
    const ingestApiKey = env[`${prefix}_INGEST_API_KEY`]?.trim();
    const organizationId = env[`${prefix}_ORGANIZATION_ID`]?.trim();
    const agentId = env[`${prefix}_AGENT_ID`]?.trim();
    const keyId = env[`${prefix}_KEY_ID`]?.trim();
    const privateKeyB64 = env[`${prefix}_SIGNING_PRIVATE_KEY_B64`]?.trim();
    const actorPrincipal =
      env[`${prefix}_ACTOR_PRINCIPAL`]?.trim() ?? `agent:${agentId ?? "unknown"}`;

    if (
      !apiBaseUrl ||
      !ingestApiKey ||
      !organizationId ||
      !agentId ||
      !keyId ||
      !privateKeyB64
    ) {
      return null;
    }

    return new GovernanceBridge({
      apiBaseUrl,
      ingestApiKey,
      organizationId,
      agentId,
      keyId,
      privateKeyB64,
      actorPrincipal,
    });
  }

  isEnabled(): boolean {
    return Boolean(
      this.config.apiBaseUrl &&
        this.config.ingestApiKey &&
        this.config.organizationId &&
        this.config.agentId &&
        this.config.keyId &&
        this.config.privateKeyB64,
    );
  }

  getConfig(): Readonly<GovernanceBridgeConfig> {
    return this.config;
  }

  createSession(traceId?: string): GovernanceSession {
    return new GovernanceSession(this.config, traceId);
  }

  async withTrace<T>(
    input: TraceStartInput,
    fn: (session: GovernanceSession) => Promise<T>,
  ): Promise<T> {
    const session = this.createSession();
    await session.start(input);
    try {
      const result = await activeSession.run(session, async () => fn(session));
      await session.close();
      return result;
    } catch (error) {
      await session.close({
        claim: "Trace session ended with error.",
        authority: this.config.actorPrincipal,
      });
      throw error;
    }
  }
}

export function createGovernanceBridge(config: GovernanceBridgeConfig): GovernanceBridge {
  return new GovernanceBridge(config);
}

/** Response header clients may return so orchestrators (n8n, Zapier) can correlate runs. */
export const AEGIS_TRACE_ID_HEADER = "X-Aegis-Trace-Id";

export function buildAegisTraceUrl(
  consoleBaseUrl: string | undefined,
  traceId: string,
): string | null {
  if (!consoleBaseUrl?.trim()) return null;
  const base = consoleBaseUrl.trim().replace(/\/$/, "");
  return `${base}/aegis/traces/${encodeURIComponent(traceId)}`;
}

/**
 * Fail-open governance helper — recording errors must not break primary application flows.
 */
export async function safeGovernance<T>(
  label: string,
  fn: () => Promise<T>,
  log: (message: string, error: unknown) => void = defaultGovernanceLogger,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    log(`[aegis] ${label} failed`, error);
    return undefined;
  }
}

function defaultGovernanceLogger(message: string, error: unknown): void {
  console.warn(message, error);
}

export type WithOptionalTraceResult<T> = {
  result: T;
  traceId?: string;
  traceUrl?: string | null;
};

/**
 * Runs `fn` inside a trace when `bridge` is configured; otherwise calls `fn(null)`.
 * Use at HTTP route / job boundaries in any client application.
 */
export async function withOptionalTrace<T>(
  bridge: GovernanceBridge | null,
  input: TraceStartInput,
  fn: (session: GovernanceSession | null) => Promise<T>,
  options?: { consoleUrl?: string },
): Promise<WithOptionalTraceResult<T>> {
  if (!bridge) {
    return { result: await fn(null) };
  }

  let traceId: string | undefined;
  const result = await bridge.withTrace(input, async (session) => {
    traceId = session.traceId;
    return fn(session);
  });

  return {
    result,
    traceId,
    traceUrl: traceId ? buildAegisTraceUrl(options?.consoleUrl, traceId) : undefined,
  };
}

let cachedBridge: GovernanceBridge | null | undefined;

/** Singleton bridge for long-lived server processes (Next.js, Express, workers). */
export function getGovernanceBridgeSingleton(
  env: Record<string, string | undefined> = process.env,
  prefix = "AEGIS",
): GovernanceBridge | null {
  if (cachedBridge !== undefined) {
    return cachedBridge;
  }
  cachedBridge = GovernanceBridge.fromEnv(env, prefix);
  return cachedBridge;
}

/** Test helper — reset singleton between cases. */
export function resetGovernanceBridgeSingleton(): void {
  cachedBridge = undefined;
}
