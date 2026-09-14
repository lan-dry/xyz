import Link from "next/link";

import { ui } from "@/components/console/console-ui";

type Props = {
  chainRootHash: string;
  rootEventId?: string | null;
  rootEventHash?: string | null;
};

export function ChainRootPanel({
  chainRootHash,
  rootEventId,
  rootEventHash,
}: Props) {
  return (
    <div className={`${ui.card} ${ui.cardPad} ${ui.panel}`} style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle}>Chain root</h2>
      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(6rem, 9rem) 1fr",
          gap: "0.625rem 1rem",
          margin: 0,
          fontSize: "0.875rem",
        }}
      >
        <dt style={{ color: "var(--console-fg-subtle)" }}>Session anchor</dt>
        <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
          {chainRootHash}
        </dd>
        {rootEventId ? (
          <>
            <dt style={{ color: "var(--console-fg-subtle)" }}>First event</dt>
            <dd style={{ margin: 0 }}>
              <Link
                href={`/aegis/events/${encodeURIComponent(rootEventId)}`}
                className={`${ui.tableLink} mono`}
              >
                {rootEventId}
              </Link>
            </dd>
          </>
        ) : null}
        {rootEventHash ? (
          <>
            <dt style={{ color: "var(--console-fg-subtle)" }}>First event hash</dt>
            <dd className="mono" style={{ margin: 0, wordBreak: "break-all" }}>
              {rootEventHash}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}
