import { redirect } from "next/navigation";

import { auth } from "@/auth";

/** Admin access is invite-only; registration uses magic link at sign-in. */
export default async function SignUpPage() {
  const session = await auth();
  if (session) {
    redirect("/admin");
  }
  redirect("/sign-in");
}
