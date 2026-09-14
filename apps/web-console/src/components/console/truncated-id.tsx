import { CopyButton } from "@/components/console/copy-button";

export function TruncatedId({
  value,
  head = 8,
  tail = 6,
}: {
  value: string;
  head?: number;
  tail?: number;
}) {
  const compact =
    value.length > head + tail + 1
      ? `${value.slice(0, head)}…${value.slice(-tail)}`
      : value;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        maxWidth: "100%",
      }}
    >
      <span className="mono" style={{ fontSize: "0.75rem" }} title={value}>
        {compact}
      </span>
      <CopyButton text={value} label="Copy ID" iconOnly />
    </span>
  );
}
