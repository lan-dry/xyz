export function AdminReadOnlyBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--admin-fg-muted)]">
      Read-only
    </span>
  );
}
