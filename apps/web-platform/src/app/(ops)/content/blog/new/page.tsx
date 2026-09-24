import Link from "next/link";
import { redirect } from "next/navigation";

import { createBlogPost } from "@/app/(ops)/content/blog/actions";
import { BlogPostFormFields } from "@/components/content/blog-post-form-fields";
import { ContentPageShell } from "@/components/content/content-page-shell";
import forms from "@/components/content/content-forms.module.css";
import { ui } from "@/components/ops-ui/ops-ui";
import { getPlatformSessionServer, requirePlatformSession } from "@/lib/platform-server-session";
import { canPlatform } from "@/lib/platform-permissions";

export default async function OpsContentBlogNewPage() {
  await requirePlatformSession("platform:content.read");
  const session = await getPlatformSessionServer();
  if (!session || !canPlatform(session.platform_role, "platform:content.write")) {
    redirect("/content/blog");
  }

  return (
    <ContentPageShell
      title="New blog post"
      subtitle="Creates the same Markdown file as editing in Cursor."
      actions={
        <Link href="/content/blog" className={`${ui.btn} ${ui.btnGhost}`}>
          All posts
        </Link>
      }
    >
      <form action={createBlogPost} className={`${ui.card} ${ui.cardPad} ${forms.formCard}`}>
        <BlogPostFormFields defaultAuthorEmail={session.email} bodyMarkdown="" />
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
          Create draft
        </button>
      </form>
    </ContentPageShell>
  );
}
