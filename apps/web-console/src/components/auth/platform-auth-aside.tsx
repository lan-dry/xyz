import { SalanorLogo } from "@/components/salanor-logo";

import styles from "@/app/login/login.module.css";

const MARKETING_URL =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3001";

type Props = {
  title: string;
  description: string;
};

export function PlatformAuthAside({ title, description }: Props) {
  return (
    <aside className={styles.brand}>
      <a href={MARKETING_URL} className={styles.logo}>
        <SalanorLogo size={32} showWordmark />
      </a>
      <h1>{title}</h1>
      <p>{description}</p>
      <ul className={styles.points}>
        <li>
          <strong>APS-1 ledger</strong> — per-organization scope
        </li>
        <li>
          <strong>Human approvals</strong> — obligation workflows
        </li>
        <li>
          <strong>Exports</strong> — SOC 2, EU AI Act, OTel SIEM
        </li>
      </ul>
    </aside>
  );
}
