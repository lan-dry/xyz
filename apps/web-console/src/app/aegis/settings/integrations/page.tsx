"use client";

import { Radio } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

import settings from "../settings.module.css";

type SiemDestination = {
  dest_id: string;
  provider: string;
  otel_endpoint: string | null;
  status: string;
  last_flushed_at: string | null;
  created_at: string;
};

const PROVIDERS = [
  { value: "datadog", label: "Datadog" },
  { value: "splunk", label: "Splunk" },
  { value: "sentinel", label: "Microsoft Sentinel" },
] as const;

export default function IntegrationsSettingsPage() {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["value"]>("datadog");
  const [endpoint, setEndpoint] = useState("");

  const listQuery = useQuery({
    queryKey: ["console", "siem-destinations"],
    queryFn: () =>
      consoleApi<{ destinations: SiemDestination[] }>("/siem/destinations"),
  });

  const createDest = useMutation({
    mutationFn: () =>
      consoleApi<{ destination: SiemDestination }>("/siem/destinations", {
        method: "POST",
        body: JSON.stringify({
          provider,
          otel_endpoint: endpoint.trim(),
        }),
      }),
    onSuccess: () => {
      setEndpoint("");
      void queryClient.invalidateQueries({ queryKey: ["console", "siem-destinations"] });
    },
  });

  const patchDest = useMutation({
    mutationFn: (input: { destId: string; status: "active" | "paused" }) =>
      consoleApi<{ destination: SiemDestination }>(
        `/siem/destinations/${encodeURIComponent(input.destId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: input.status }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "siem-destinations"] });
    },
  });

  const destinations = listQuery.data?.destinations ?? [];

  return (
    <section className={settings.settingCard}>
      <h2>
        <Radio size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
        SIEM forwarding (OTel)
      </h2>
      <p>
        Each ingested APS event is forwarded as OTLP logs to active destinations. Use your vendor’s
        OTLP HTTP intake URL (we append <code>/v1/logs</code> when needed).
      </p>

      {listQuery.error ? (
        <ErrorAlert message={(listQuery.error as Error).message} />
      ) : null}

      <form
        className={settings.settingsForm}
        style={{ maxWidth: "28rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          createDest.mutate();
        }}
      >
        <label className={ui.field}>
          Provider
          <select
            className={ui.select}
            value={provider}
            onChange={(e) =>
              setProvider(e.target.value as (typeof PROVIDERS)[number]["value"])
            }
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={ui.field}>
          OTLP endpoint
          <input
            className={ui.input}
            placeholder="https://http-intake.logs.datadoghq.com"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            required
          />
        </label>
        {createDest.error ? (
          <ErrorAlert message={(createDest.error as Error).message} />
        ) : null}
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={createDest.isPending || !endpoint.trim()}
        >
          {createDest.isPending ? "Adding…" : "Add destination"}
        </button>
      </form>

      <h3 style={{ margin: "1.5rem 0 0.75rem", fontSize: "0.9375rem", fontWeight: 600 }}>
        Destinations
      </h3>
      {listQuery.isPending ? (
        <p className={ui.cardHint}>Loading…</p>
      ) : destinations.length === 0 ? (
        <EmptyStatePanel
          icon={Radio}
          title="No SIEM destinations"
          description="Add an OTLP endpoint to forward signed events to Splunk, Datadog, or Sentinel."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Provider</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Last flush</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {destinations.map((d) => (
                <tr key={d.dest_id}>
                  <td className="mono" style={{ fontSize: "0.75rem" }}>
                    {d.dest_id}
                  </td>
                  <td>{d.provider}</td>
                  <td
                    className="mono"
                    style={{ fontSize: "0.75rem", maxWidth: "14rem", wordBreak: "break-all" }}
                  >
                    {d.otel_endpoint ?? "—"}
                  </td>
                  <td>{d.status}</td>
                  <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                    {d.last_flushed_at
                      ? new Date(d.last_flushed_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.btnSecondary}`}
                      disabled={patchDest.isPending}
                      onClick={() =>
                        patchDest.mutate({
                          destId: d.dest_id,
                          status: d.status === "active" ? "paused" : "active",
                        })
                      }
                    >
                      {d.status === "active" ? "Pause" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
