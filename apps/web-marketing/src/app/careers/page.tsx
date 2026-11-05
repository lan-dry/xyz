import type { Metadata } from "next";
import Link from "next/link";

import styles from "@/components/blog/blog.module.css";
import { MarketingPage } from "@/components/marketing/marketing-page";
import { listOpenRoles } from "@/lib/cms/careers-store";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join Salanor. Build provenance and audit systems for production agents.",
};

export const revalidate = 120;

export default async function CareersPage() {
  const roles = await listOpenRoles();

  return (
    <MarketingPage
      label="Careers"
      title="Open roles"
      lead="Open roles across platform, cryptography, and developer experience."
    >
      {roles.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No open roles right now</p>
          <p className={styles.emptyLead}>
            Send a note to{" "}
            <a href="mailto:careers@salanor.com">careers@salanor.com</a>
            {" "}or use the <Link href="/contact">contact form</Link>.
          </p>
        </div>
      ) : (
        <ul className={styles.roleList}>
          {roles.map((role) => (
            <li key={role.id}>
              <Link href={`/careers/${role.slug}`} className={styles.roleCard}>
                <p className={styles.cardMeta}>
                  {role.team} · {role.location} · {role.employmentType.replace(/_/g, " ")}
                </p>
                <h2 className={styles.cardTitle}>{role.title}</h2>
                {role.summary ? <p className={styles.roleSummary}>{role.summary}</p> : null}
                {role.compensationRange ? (
                  <p className={styles.cardExcerpt}>{role.compensationRange}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MarketingPage>
  );
}
