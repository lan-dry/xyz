import styles from "./aegis-code-window.module.css";

/**
 * Hero terminal card — structure and colors from salanor_website.html .terminal-card
 */
export function AegisCodeWindow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`${styles.window} ${className}`.trim()}
      role="img"
      aria-label="Aegis Python SDK example: record a decision and receive an anchored event ID"
    >
      <div className={styles.bar} aria-hidden>
        <span className={`${styles.dot} ${styles.dotRed}`} />
        <span className={`${styles.dot} ${styles.dotYellow}`} />
        <span className={`${styles.dot} ${styles.dotGreen}`} />
        <span className={styles.title}>aegis · python</span>
      </div>
      <div className={styles.body}>
        <p className={styles.line}>
          <span className={styles.comment}># Record any consequential decision</span>
        </p>
        <p className={styles.line}>
          <span className={styles.kw}>from</span> <span className={styles.white}>salanor_aegis_ledger</span>{" "}
          <span className={styles.kw}>import</span> <span className={styles.fn}>aegis</span>
        </p>
        <div className={styles.gap} aria-hidden />
        <p className={styles.line}>
          <span className={styles.dim}>decision</span> = <span className={styles.fn}>aegis</span>.
          <span className={styles.fn}>record</span>(
        </p>
        <p className={styles.line}>
          &nbsp;&nbsp;<span className={styles.str}>subject</span>=
          <span className={styles.dim}>{"{"}</span>
          <span className={styles.str}>&quot;kind&quot;</span>
          <span className={styles.dim}>: </span>
          <span className={styles.str}>&quot;loan_application&quot;</span>
          <span className={styles.dim}>{"}"},</span>
        </p>
        <p className={styles.line}>
          &nbsp;&nbsp;<span className={styles.str}>action</span>=
          <span className={styles.str}>&quot;underwriting.decline&quot;</span>,
        </p>
        <p className={styles.line}>
          &nbsp;&nbsp;<span className={styles.str}>model</span>=
          <span className={styles.dim}>{"{"}</span>
          <span className={styles.str}>&quot;id&quot;</span>
          <span className={styles.dim}>: </span>
          <span className={styles.str}>&quot;uw-v3.2&quot;</span>
          <span className={styles.dim}>{"}"},</span>
        </p>
        <p className={styles.line}>
          &nbsp;&nbsp;<span className={styles.str}>outcome</span>=
          <span className={styles.dim}>{"{"}</span>
          <span className={styles.str}>&quot;reason&quot;</span>
          <span className={styles.dim}>: </span>
          <span className={styles.str}>&quot;score_below_threshold&quot;</span>
          <span className={styles.dim}>{"}"},</span>
        </p>
        <p className={styles.line}>)</p>
        <div className={styles.gap} aria-hidden />
        <p className={styles.line}>
          <span className={styles.comment}># returns immediately</span>
        </p>
        <p className={styles.line}>
          <span className={styles.ok}>✓</span> <span className={styles.dim}>event_id: </span>
          <span className={styles.str}>evt_01J7XZ4K</span>
        </p>
        <p className={styles.line}>
          <span className={styles.ok}>✓</span> <span className={styles.dim}>anchored · proof available</span>{" "}
          <span className={styles.cursor} aria-hidden />
        </p>
      </div>
    </div>
  );
}
