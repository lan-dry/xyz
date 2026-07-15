"use client";

import { LeadsInbox } from "@/components/leads/leads-inbox";
import { OpsShell } from "@/components/ops-shell";
import { usePlatformSession } from "@/hooks/use-platform-session";

export default function LeadsPage() {
  const { email, logout, can } = usePlatformSession();
  const canWrite = can("platform:orgs.write");

  return (
    <OpsShell
      title="Marketing leads"
      subtitle="Contact form submissions — search, qualify, and follow up."
      staffEmail={email}
      onLogout={logout}
    >
      <LeadsInbox canWrite={canWrite} />
    </OpsShell>
  );
}
