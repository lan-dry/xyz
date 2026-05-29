"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { idApi } from "@/lib/id-api";
import { PLATFORM_PRODUCTS } from "@/lib/products";
import type { MeResponse } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const session = useQuery({
    queryKey: ["id", "me"],
    queryFn: () => idApi<MeResponse>("/auth/me"),
    retry: false,
  });

  useEffect(() => {
    if (session.isSuccess && session.data?.user) {
      router.replace("/aegis");
    }
  }, [session.isSuccess, session.data, router]);

  if (session.isPending || (session.isSuccess && session.data?.user)) {
    return (
      <main style={{ padding: "2rem", color: "#64748b" }}>Loading…</main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f6f5",
        padding: "2rem",
      }}
    >
      <div
        style={{
          maxWidth: "28rem",
          width: "100%",
          background: "#fff",
          border: "1px solid #e2e8e6",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "0 1px 2px rgba(10,12,11,0.06)",
        }}
      >
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.5rem" }}>Salanor Console</h1>
        <p style={{ margin: "0 0 1.5rem", color: "#5c6e6a", fontSize: "0.875rem" }}>
          Sign in to operate Aegis and preview Insurance.
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "0.625rem 1.25rem",
            background: "#2a9d8a",
            color: "#fff",
            borderRadius: "6px",
            fontWeight: 500,
            textDecoration: "none",
            marginBottom: "1.5rem",
          }}
        >
          Sign in
        </Link>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {PLATFORM_PRODUCTS.map((product) => (
            <li
              key={product.slug}
              style={{
                marginBottom: "0.75rem",
                padding: "1rem",
                border: "1px solid #e2e8e6",
                borderRadius: "8px",
              }}
            >
              <strong>{product.name}</strong>
              {product.status === "preview" ? (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#7a8c88" }}>
                  preview
                </span>
              ) : null}
              <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#5c6e6a" }}>
                {product.description}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
