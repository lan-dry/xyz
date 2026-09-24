"use client";

import { LeadsInbox } from "@/components/leads/leads-inbox";
import { OpsShell } from "@/components/ops-shell";
import { usePlatformSession } from "@/hooks/use-platform-session";

export default function ContentLeadsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWrite = can("platform:content.write");

  return (
    <OpsShell
      title="Leads"
      subtitle="Contact form submissions from www — search, qualify, and follow up."
      staffEmail={email}
      onLogout={logout}
    >
      <LeadsInbox canWrite={canWrite} />
    </OpsShell>
  );
}
