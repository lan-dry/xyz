"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { idApi } from "@/lib/id-api";

const PUBLIC_PATHS = new Set([
  "/login",
  "/invite",
  "/forgot-password",
  "/reset-password",
]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (PUBLIC_PATHS.has(pathname)) {
      setReady(true);
      return;
    }
    idApi<{ user?: { email: string } }>("/auth/me")
      .then((data) => {
        if (!data.user?.email) {
          router.replace(`/login?return=${encodeURIComponent(pathname || "/")}`);
          return;
        }
        setReady(true);
      })
      .catch(() => {
        router.replace(`/login?return=${encodeURIComponent(pathname || "/")}`);
      });
  }, [pathname, router]);

  if (!ready) {
    return (
      <p style={{ padding: "2rem", color: "#9aa3ad" }}>Checking sign-in…</p>
    );
  }

  return children;
}
