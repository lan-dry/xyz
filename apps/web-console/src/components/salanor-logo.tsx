import Image from "next/image";

import styles from "./salanor-logo.module.css";

export function SalanorLogo({
  size = 28,
  className,
  showWordmark = false,
  wordmark = "Salanor",
  sublabel,
  variant = "primary",
}: {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  wordmark?: string;
  sublabel?: string;
  /** Primary teal on light sidebar; white mark in dark theme. */
  variant?: "primary" | "white";
}) {
  const src =
    variant === "white" ? "/salanor-mark-white.png" : "/salanor-mark-primary.png";

  const mark = (
    <Image
      src={src}
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
