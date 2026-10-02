import type { Metadata } from "next";

import styles from "@/components/blog/blog.module.css";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { ResearchCard } from "@/components/research/research-card";
import { listPublishedResearch } from "@/lib/cms/research-store";

export const metadata: Metadata = {
  title: "Research",
  description: "Salanor research on provenance, replayability, policy, and governed automation in production.",
};

export const revalidate = 120;

export default async function ResearchPage() {
  const posts = await listPublishedResearch();

  return (
    <MarketingPage
      label="Research"
      title="Research & field notes"
      lead="Long-form work on audit proof, agent governance, and operational control — same Markdown authoring as blog and Platform Ops."
    >
      {posts.length === 0 ? (
        <p style={{ color: "var(--text-muted)", padding: "0 var(--section-pad-x) 3rem", maxWidth: "var(--content-max)", margin: "0 auto" }}>
          Published research will appear here.
        </p>
      ) : (
        <div className={styles.grid}>
          {posts.map((post) => (
            <ResearchCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </MarketingPage>
  );
}
