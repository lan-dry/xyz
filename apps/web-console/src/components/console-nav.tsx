"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConsoleUser } from "../lib/types";

export function ConsoleNav({
  user,
  onLogout,
}: {
  user: ConsoleUser;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        style={{
          marginRight: "1rem",
          fontWeight: active ? 600 : 400,
          color: active ? "#0f172a" : "#64748b",
        }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <nav>
        {link("/aegis/traces", "Traces")}
        {link("/aegis/approvals", "Approvals")}
        {link("/aegis/settings/keys", "API keys")}
        {link("/aegis/settings/policies", "Policies")}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          {user.email}
        </span>
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: "0.35rem 0.75rem",
            border: "1px solid #cbd5e1",
            borderRadius: "4px",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
