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
      lead="We hire senior engineers across platform, cryptography, and developer experience."
    >
      {roles.length === 0 ? (
        <p>
          No open roles listed right now. Send your portfolio to{" "}
          <a href="mailto:careers@salanor.com" style={{ color: "var(--teal-bright)" }}>
            careers@salanor.com
          </a>{" "}
          or use the{" "}
          <Link href="/contact" style={{ color: "var(--teal-bright)", textDecoration: "none" }}>
            contact form
          </Link>
          .
        </p>
      ) : (
        <ul className={styles.grid} style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {roles.map((role) => (
            <li key={role.id}>
              <Link href={`/careers/${role.slug}`} className={styles.card} style={{ display: "block", textDecoration: "none" }}>
                <p className={styles.cardMeta}>
                  {role.team} · {role.location} · {role.employmentType.replace(/_/g, " ")}
                </p>
                <h2 className={styles.cardTitle}>{role.title}</h2>
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
