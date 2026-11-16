import { redirect } from "next/navigation";

import { PLATFORM_URL } from "@/lib/site-urls";

/** Org provisioning lives in Platform Ops — not the customer console. */
export default function ProvisionRedirectPage() {
  redirect(`${PLATFORM_URL.replace(/\/$/, "")}/provision`);
}
