import { redirect } from "next/navigation";

import { getPlatformSessionServer } from "@/lib/platform-server-session";

export const dynamic = "force-dynamic";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await getPlatformSessionServer();
  if (!session) {
    redirect("/login");
  }

  return children;
}
