import type { ReactNode } from "react";

export function AdminDataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
      <table className="w-full text-left text-sm text-[var(--admin-fg)]">{children}</table>
    </div>
  );
}

export function AdminTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-[var(--admin-surface-muted)] text-xs font-medium tracking-tight text-[var(--admin-fg-subtle)]">
      {children}
    </thead>
  );
}

export function AdminTableRow({ children }: { children: ReactNode }) {
  return (
    <tr className="border-t border-[var(--admin-border-subtle)] transition-colors duration-150 hover:bg-[var(--admin-surface-hover)]">
      {children}
    </tr>
  );
}

export function AdminTh({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`.trim()}>{children}</th>;
}

export function AdminTd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3.5 align-middle text-sm ${className}`.trim()}>{children}</td>;
}
