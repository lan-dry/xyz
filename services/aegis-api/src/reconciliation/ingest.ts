/**
 * Persist feed rows (JSONL / CSV / JSON array) with content-hash versioning.
 * Re-ingesting the same external_id with a different hash supersedes the prior
 * current row so the next reconciliation run can detect an after-the-fact edit.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { FeedParseError, parseFeedBody, type ParsedFeedRow } from "./parse-feed.js";

type Db = pg.Pool | pg.PoolClient;

export type FeedRow = {
  feed_id: string;
  organization_id: string;
  name: string;
  source_id: string | null;
  match_key: "case_id" | "token_id";
  column_mapping: unknown;
  expected_interval_sec: number | null;
  schedule_enabled: boolean;
  schedule_hour_utc: number;
  last_scheduled_at: Date | null;
  status: "active" | "disabled";
};

export type IngestResult = {
  feed_id: string;
  inserted: number;
  unchanged: number;
  edited: number;
  rows: ParsedFeedRow[];
};

export class FeedIngestError extends Error {
  constructor(
    readonly code: "not_found" | "disabled" | "parse",
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FeedIngestError";
  }
}

export async function getFeed(
  client: Db,
  organizationId: string,
  feedId: string,
): Promise<FeedRow | null> {
  const r = await client.query<{
    feed_id: string;
    organization_id: string;
    name: string;
    source_id: string | null;
    match_key: "case_id" | "token_id";
    column_mapping: unknown;
    expected_interval_sec: number | null;
    schedule_enabled: boolean;
    schedule_hour_utc: number;
    last_scheduled_at: Date | null;
    status: "active" | "disabled";
  }>(
    `SELECT feed_id, organization_id, name, source_id, match_key, column_mapping,
            expected_interval_sec, schedule_enabled, schedule_hour_utc,
            last_scheduled_at, status
       FROM reconciliation_feed
      WHERE organization_id = $1 AND feed_id = $2`,
    [organizationId, feedId],
  );
  return r.rows[0] ?? null;
}

export async function listFeeds(
  client: Db,
  organizationId: string,
): Promise<FeedRow[]> {
  const r = await client.query<FeedRow>(
    `SELECT feed_id, organization_id, name, source_id, match_key, column_mapping,
            expected_interval_sec, schedule_enabled, schedule_hour_utc,
            last_scheduled_at, status
       FROM reconciliation_feed
      WHERE organization_id = $1
      ORDER BY name ASC`,
    [organizationId],
  );
  return r.rows;
}

export async function createFeed(
  client: Db,
  input: {
    organization_id: string;
    name: string;
    match_key: "case_id" | "token_id";
    column_mapping?: unknown;
    source_id?: string | null;
    expected_interval_sec?: number | null;
    schedule_enabled?: boolean;
    schedule_hour_utc?: number;
    feed_id?: string;
  },
): Promise<FeedRow> {
  const feedId =
    input.feed_id?.trim() ||
    `feed_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await client.query(
    `INSERT INTO reconciliation_feed (
       feed_id, organization_id, name, source_id, match_key, column_mapping,
       expected_interval_sec, schedule_enabled, schedule_hour_utc
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)`,
    [
      feedId,
      input.organization_id,
      input.name.trim(),
      input.source_id ?? null,
      input.match_key,
      JSON.stringify(input.column_mapping ?? {}),
      input.expected_interval_sec ?? null,
      input.schedule_enabled !== false,
      input.schedule_hour_utc ?? 2,
    ],
  );
  const feed = await getFeed(client, input.organization_id, feedId);
  if (!feed) throw new Error("Feed insert failed");
  return feed;
}

export async function ingestFeedBody(
  client: Db,
  organizationId: string,
  feedId: string,
  body: string,
  formatHint?: string | null,
): Promise<IngestResult> {
  const feed = await getFeed(client, organizationId, feedId);
  if (!feed) {
    throw new FeedIngestError("not_found", `Feed ${feedId} not found.`);
  }
  if (feed.status !== "active") {
    throw new FeedIngestError("disabled", `Feed ${feedId} is disabled.`);
  }
  let rows: ParsedFeedRow[];
  try {
    rows = parseFeedBody(body, feed.column_mapping, formatHint);
  } catch (err) {
    if (err instanceof FeedParseError) {
      throw new FeedIngestError("parse", err.message, err);
    }
    throw err;
  }

  let inserted = 0;
  let unchanged = 0;
  let edited = 0;

  for (const row of rows) {
    const current = await client.query<{
      row_id: string;
      content_hash: string;
      version: number;
    }>(
      `SELECT row_id, content_hash, version
         FROM reconciliation_feed_row
        WHERE organization_id = $1 AND feed_id = $2 AND external_id = $3 AND is_current
        LIMIT 1`,
      [organizationId, feedId, row.external_id],
    );
    const prev = current.rows[0];
    if (prev && prev.content_hash === row.content_hash) {
      unchanged++;
      continue;
    }
    if (prev) {
      await client.query(
        `UPDATE reconciliation_feed_row SET is_current = false
          WHERE row_id = $1`,
        [prev.row_id],
      );
      edited++;
    } else {
      inserted++;
    }
    const rowId = `fr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const executedAt =
      row.executed_at && !Number.isNaN(Date.parse(row.executed_at))
        ? new Date(row.executed_at).toISOString()
        : null;
    await client.query(
      `INSERT INTO reconciliation_feed_row (
         row_id, organization_id, feed_id, external_id, case_id, token_id,
         amount, currency, beneficiary_account, executed_at, raw, content_hash,
         version, is_current, previous_content_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::jsonb,$12,$13,true,$14)`,
      [
        rowId,
        organizationId,
        feedId,
        row.external_id,
        row.case_id,
        row.token_id,
        row.amount,
        row.currency,
        row.beneficiary_account,
        executedAt,
        JSON.stringify(row.raw),
        row.content_hash,
        prev ? prev.version + 1 : 1,
        prev?.content_hash ?? null,
      ],
    );
  }

  return { feed_id: feedId, inserted, unchanged, edited, rows };
}
