import { redirect } from "next/navigation";

import { PLATFORM_URL } from "@/lib/site-urls";

/** Platform admin lives in Platform Ops, not the customer console. */
export default function PlatformAdminRedirectPage() {
  redirect(`${PLATFORM_URL.replace(/\/$/, "")}/organizations`);
}
