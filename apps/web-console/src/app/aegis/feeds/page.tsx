"use client";

import { Rss, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AegisMark } from "@/components/console/aegis-mark";
import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { Modal } from "@/components/console/modal";
import {
  ConsolePage,
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBadge,
  ui,
} from "@/components/console/console-ui";
import { ApiError, consoleApi } from "@/lib/api";

type FeedRow = {
  feed_id: string;
  name: string;
  source_id: string | null;
  match_key: "case_id" | "token_id";
  status: string;
  schedule_enabled: boolean;
  schedule_hour_utc: number;
};

type IngestResult = {
  feed_id: string;
  inserted: number;
  unchanged: number;
  edited: number;
  row_count: number;
};

type MeResponse = {
  user?: { role?: string } | null;
};

function formatHint(fileName: string): "csv" | "jsonl" {
  return fileName.toLowerCase().endsWith(".csv") ? "csv" : "jsonl";
}

export default function FeedsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [matchKey, setMatchKey] = useState<"case_id" | "token_id">("case_id");
  const [uploadFor, setUploadFor] = useState<FeedRow | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBody, setFileBody] = useState<string | null>(null);
  const [ingestNote, setIngestNote] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["console", "me"],
    queryFn: () => consoleApi<MeResponse>("/auth/me"),
  });
  const role = meQuery.data?.user?.role ?? "";
  const canWrite = role === "admin" || role === "owner";

  const listQuery = useQuery({
    queryKey: ["console", "feeds"],
    queryFn: () => consoleApi<{ feeds: FeedRow[] }>("/reconciliation/feeds"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      consoleApi<{ feed: FeedRow }>("/reconciliation/feeds", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), match_key: matchKey }),
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setName("");
      setMatchKey("case_id");
      await queryClient.invalidateQueries({ queryKey: ["console", "feeds"] });
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFor || !fileBody || !fileName) {
        throw new Error("Choose a JSONL or CSV ledger file.");
      }
      return consoleApi<IngestResult>(
        `/reconciliation/feeds/${encodeURIComponent(uploadFor.feed_id)}/ingest`,
        {
          method: "POST",
          body: JSON.stringify({
            body: fileBody,
            format: formatHint(fileName),
          }),
        },
      );
    },
    onSuccess: async (result) => {
      setIngestNote(
        `Uploaded ${result.row_count} rows · ${result.inserted} new, ${result.unchanged} unchanged, ${result.edited} edited.`,
      );
      setUploadFor(null);
      setFileName(null);
      setFileBody(null);
      await queryClient.invalidateQueries({ queryKey: ["console", "feeds"] });
    },
  });

  const feeds = listQuery.data?.feeds ?? [];
  const errorMessage = useMemo(() => {
    if (listQuery.error instanceof ApiError) return listQuery.error.message;
    if (listQuery.error) return "Failed to load feeds.";
    return null;
  }, [listQuery.error]);

  return (
    <ConsolePage>
      <PageHeader
        title="Feeds"
        subtitle="Ledger files Aegis compares with sealed cases. Create a feed, then upload a JSONL or CSV file."
        actions={
          canWrite ? (
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              onClick={() => {
                setName("");
                setMatchKey("case_id");
                setCreateOpen(true);
              }}
            >
              <Rss size={14} aria-hidden /> New feed
            </button>
          ) : null
        }
      />

      {listQuery.isPending ? <LoadingBlock /> : null}
      {errorMessage ? <ErrorAlert message={errorMessage} /> : null}
      {ingestNote ? <p className={ui.cardHint}>{ingestNote}</p> : null}

      {!listQuery.isPending && !listQuery.error && feeds.length === 0 ? (
        <EmptyStatePanel
          mark={<AegisMark />}
          title="No feeds"
          description="A feed is the ledger file you upload so Aegis can compare it with sealed cases."
          action={
            canWrite ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => setCreateOpen(true)}
              >
                New feed
              </button>
            ) : undefined
          }
        />
      ) : null}

      {feeds.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Feed</th>
                <th>Match</th>
                <th>Schedule</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {feeds.map((feed) => (
                <tr key={feed.feed_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{feed.name}</div>
                    <p className={ui.cardHint} style={{ margin: "0.25rem 0 0" }}>
                      {feed.feed_id}
                      {feed.source_id ? ` · ${feed.source_id}` : ""}
                    </p>
                  </td>
                  <td className="mono" style={{ fontSize: "0.8125rem" }}>
                    {feed.match_key}
                  </td>
                  <td>
                    {feed.schedule_enabled
                      ? `Daily ${String(feed.schedule_hour_utc).padStart(2, "0")}:00 UTC`
                      : "Off"}
                  </td>
                  <td>
                    <StatusBadge status={feed.status} />
                  </td>
                  <td>
                    {canWrite ? (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.btnSecondary}`}
                        onClick={() => {
                          setUploadFor(feed);
                          setFileName(null);
                          setFileBody(null);
                          ingestMutation.reset();
                        }}
                      >
                        <Upload size={14} aria-hidden /> Upload ledger
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        onClose={() => {
          if (!createMutation.isPending) setCreateOpen(false);
        }}
        title="New feed"
      >
        <form
          style={{ display: "grid", gap: "0.75rem" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate();
          }}
        >
          <label className={ui.field}>
            Name
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className={ui.field}>
            Match key
            <select
              className={ui.select}
              value={matchKey}
              onChange={(e) => setMatchKey(e.target.value as "case_id" | "token_id")}
            >
              <option value="case_id">case_id</option>
              <option value="token_id">token_id</option>
            </select>
          </label>
          {createMutation.error ? (
            <ErrorAlert
              message={
                createMutation.error instanceof ApiError
                  ? createMutation.error.message
                  : "Could not create feed."
              }
            />
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={createMutation.isPending || !name.trim()}
            >
              {createMutation.isPending ? "Creating…" : "Create feed"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(uploadFor)}
        onClose={() => {
          if (!ingestMutation.isPending) setUploadFor(null);
        }}
        title={uploadFor ? `Upload ledger · ${uploadFor.name}` : "Upload ledger"}
      >
        <div style={{ display: "grid", gap: "0.75rem" }}>
          <p className={ui.cardHint} style={{ margin: 0 }}>
            JSONL or CSV. Rows are matched on {uploadFor?.match_key ?? "case_id"}.
          </p>
          <label className={ui.field}>
            Ledger file
            <input
              className={ui.input}
              type="file"
              accept=".jsonl,.csv,.ndjson,text/csv,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  setFileName(null);
                  setFileBody(null);
                  return;
                }
                setFileName(file.name);
                void file.text().then(setFileBody);
              }}
            />
          </label>
          {fileName ? <p className={ui.cardHint}>{fileName}</p> : null}
          {ingestMutation.error ? (
            <ErrorAlert
              message={
                ingestMutation.error instanceof ApiError
                  ? ingestMutation.error.message
                  : ingestMutation.error instanceof Error
                    ? ingestMutation.error.message
                    : "Could not upload the ledger."
              }
            />
          ) : null}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              disabled={ingestMutation.isPending}
              onClick={() => setUploadFor(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnPrimary}`}
              disabled={ingestMutation.isPending || !fileBody}
              onClick={() => ingestMutation.mutate()}
            >
              {ingestMutation.isPending ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </Modal>
    </ConsolePage>
  );
}
