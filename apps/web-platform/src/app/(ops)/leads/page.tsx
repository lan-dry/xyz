"use client";

import { Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { OpsShell } from "@/components/ops-shell";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { usePlatformSession } from "@/hooks/use-platform-session";
import { platformApi } from "@/lib/platform-api";

export default function LeadsPage() {
  const { email, logout } = usePlatformSession();

  const leadsQuery = useQuery({
    queryKey: ["platform", "leads"],
    queryFn: () =>
      platformApi<{ messages: Record<string, unknown>[]; path: string }>("contact-leads"),
  });

  const messages = leadsQuery.data?.messages ?? [];

  return (
    <OpsShell
      title="Marketing leads"
      subtitle="Submissions from the public contact form."
      staffEmail={email}
      onLogout={logout}
    >
      {leadsQuery.data?.path ? (
        <p className={ui.tableFooter} style={{ border: "none", padding: "0 0 1rem" }}>
          Source: <span className="mono">{leadsQuery.data.path}</span>
        </p>
      ) : null}

      {leadsQuery.isLoading ? (
        <p className={ui.loading}>Loading leads…</p>
      ) : messages.length === 0 ? (
        <EmptyStatePanel
          icon={Mail}
          title="No contact submissions yet"
          description="Messages from the marketing site contact form are stored locally in development."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {messages.map((m, i) => (
            <div key={i} className={`${ui.card} ${ui.cardPad}`}>
              <pre className={ui.pre} style={{ margin: 0 }}>
                {JSON.stringify(m, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </OpsShell>
  );
}
