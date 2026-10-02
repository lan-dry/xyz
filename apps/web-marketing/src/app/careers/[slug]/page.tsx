import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BlogProse } from "@/components/blog/blog-prose";
import styles from "@/components/blog/blog.module.css";
import { getOpenRoleBySlug } from "@/lib/cms/careers-store";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const role = await getOpenRoleBySlug(slug);
  if (!role) return { title: "Role not found" };
  return { title: `${role.title} — Careers`, description: role.summary.slice(0, 160) };
}

export const revalidate = 120;

export default async function CareerRolePage({ params }: Props) {
  const { slug } = await params;
  const role = await getOpenRoleBySlug(slug);
  if (!role) notFound();

  return (
    <article className={styles.articleShell}>
      <div className={styles.articleInner}>
        <Link href="/careers" className="page-nav-link">
          All roles
        </Link>
        <header className={styles.articleHeader}>
          <p className={styles.cardMeta}>
            {role.team} · {role.location} · {role.seniority} · {role.employmentType.replace(/_/g, " ")}
          </p>
          <h1 className={styles.articleTitle}>{role.title}</h1>
          {role.compensationRange ? <p className={styles.articleExcerpt}>{role.compensationRange}</p> : null}
        </header>
        <h2 className={styles.relatedTitle}>Overview</h2>
        <BlogProse html={role.summaryHtml} />
        <h2 className={styles.relatedTitle}>Requirements</h2>
        <BlogProse html={role.requirementsHtml} />
        <p style={{ marginTop: "2rem" }}>
          <Link href="/contact" className={styles.backLink}>
            Apply via contact form →
          </Link>
        </p>
      </div>
    </article>
  );
}
