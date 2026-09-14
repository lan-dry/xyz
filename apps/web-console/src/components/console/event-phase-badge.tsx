import {
  eventPhase,
  eventPhaseLabel,
  type EventPhase,
} from "@/lib/event-phase";

const PHASE_STYLES: Record<EventPhase, { bg: string; color: string }> = {
  input: { bg: "rgba(59, 130, 246, 0.12)", color: "#1d4ed8" },
  output: { bg: "rgba(4, 120, 87, 0.12)", color: "#047857" },
  policy: { bg: "rgba(180, 83, 9, 0.12)", color: "#b45309" },
  governance: { bg: "rgba(124, 58, 237, 0.12)", color: "#6d28d9" },
  approval: { bg: "rgba(37, 99, 235, 0.1)", color: "#1e40af" },
  audit: { bg: "rgba(100, 116, 139, 0.15)", color: "#475569" },
};

export function EventPhaseBadge({ actionKind }: { actionKind: string }) {
  const phase = eventPhase(actionKind);
  const style = PHASE_STYLES[phase];
  return (
    <span
      title={actionKind}
      style={{
        display: "inline-block",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
        padding: "0.1rem 0.4rem",
        borderRadius: "4px",
        background: style.bg,
        color: style.color,
      }}
    >
      {eventPhaseLabel(phase)}
    </span>
  );
}
