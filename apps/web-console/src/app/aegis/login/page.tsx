"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — platform login at /login. */
export default function AegisLoginRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login?return=/aegis/traces");
  }, [router]);
  return (
    <main style={{ padding: "2rem" }}>
      <p>Redirecting to Salanor ID…</p>
    </main>
  );
}
