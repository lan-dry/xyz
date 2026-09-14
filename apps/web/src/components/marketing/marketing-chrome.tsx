"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AegisSiteHeader } from "@/components/marketing/aegis-site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { isAegisProductSurface } from "@/lib/public-hosts";

export function MarketingChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.host);
  }, []);

  const aegisShell = isAegisProductSurface(host, pathname);

  return (
    <div data-marketing-shell className="flex min-h-screen flex-col">
      {aegisShell ? <AegisSiteHeader /> : <SiteHeader />}
      <main className="site-main flex-1 pt-[var(--site-header-offset,5.25rem)]">{children}</main>
      <SiteFooter />
    </div>
  );
}
