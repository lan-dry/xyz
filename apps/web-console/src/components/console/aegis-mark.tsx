/** Branded empty-state mark — Aegis shield + ledger hex (Salanor teal). */
export function AegisMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect x="8" y="8" width="48" height="48" rx="14" fill="var(--console-accent-soft)" />
      <path
        d="M32 18L44 24V34C44 41.2 38.4 46.8 32 48C25.6 46.8 20 41.2 20 34V24L32 18Z"
        stroke="var(--console-accent)"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M32 26L36 28.5V33.2C36 35.9 34.2 38.2 32 38.8C29.8 38.2 28 35.9 28 33.2V28.5L32 26Z"
        fill="var(--console-accent)"
        opacity="0.35"
      />
      <circle cx="32" cy="33" r="3" fill="var(--console-accent)" />
      <path
        d="M26 40H38"
        stroke="var(--console-accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}
