import type { ReactNode } from "react";

export function ConsoleDataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--console-border)] bg-[var(--console-surface)]">
      <table className="w-full text-left text-sm text-[var(--console-fg)]">{children}</table>
    </div>
  );
}

export function ConsoleTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--console-surface-muted)] text-xs font-medium tracking-tight text-[var(--console-fg-subtle)]">
      {children}
    </thead>
  );
}

export function ConsoleTableRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-t border-[var(--console-border-subtle)] transition-colors duration-150 hover:bg-[var(--console-surface-hover)]">
      {children}
    </tr>
  );
}

export function ConsoleTh({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`.trim()}>{children}</th>;
}

export function ConsoleTd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-middle text-sm ${className}`.trim()}>{children}</td>;
}
