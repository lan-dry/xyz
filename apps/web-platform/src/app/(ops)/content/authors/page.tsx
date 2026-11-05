import Link from "next/link";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { BylineProfileForm } from "@/components/content/byline-profile-form";
import { EmptyStatePanel, ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import {
  getResearchBylineForAccount,
  resolveResearchBylineDisplay,
  type PublicStaffProfile,
} from "@/lib/research-author";
import { getPrisma } from "@/lib/prisma";
import { updateMyByline } from "@/app/(ops)/content/authors/actions";

export default async function OpsMyBylinePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  const canWrite = session ? canPlatform(session.platform_role, "platform:content.write") : false;
  const query = await searchParams;

  const prisma = getPrisma();
  let stored: PublicStaffProfile | null = null;
  let profileError: string | null = null;
  if (prisma && session) {
    try {
      stored = await getResearchBylineForAccount(prisma, session.account_id);
    } catch (err) {
      profileError = err instanceof Error ? err.message : "Could not load the public profile.";
    }
  }
  const profile = session && !profileError ? resolveResearchBylineDisplay(session, stored) : null;

  return (
    <ContentPageShell
      title="My public profile"
      subtitle="One place for your author name, title, photo, and social links on www/blog and www/research. Each staff member edits only their own profile."
      actions={
        <Link href="/content/research" className={`${ui.btn} ${ui.btnGhost}`}>
          Research posts
        </Link>
      }
    >
      {query.saved === "1" ? (
        <p className={ui.badgeMuted} style={{ marginBottom: "1rem" }}>
          Public profile saved.
        </p>
      ) : null}

      {!prisma || !session ? (
        <EmptyStatePanel title="Database not configured" description="Set DATABASE_URL on Platform Ops." />
      ) : null}

      {profileError ? (
        <EmptyStatePanel
          title="Public profile could not be loaded"
          description={profileError}
        />
      ) : null}

      {canWrite && profile ? (
        <BylineProfileForm accountEmail={session!.email} profile={profile} action={updateMyByline} />
      ) : null}
    </ContentPageShell>
  );
}
