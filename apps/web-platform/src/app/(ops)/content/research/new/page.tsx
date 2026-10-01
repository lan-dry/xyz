import Link from "next/link";
import { redirect } from "next/navigation";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { ResearchCreateForm } from "@/components/content/research-create-form";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";
import { getPrisma } from "@/lib/prisma";
import {
  getResearchBylineForAccount,
  resolveResearchBylineDisplay,
} from "@/lib/research-author";

export default async function OpsContentResearchNewPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.write")) {
    redirect("/content/research");
  }

  const prisma = getPrisma();
  const stored =
    prisma ? await getResearchBylineForAccount(prisma, session.account_id) : null;
  const byline = resolveResearchBylineDisplay(session, stored);

  return (
    <ContentPageShell
      title="New research post"
      subtitle="Published posts use your account byline (Content → My byline)."
      actions={
        <Link href="/content/research" className={`${ui.btn} ${ui.btnGhost}`}>
          All posts
        </Link>
      }
    >
      <ResearchCreateForm byline={{ name: byline.name, role: byline.role }} />
    </ContentPageShell>
  );
}
