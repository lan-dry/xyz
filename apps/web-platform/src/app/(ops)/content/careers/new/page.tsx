import Link from "next/link";
import { redirect } from "next/navigation";

import { CareerCreateForm } from "@/components/content/career-create-form";
import { ContentPageShell } from "@/components/content/content-page-shell";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";

export default async function OpsContentCareersNewPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.write")) {
    redirect("/content/careers");
  }

  return (
    <ContentPageShell
      title="New role"
      subtitle="Status open → listed on www/careers."
      actions={
        <Link href="/content/careers" className={`${ui.btn} ${ui.btnGhost}`}>
          All roles
        </Link>
      }
    >
      <CareerCreateForm />
    </ContentPageShell>
  );
}
