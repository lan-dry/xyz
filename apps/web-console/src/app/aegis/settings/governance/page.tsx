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
  required_approvers: 1 | 2;
  escalation_after_hours: number;
  on_expiry: "deny" | "expire";
  two_person_policy_activate: boolean;
  signal_fallback?: "allow" | "allow_with_obligation" | "deny";
  signal_stale_hours?: number;
  score_bands?: Array<{
    name: string;
    min_score: number;
    max_score: number;
    decision: string;
  }>;
  notifications: {
    email_enabled: boolean;
    slack_webhook_url: string | null;
    slack_configured: boolean;
    teams_webhook_url: string | null;
    teams_configured: boolean;
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
  const [requiredApprovers, setRequiredApprovers] = useState<"1" | "2">("1");
  const [escalationHours, setEscalationHours] = useState("0");
  const [onExpiry, setOnExpiry] = useState<"deny" | "expire">("deny");
  const [twoPersonActivate, setTwoPersonActivate] = useState(false);
  const [signalFallback, setSignalFallback] = useState<
    "allow" | "allow_with_obligation" | "deny"
  >("allow_with_obligation");
  const [signalStaleHours, setSignalStaleHours] = useState("24");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackWebhook, setSlackWebhook] = useState("");
  const [teamsWebhook, setTeamsWebhook] = useState("");
  const [pagerdutyKey, setPagerdutyKey] = useState("");
  const [smsNumbers, setSmsNumbers] = useState("");

  useEffect(() => {
    const s = settingsQuery.data?.settings;
    if (!s) return;
    setApprovalTtl(String(s.approval_ttl_hours));
    setStaleTraceHours(String(s.stale_trace_hours));
    setRequiredApprovers(s.required_approvers >= 2 ? "2" : "1");
    setEscalationHours(String(s.escalation_after_hours ?? 0));
    setOnExpiry(s.on_expiry === "expire" ? "expire" : "deny");
    setTwoPersonActivate(Boolean(s.two_person_policy_activate));
    setSignalFallback(s.signal_fallback ?? "allow_with_obligation");
    setSignalStaleHours(String(s.signal_stale_hours ?? 24));
    setEmailEnabled(s.notifications.email_enabled);
    setSlackWebhook(s.notifications.slack_webhook_url ?? "");
    setTeamsWebhook(s.notifications.teams_webhook_url ?? "");
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
          required_approvers: Number.parseInt(requiredApprovers, 10),
          escalation_after_hours: Number.parseInt(escalationHours, 10),
          on_expiry: onExpiry,
          two_person_policy_activate: twoPersonActivate,
          signal_fallback: signalFallback,
          signal_stale_hours: Number.parseInt(signalStaleHours, 10),
          notifications: {
            email_enabled: emailEnabled,
            slack_webhook_url: slackWebhook.trim() || null,
            teams_webhook_url: teamsWebhook.trim() || null,
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
        Timeouts for pending approvals and how your org is notified when a tool call
        needs a human decision. Slack and PagerDuty are optional; leave blank if unused.
      </p>

      {settingsQuery.error ? (
        <ErrorAlert message={(settingsQuery.error as Error).message} />
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className={settings.settingsStack}>
          <div className={settings.settingsSectionGrid}>
          <div className={settings.settingsSection}>
            <h3 className={settings.settingsSectionTitle}>Timeouts</h3>

            <div className={settings.timeoutsRow}>
            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-ttl">
                Approval TTL (hours)
              </label>
              <input
                id="gov-ttl"
                className={ui.input}
                type="number"
                min={1}
                max={168}
                value={approvalTtl}
                onChange={(e) => setApprovalTtl(e.target.value)}
                required
              />
              <p className={settings.settingsRowHint}>
                Pending requests expire after this window; blocked traces become FAILED.
                {s ? ` Currently ${s.approval_ttl_hours}h.` : null}
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-stale">
                Stale trace cleanup (hours)
              </label>
              <input
                id="gov-stale"
                className={ui.input}
                type="number"
                min={1}
                max={720}
                value={staleTraceHours}
                onChange={(e) => setStaleTraceHours(e.target.value)}
                required
              />
              <p className={settings.settingsRowHint}>
                Open traces older than this are marked FAILED by the housekeeping job.
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-four-eyes">
                Required approvers (four-eyes)
              </label>
              <select
                id="gov-four-eyes"
                className={ui.select}
                value={requiredApprovers}
                onChange={(e) => setRequiredApprovers(e.target.value as "1" | "2")}
              >
                <option value="1">1 (single approver)</option>
                <option value="2">2 (two distinct approvers)</option>
              </select>
              <p className={settings.settingsRowHint}>
                When set to 2, Approve stays pending until a second distinct admin confirms.
                Self-approve of the requester is always blocked when requester email is known.
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-escalation">
                Escalate after (hours, 0 = off)
              </label>
              <input
                id="gov-escalation"
                className={ui.input}
                type="number"
                min={0}
                max={168}
                value={escalationHours}
                onChange={(e) => setEscalationHours(e.target.value)}
              />
              <p className={settings.settingsRowHint}>
                Housekeeping re-notifies Slack/Teams/email once when a hold is still open.
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-expiry">
                On expiry
              </label>
              <select
                id="gov-expiry"
                className={ui.select}
                value={onExpiry}
                onChange={(e) => setOnExpiry(e.target.value as "deny" | "expire")}
              >
                <option value="deny">Deny / Stop (fail the case)</option>
                <option value="expire">Expire only (still stops the hold)</option>
              </select>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-signal-fallback">
                Missing / stale risk signal
              </label>
              <select
                id="gov-signal-fallback"
                className={ui.select}
                value={signalFallback}
                onChange={(e) =>
                  setSignalFallback(
                    e.target.value as "allow" | "allow_with_obligation" | "deny",
                  )
                }
              >
                <option value="allow_with_obligation">Ask a person (default)</option>
                <option value="deny">Stop</option>
                <option value="allow">Allow</option>
              </select>
              <p className={settings.settingsRowHint}>
                Applies when a tool payload sets expect_risk_signal, or when a supplied score
                is older than the stale window below. Normal traffic without risk fields is
                unchanged.
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-signal-stale">
                Risk signal stale after (hours)
              </label>
              <input
                id="gov-signal-stale"
                className={ui.input}
                type="number"
                min={1}
                max={168}
                value={signalStaleHours}
                onChange={(e) => setSignalStaleHours(e.target.value)}
              />
            </div>

            {s?.score_bands && s.score_bands.length > 0 ? (
              <div className={settings.settingsRow}>
                <p className={settings.settingsRowLabel}>Score bands (read-only defaults)</p>
                <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.8125rem" }}>
                  {s.score_bands.map((b) => (
                    <li key={b.name}>
                      {b.name}: {b.min_score}-{b.max_score} → {b.decision}
                    </li>
                  ))}
                </ul>
                <p className={settings.settingsRowHint}>
                  Example: fraud score 72 lands in Elevated → Ask a person.
                </p>
              </div>
            ) : null}

            <div className={settings.settingsToggleRow}>
              <input
                id="gov-two-person"
                type="checkbox"
                checked={twoPersonActivate}
                onChange={(e) => setTwoPersonActivate(e.target.checked)}
              />
              <div className={settings.settingsToggleCopy}>
                <label className={settings.settingsRowLabel} htmlFor="gov-two-person">
                  Two-person policy activate
                </label>
                <p className={settings.settingsRowHint}>
                  When enabled, activating a draft policy needs a second distinct admin.
                </p>
              </div>
            </div>
            </div>
          </div>

          <div className={settings.settingsSection}>
            <h3 className={settings.settingsSectionTitle}>Notification channels</h3>

            <div className={settings.settingsToggleRow}>
              <input
                id="gov-email"
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
              />
              <div className={settings.settingsToggleCopy}>
                <label className={settings.settingsRowLabel} htmlFor="gov-email">
                  Email organization admins
                </label>
                <p className={settings.settingsRowHint}>
                  Sends to every active admin (and owner) on this org: the same people
                  who can Approve or Reject. Requires Resend on the Aegis API host.
                </p>
              </div>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-slack">
                Slack incoming webhook
              </label>
              <input
                id="gov-slack"
                className={ui.input}
                placeholder="https://hooks.slack.com/services/…"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <p className={settings.settingsRowHint}>
                Paste the webhook URL for your approvals channel (for example{" "}
                <code className="mono">#security-approvals</code>). Leave empty to disable.
                Buttons open Approve/Decline with an optional reason.
                {s?.notifications.slack_configured && !slackWebhook
                  ? " A webhook is saved; paste a new URL to replace it."
                  : null}
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-teams">
                Microsoft Teams incoming webhook
              </label>
              <input
                id="gov-teams"
                className={ui.input}
                placeholder="https://….webhook.office.com/…"
                value={teamsWebhook}
                onChange={(e) => setTeamsWebhook(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <p className={settings.settingsRowHint}>
                Adaptive Card with Approve / Decline deep links (same signed tokens as Slack).
                {s?.notifications.teams_configured && !teamsWebhook
                  ? " A webhook is saved; paste a new URL to replace it."
                  : null}
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-pd">
                PagerDuty routing key (optional)
              </label>
              <input
                id="gov-pd"
                className={ui.input}
                type="password"
                placeholder={
                  s?.notifications.pagerduty_configured
                    ? "Saved: enter a new key to replace"
                    : "Events API v2 integration / routing key"
                }
                value={pagerdutyKey}
                onChange={(e) => setPagerdutyKey(e.target.value)}
                autoComplete="off"
              />
              <p className={settings.settingsRowHint}>
                Optional. If your bank uses PagerDuty for on-call, paste the service’s
                Events API v2 routing key. Opens an incident with a Console deep link.
                Ignore this field if you do not use PagerDuty.
              </p>
            </div>

            <div className={settings.settingsRow}>
              <label className={settings.settingsRowLabel} htmlFor="gov-sms">
                SMS numbers (optional)
              </label>
              <textarea
                id="gov-sms"
                className={ui.input}
                rows={2}
                placeholder="+15551234567"
                value={smsNumbers}
                onChange={(e) => setSmsNumbers(e.target.value)}
              />
              <p className={settings.settingsRowHint}>
                One number per line, E.164 format.
                {s?.notifications.sms_delivery_available
                  ? " SMS is enabled on this deployment."
                  : " SMS is off on this deployment unless Twilio is configured by Salanor."}
              </p>
            </div>
          </div>
          </div>

          {save.error ? <ErrorAlert message={(save.error as Error).message} /> : null}
          {save.isSuccess ? (
            <p className={settings.settingsRowHint} style={{ color: "var(--console-success)" }}>
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
        </div>
      </form>
    </section>
  );
}
