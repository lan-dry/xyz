"use client";

import Link from "next/link";
import {
  Loader2,
  MessageSquare,
  MessagesSquare,
  Plug,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import ui from "@/components/admin-ui.module.css";
import { siteManagerOnly } from "@/lib/admin-session";
import {
  fetchAdminOverview,
  fetchSession,
  type AdminOverview,
} from "@/lib/stoa-client";

const ICON_STYLE = { display: "inline", verticalAlign: "-2px", marginRight: 6 };

const PROFILE_LABELS: Record<string, string> = {
  standard: "Contact details only",
  financial: "Banking",
  strict: "Banking and network addresses",
};

const REVIEW_LABELS: Record<AdminOverview["policy"]["conversationReview"], string> = {
  metadata: "Titles and dates only",
  redacted: "Protected values hidden",
  full: "Full messages",
};

export default function AdminOverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSession()
      .then((me) => {
        if (siteManagerOnly(me)) {
          router.replace("/admin/sites");
          return;
        }
        return fetchAdminOverview()
          .then(setData)
          .catch((e: Error) => setError(e.message));
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  if (error) {
    return <div className={ui.alertError}>{error}</div>;
  }
  if (!data) {
    return (
      <p className={ui.metaMuted} style={{ display: "flex", gap: "0.5rem" }}>
        <Loader2 className={ui.spinner} aria-hidden />
        Loading overview…
      </p>
    );
  }

  const periodLabel = new Date(data.usage.periodMonth).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric", timeZone: "UTC" },
  );
  const topCategory = data.privacy.byCategory[0]?.count ?? 0;

  return (
    <div className={`${ui.page} ${ui.pageWide}`}>
      <header className={ui.pageHeader}>
        <h1 className={ui.pageTitle}>Overview</h1>
        <p className={ui.pageSubtitle}>{data.tenant.name}</p>
      </header>

      {!data.workspaceReady ? (
        <p className={ui.notice}>
          {data.providerConnected ? (
            <>
              Members can&apos;t chat until a model is enabled in{" "}
              <Link href="/admin/models">Policy</Link>.
            </>
          ) : (
            <>
              Members can&apos;t chat until a provider is connected in{" "}
              <Link href="/admin/providers">Providers</Link>.
            </>
          )}
        </p>
      ) : null}

      <div className={ui.statGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <Users size={14} style={ICON_STYLE} />
            Members
          </p>
          <p className={ui.cardValue}>{data.stats.users}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <MessageSquare size={14} style={ICON_STYLE} />
            Conversations
          </p>
          <p className={ui.cardValue}>{data.stats.threads}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <MessagesSquare size={14} style={ICON_STYLE} />
            Messages
          </p>
          <p className={ui.cardValue}>{data.stats.messages}</p>
        </div>
        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <ScrollText size={14} style={ICON_STYLE} />
            Audit events
          </p>
          <p className={ui.cardValue}>{data.stats.auditEvents}</p>
        </div>
      </div>

      <div className={ui.dashboardGrid}>
        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <ShieldCheck size={14} style={ICON_STYLE} />
            Withheld from AI providers ({periodLabel})
          </p>
          <p className={ui.cardValue}>{data.privacy.valuesWithheld}</p>
          <p className={ui.metaMuted} style={{ margin: "0.25rem 0 0" }}>
            {data.privacy.valuesWithheld === 0
              ? "No sensitive values in messages this month."
              : `values across ${data.privacy.protectedMessages} message${
                  data.privacy.protectedMessages === 1 ? "" : "s"
                }`}
          </p>
          {data.privacy.byCategory.length > 0 ? (
            <ul className={ui.breakdown}>
              {data.privacy.byCategory.map((c) => (
                <li key={c.group} className={ui.breakdownRow}>
                  <span>{c.label}</span>
                  <span className={ui.breakdownBar} aria-hidden>
                    <span
                      className={ui.breakdownFill}
                      style={{
                        display: "block",
                        width: `${Math.max(4, (c.count / topCategory) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className={ui.breakdownCount}>{c.count}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <Plug size={14} style={ICON_STYLE} />
            Providers
          </p>
          {data.provider.connected.length === 0 ? (
            <p className={ui.emptyInline}>None connected.</p>
          ) : (
            <dl className={ui.kvGrid}>
              {data.provider.connected.map((p) => (
                <div key={p.label} className={ui.kvItem}>
                  <dt>{p.label}</dt>
                  <dd className={ui.mono}>{p.keyHint ?? "Connected"}</dd>
                </div>
              ))}
              <div className={ui.kvItem}>
                <dt>Models available</dt>
                <dd>{data.provider.catalogCount}</dd>
              </div>
            </dl>
          )}
          {data.provider.error ? (
            <p className={ui.alertError} style={{ marginTop: "1rem" }}>
              {data.provider.error}
            </p>
          ) : null}
          <div className={ui.toolbar} style={{ marginTop: "1rem", marginBottom: 0 }}>
            <Link href="/admin/providers" className={`${ui.btn} ${ui.btnSecondary}`}>
              Providers
            </Link>
          </div>
        </div>

        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <Shield size={14} style={ICON_STYLE} />
            Policy
          </p>
          <dl className={ui.kvGrid}>
            <div className={ui.kvItem}>
              <dt>Data protection</dt>
              <dd>{PROFILE_LABELS[data.policy.profile] ?? data.policy.profile}</dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Default model</dt>
              <dd className={ui.mono}>
                {data.policy.defaultModelId ?? "Not set"}
              </dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Models enabled</dt>
              <dd>{data.policy.enabledModelCount}</dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Conversation review</dt>
              <dd>{REVIEW_LABELS[data.policy.conversationReview]}</dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Attachments</dt>
              <dd>{data.policy.allowAttachments ? "Allowed" : "Off"}</dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Monthly limits</dt>
              <dd>{data.policy.quotasEnforced ? "Enforced" : "Off"}</dd>
            </div>
          </dl>
          <div className={ui.toolbar} style={{ marginTop: "1rem", marginBottom: 0 }}>
            <Link href="/admin/models" className={`${ui.btn} ${ui.btnSecondary}`}>
              Policy
            </Link>
          </div>
        </div>

        <div className={ui.card}>
          <p className={ui.cardLabel}>
            <MessageSquare size={14} style={ICON_STYLE} />
            Usage ({periodLabel})
          </p>
          <dl className={ui.kvGrid}>
            <div className={ui.kvItem}>
              <dt>Messages</dt>
              <dd>{data.usage.orgMessages}</dd>
            </div>
            <div className={ui.kvItem}>
              <dt>Attachment data</dt>
              <dd>{data.usage.orgAttachmentMb} MB</dd>
            </div>
          </dl>
          <div className={ui.toolbar} style={{ marginTop: "1rem", marginBottom: 0 }}>
            <Link href="/admin/usage" className={`${ui.btn} ${ui.btnSecondary}`}>
              Usage
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
