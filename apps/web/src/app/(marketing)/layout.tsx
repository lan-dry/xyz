import { headers } from "next/headers";
import type { ReactNode } from "react";

import { ConsoleAuthChrome } from "@/components/auth/console-auth-chrome";
import { MarketingChrome } from "@/components/marketing/marketing-chrome";
import { isAppPublicHost } from "@/lib/public-hosts";

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const host = (await headers()).get("host");
  if (isAppPublicHost(host)) {
    return <ConsoleAuthChrome>{children}</ConsoleAuthChrome>;
  }
  return <MarketingChrome>{children}</MarketingChrome>;
}
