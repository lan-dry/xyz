import Image from "next/image";

import styles from "./salanor-logo.module.css";

const LOGO_SRC = "/salanor-logo.png";

export function SalanorLogo({
  size = 28,
  className,
  showWordmark = false,
  wordmark = "Salanor",
  sublabel,
}: {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmark?: string;
  sublabel?: string;
}) {
  const mark = (
    <Image
      src={LOGO_SRC}
      alt=""
      width={size}
      height={size}
      className={styles.mark}
      priority
    />
  );

  if (!showWordmark) {
    return (
      <span className={`${styles.wrap} ${className ?? ""}`} aria-hidden={!wordmark}>
        {mark}
      </span>
    );
  }

  return (
    <span className={`${styles.brand} ${className ?? ""}`}>
      {mark}
      <span className={styles.text}>
        <span className={styles.wordmark}>{wordmark}</span>
        {sublabel ? <span className={styles.sublabel}>{sublabel}</span> : null}
      </span>
    </span>
  );
}
