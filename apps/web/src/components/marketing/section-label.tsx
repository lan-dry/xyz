import type { ReactNode } from "react";

export function SectionLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`font-mono text-[0.625rem] tracking-[0.18em] text-gold uppercase ${className}`}
    >
      {children}
    </p>
  );
}
