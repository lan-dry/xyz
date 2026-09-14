"use client";

export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div style={{ maxWidth: "42rem", margin: "0 auto 1rem", display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.875rem" }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: 6,
          border: "1px solid var(--border-bright)",
          background: "var(--teal-dim)",
          color: "var(--text)",
          cursor: "pointer",
        }}
      >
        Print / Save as PDF
      </button>
      <a href={backHref} style={{ color: "var(--teal-bright)", alignSelf: "center" }}>
        Back to product
      </a>
    </div>
  );
}
