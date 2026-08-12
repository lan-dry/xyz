"use client";

import { Shield } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ErrorAlert, ui } from "@/components/console/console-ui";
import { consoleApi } from "@/lib/api";

import settings from "../settings.module.css";

type GovernanceSettings = {
  approval_ttl_hours: number;
  stale_trace_hours: number;
  notifications: {
    email_enabled: boolean;
    slack_webhook_url: string | null;
    slack_configured: boolean;
    pagerduty_routing_key: string | null;
    pagerduty_configured: boolean;
    sms_numbers: string[];
    sms_delivery_available: boolean;
  };
};

export default function GovernanceSettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["console", "governance-settings"],
    queryFn: () =>
      consoleApi<{ settings: GovernanceSettings }>("/governance/settings"),
  });

  const [approvalTtl, setApprovalTtl] = useState("24");
  const [staleTraceHours, setStaleTraceHours] = useState("72");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [pagerdutyKey, setPagerdutyKey] = useState("");
  const [smsNumbers, setSmsNumbers] = useState("");

  useEffect(() => {
    const s = settingsQuery.data?.settings;
    if (!s) return;
    setApprovalTtl(String(s.approval_ttl_hours));
    setStaleTraceHours(String(s.stale_trace_hours));
    setEmailEnabled(s.notifications.email_enabled);
    setSlackWebhook(s.notifications.slack_webhook_url ?? "");
    setPagerdutyKey("");
    setSmsNumbers(s.notifications.sms_numbers.join("\n"));
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      consoleApi<{ settings: GovernanceSettings }>("/governance/settings", {
        method: "PATCH",
        body: JSON.stringify({
          approval_ttl_hours: Number.parseInt(approvalTtl, 10),
          stale_trace_hours: Number.parseInt(staleTraceHours, 10),
          notifications: {
            email_enabled: emailEnabled,
            slack_webhook_url: slackWebhook.trim() || null,
            pagerduty_routing_key: pagerdutyKey.trim() || null,
            sms_numbers: smsNumbers
              .split(/[\n,]+/)
              .map((n) => n.trim())
              .filter(Boolean),
          },
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["console", "governance-settings"] });
    },
  });

  const s = settingsQuery.data?.settings;

  return (
    <section className={settings.settingCard}>
      <h2>
        <Shield size={18} style={{ verticalAlign: "-3px", marginRight: "0.35rem" }} />
        Governance & approvals
      </h2>
      <p>
        Control how long approval requests stay open, when stale workflow traces are
        closed, and how your team is notified when an action needs a human decision.
      </p>

      {settingsQuery.error ? (
        <ErrorAlert message={(settingsQuery.error as Error).message} />
      ) : null}

      <form
        className={settings.settingsForm}
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className={settings.formFields}>
          <label className={ui.field}>
            Approval TTL (hours)
            <input
              className={ui.input}
              type="number"
              min={1}
              max={168}
              value={approvalTtl}
              onChange={(e) => setApprovalTtl(e.target.value)}
              required
            />
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.5rem" }}>
            Pending requests expire after this window; blocked traces become FAILED.
            {s ? ` Currently ${s.approval_ttl_hours}h.` : null}
          </p>

          <label className={ui.field}>
            Stale trace cleanup (hours)
            <input
              className={ui.input}
              type="number"
              min={1}
              max={720}
              value={staleTraceHours}
              onChange={(e) => setStaleTraceHours(e.target.value)}
              required
            />
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.5rem" }}>
            RUNNING traces older than this are marked FAILED by the housekeeping job.
          </p>

          <h3 style={{ margin: "1rem 0 0.5rem", fontSize: "0.9375rem", fontWeight: 600 }}>
            Notification channels
          </h3>

          <label className={ui.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
            />
            Email organization admins
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.75rem" }}>
            Sends a formatted alert to every admin on the account when approval is required.
          </p>

          <label className={ui.field}>
            Slack channel webhook
            <input
              className={ui.input}
              placeholder="https://hooks.slack.com/services/..."
              value={slackWebhook}
              onChange={(e) => setSlackWebhook(e.target.value)}
            />
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.75rem" }}>
            Posts a message to your Slack workspace when an approval is pending. In Slack,
            create an Incoming Webhook for the channel you want (for example{" "}
            <code className="mono">#security-approvals</code>) and paste the URL here.
          </p>
          {s?.notifications.slack_configured && !slackWebhook ? (
            <p className={ui.cardHint}>Webhook saved. Paste a new URL to replace it.</p>
          ) : null}

          <label className={ui.field}>
            PagerDuty integration key
            <input
              className={ui.input}
              type="password"
              placeholder={
                s?.notifications.pagerduty_configured
                  ? "Saved (enter a new key to replace)"
                  : "Routing key from your PagerDuty service"
              }
              value={pagerdutyKey}
              onChange={(e) => setPagerdutyKey(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.75rem" }}>
            Opens a PagerDuty incident so on-call staff can respond to pending approvals.
          </p>

          <label className={ui.field}>
            SMS alert numbers
            <textarea
              className={ui.input}
              rows={3}
              placeholder="+15551234567"
              value={smsNumbers}
              onChange={(e) => setSmsNumbers(e.target.value)}
            />
          </label>
          <p className={ui.cardHint} style={{ margin: "-0.5rem 0 0.5rem" }}>
            One mobile number per line, international format with country code (example{" "}
            <code className="mono">+15551234567</code>).
            {s?.notifications.sms_delivery_available
              ? " Text alerts are enabled for your deployment."
              : " Text alerts are not enabled on this deployment yet. Contact Salanor support to activate SMS."}
          </p>
        </div>

        {save.error ? <ErrorAlert message={(save.error as Error).message} /> : null}
        {save.isSuccess ? (
          <p className={ui.cardHint} style={{ color: "var(--console-success)" }}>
            Governance settings saved.
          </p>
        ) : null}

        <div className={settings.formActions}>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={save.isPending || settingsQuery.isLoading}
          >
            {save.isPending ? "Saving…" : "Save governance settings"}
          </button>
        </div>
      </form>
    </section>
  );
}
