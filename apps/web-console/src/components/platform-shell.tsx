"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PLATFORM_PRODUCTS } from "../lib/products";

export function PlatformShell({
  productName,
  children,
  nav,
}: {
  productName: string;
  children: React.ReactNode;
  nav?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 2rem",
          borderBottom: "1px solid #e2e8f0",
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Link href="/" style={{ fontWeight: 700, color: "#0f172a" }}>
            Salanor
          </Link>
          <nav style={{ display: "flex", gap: "0.5rem" }}>
            {PLATFORM_PRODUCTS.map((product) => {
              const active =
                !product.external &&
                (pathname === product.href ||
                  pathname.startsWith(`${product.href}/`));
              const style = {
                padding: "0.25rem 0.75rem",
                borderRadius: "4px",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                background: active ? "#e2e8f0" : "transparent",
                color: active ? "#0f172a" : "#64748b",
              } as const;
              const label = (
                <>
                  {product.name}
                  {product.status === "preview" ? " (preview)" : ""}
                </>
              );
              if (product.external) {
                return (
                  <a
                    key={product.slug}
                    href={product.href}
                    style={style}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {label}
                  </a>
                );
              }
              return (
                <Link key={product.slug} href={product.href} style={style}>
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
          {productName}
        </span>
      </header>
      {nav}
      <main>{children}</main>
    </div>
  );
}
