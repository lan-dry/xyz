import Link from "next/link";
import { redirect } from "next/navigation";

import { ContentPageShell } from "@/components/content/content-page-shell";
import { NewsletterCampaignForm } from "@/components/content/newsletter-campaign-form";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";

export default async function OpsContentNewsletterNewPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.write")) {
    redirect("/content/newsletter");
  }

  return (
    <ContentPageShell
      title="New campaign"
      subtitle="Confirmed subscribers only. Test from the campaign page after saving."
      actions={
        <Link href="/content/newsletter" className={`${ui.btn} ${ui.btnGhost}`}>
          Newsletter
        </Link>
      }
    >
      <NewsletterCampaignForm />
    </ContentPageShell>
  );
}
