import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { handleIngest, parseIngestBody, type IngestLogEntry } from "@salanor/aegis-ledger-sdk/ingest-handler";
import type { Prisma } from "@prisma/client";

import { authorizeIngestRequest, extractIngestApiKey } from "@/lib/aegis/ingest-auth";
import { ingestErrorResponse } from "@/lib/aegis/ingest-errors";
import { enforceIngestPolicy } from "@/lib/aegis/ingest-policy";
import {
  createNatsIngestPublisher,
  isBusIngestEnabled,
} from "@/lib/aegis/nats-ingest-publisher";
import { prisma } from "@/lib/prisma";
import { captureException } from "@/lib/sentry";

export const runtime = "nodejs";

function ingestLog(entry: IngestLogEntry): void {
  console.log(JSON.stringify(entry));
}

function createScopedIngestStore(organizationId: string) {
  return {
    async findByIdempotencyKey(key: string) {
      const row = await prisma.aegisIngestEvent.findUnique({
        where: { idempotencyKey: key },
      });
      if (!row) return null;
      const payload = row.payload as {
        event_id: string;
      };
      return {
        rowId: row.id,
        eventId: payload.event_id,
        traceId: row.traceId,
        created: false,
      };
    },
    async create(input: {
      traceId: string;
      payload: unknown;
      idempotencyKey?: string;
    }) {
      const row = await prisma.aegisIngestEvent.create({
        data: {
          organizationId,
          traceId: input.traceId,
          payload: input.payload as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      const payload = row.payload as {
        event_id: string;
      };
      return {
        rowId: row.id,
        eventId: payload.event_id,
        traceId: row.traceId,
        created: true,
      };
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await authorizeIngestRequest(req.headers);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const providedApiKey = extractIngestApiKey(req.headers);
  if (!providedApiKey) {
    return NextResponse.json({ error: "Unauthorized. Missing ingest API key." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const busEnabled = isBusIngestEnabled();
  const parsed = parseIngestBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.message, ...(parsed.details ? { details: parsed.details } : {}) },
      { status: parsed.status },
    );
  }

  const traceIdForPolicy = req.headers.get("x-trace-id")?.trim() || randomUUID();
  const policyDecision = await enforceIngestPolicy({
    organizationId: auth.organizationId,
    traceId: traceIdForPolicy,
    event: parsed.event,
  });
  if (!policyDecision.ok) {
    return NextResponse.json(
      {
        error: policyDecision.message,
        details: policyDecision.details,
        policy: policyDecision.policy,
      },
      { status: policyDecision.status },
    );
  }

  try {
    const result = await handleIngest({
      headers: req.headers,
      body,
      // Auth is already validated above; pass through to satisfy sdk auth contract.
      expectedApiKey: providedApiKey,
      store: createScopedIngestStore(auth.organizationId),
      publisher: busEnabled
        ? createNatsIngestPublisher({ organizationId: auth.organizationId })
        : undefined,
      log: ingestLog,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, ...(result.details ? { details: result.details } : {}) },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        event_id: result.event_id,
        trace_id: result.trace_id,
        pipeline: busEnabled ? "bus" : "direct",
      },
      { status: 201 },
    );
  } catch (err) {
    const traceId = req.headers.get("x-trace-id") ?? "unknown";
    const detail = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify({
        level: "error",
        trace_id: traceId,
        msg: busEnabled ? "ingest_publish_failed" : "ingest_unhandled_error",
        detail,
      }),
    );
    void captureException(err);
    const failure = ingestErrorResponse(err, busEnabled);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
