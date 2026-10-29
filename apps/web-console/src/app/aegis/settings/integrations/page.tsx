"use client";

import { Radio, Webhook } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { EmptyStatePanel } from "@/components/console/empty-state-panel";
import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

import settings from "../settings.module.css";

type WebhookEndpoint = {
  endpoint_id: string;
  url: string;
  events: string[] | null;
  active: boolean;
  created_at: string;
};

type WebhookEventMeta = { type: string; description: string };

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

function OutboundWebhooksPanel() {
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const eventsQuery = useQuery({
    queryKey: ["console", "webhook-events"],
    queryFn: () =>
      consoleApi<{ events: WebhookEventMeta[] }>("/webhooks/events"),
  });

  const endpointsQuery = useQuery({
    queryKey: ["console", "webhook-endpoints"],
    queryFn: () =>
      consoleApi<{ endpoints: WebhookEndpoint[] }>("/webhooks/endpoints"),
  });

  const createEndpoint = useMutation({
    mutationFn: () =>
      consoleApi<{
        endpoint: WebhookEndpoint;
        signing_secret: string;
        message: string;
      }>("/webhooks/endpoints", {
        method: "POST",
        body: JSON.stringify({ url: webhookUrl.trim() }),
      }),
    onSuccess: (data) => {
      setWebhookUrl("");
      setRevealedSecret(data.signing_secret);
      void queryClient.invalidateQueries({ queryKey: ["console", "webhook-endpoints"] });
    },
  });

  const patchEndpoint = useMutation({
    mutationFn: (input: { endpointId: string; active: boolean }) =>
      consoleApi<{ endpoint: WebhookEndpoint }>(
        `/webhooks/endpoints/${encodeURIComponent(input.endpointId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ active: input.active }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "webhook-endpoints"] });
    },
  });

  const endpoints = endpointsQuery.data?.endpoints ?? [];
  const catalog = eventsQuery.data?.events ?? [];

  return (
    <section className={settings.settingCard} style={{ marginTop: "1.5rem" }}>
      <h2>
        <Webhook size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
        Outbound webhooks
      </h2>
      <p>
        Receive signed HTTPS callbacks when approvals are decided and other governance events occur.
        Verify payloads with the signing secret using HMAC-SHA256 over{" "}
        <span className="mono">timestamp + &quot;.&quot; + raw JSON body</span> (see{" "}
        <span className="mono">X-Aegis-Signature</span>).
        <strong> approval.decided</strong> is dispatched today; other catalog events are listed for
        upcoming emitters.
      </p>

      {eventsQuery.data ? (
        <ul className={ui.muted} style={{ fontSize: "0.8125rem", margin: "0.75rem 0 1rem", paddingLeft: "1.25rem" }}>
          {catalog.map((ev) => (
            <li key={ev.type}>
              <span className="mono">{ev.type}</span>: {ev.description}
            </li>
          ))}
        </ul>
      ) : null}

      {endpointsQuery.error ? (
        <ErrorAlert message={(endpointsQuery.error as Error).message} />
      ) : null}

      <form
        className={settings.settingsForm}
        onSubmit={(e) => {
          e.preventDefault();
          createEndpoint.mutate();
        }}
      >
        <label className={ui.field}>
          HTTPS endpoint URL
          <input
            className={ui.input}
            placeholder="https://api.example.com/aegis/webhooks"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            required
          />
        </label>
        {createEndpoint.error ? (
          <ErrorAlert message={(createEndpoint.error as Error).message} />
        ) : null}
        {revealedSecret ? (
          <div style={{ marginTop: "0.75rem" }}>
            <p className={ui.muted}>
              <strong>Copy this signing secret now.</strong> It will not be shown again.
            </p>
            <pre className="mono" style={{ fontSize: "0.75rem", overflow: "auto" }}>
              {revealedSecret}
            </pre>
          </div>
        ) : null}
        <div className={settings.formActions}>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={createEndpoint.isPending || !webhookUrl.trim()}
          >
            {createEndpoint.isPending ? "Adding…" : "Add webhook endpoint"}
          </button>
        </div>
      </form>

      <h3 style={{ margin: "1.5rem 0 0.75rem", fontSize: "0.9375rem", fontWeight: 600 }}>
        Endpoints
      </h3>
      {endpointsQuery.isPending ? (
        <p className={ui.cardHint}>Loading…</p>
      ) : endpoints.length === 0 ? (
        <EmptyStatePanel
          icon={Webhook}
          title="No webhook endpoints"
          description="Add an HTTPS URL to receive signed approval.decided events."
        />
      ) : (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>URL</th>
                <th>Events</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {endpoints.map((ep) => (
                <tr key={ep.endpoint_id}>
                  <td
                    className="mono"
                    style={{ fontSize: "0.75rem", maxWidth: "16rem", wordBreak: "break-all" }}
                  >
                    {ep.url}
                  </td>
                  <td style={{ fontSize: "0.8125rem" }}>
                    {ep.events?.length ? ep.events.join(", ") : "All catalog events"}
                  </td>
                  <td>{ep.active ? "Active" : "Paused"}</td>
                  <td>
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.btnSecondary}`}
                      disabled={patchEndpoint.isPending}
                      onClick={() =>
                        patchEndpoint.mutate({
                          endpointId: ep.endpoint_id,
                          active: !ep.active,
                        })
                      }
                    >
                      {ep.active ? "Pause" : "Activate"}
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
    <>
    <section className={settings.settingCard}>
      <h2>
        <Radio size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
        SIEM forwarding
      </h2>
      <p>
        <strong>SIEM</strong> (Security Information and Event Management) is where your security team
        collects logs and alerts: Splunk, Datadog, Microsoft Sentinel, and similar tools. Forwarding
        sends Aegis policy decisions and agent actions into that stream so denies and approvals show up
        next to the rest of your stack. Configure an OpenTelemetry (OTel) HTTP endpoint below.
      </p>

      {listQuery.error ? (
        <ErrorAlert message={(listQuery.error as Error).message} />
      ) : null}

      <form
        className={settings.settingsForm}
        onSubmit={(e) => {
          e.preventDefault();
          createDest.mutate();
        }}
      >
        <div className={settings.formFields}>
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
        </div>
        {createDest.error ? (
          <ErrorAlert message={(createDest.error as Error).message} />
        ) : null}
        <div className={settings.formActions}>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={createDest.isPending || !endpoint.trim()}
          >
            {createDest.isPending ? "Adding…" : "Add destination"}
          </button>
        </div>
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
                    {d.otel_endpoint ?? "-"}
                  </td>
                  <td>{d.status}</td>
                  <td style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                    {d.last_flushed_at
                      ? new Date(d.last_flushed_at).toLocaleString()
                      : "-"}
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
    <OutboundWebhooksPanel />
    </>
  );
}
