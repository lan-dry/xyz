import { ui } from "@/components/console/console-ui";

type Props = {
  claim: string;
  authority?: string | null;
  title?: string;
};

export function ProvenanceClaimPanel({
  claim,
  authority,
  title = "Provenance claim",
}: Props) {
  return (
    <div className={`${ui.card} ${ui.cardPad} ${ui.panel}`} style={{ marginBottom: "1.5rem" }}>
      <h2 className={ui.panelTitle}>{title}</h2>
      <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>{claim}</p>
      {authority ? (
        <p
          style={{
            margin: "0.75rem 0 0",
            fontSize: "0.8125rem",
            color: "var(--console-fg-subtle)",
          }}
        >
          Authority: <span className="mono">{authority}</span>
        </p>
      ) : null}
    </div>
  );
}
