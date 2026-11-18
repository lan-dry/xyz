import { redirect } from "next/navigation";

/** Members lives under Settings so the Settings tabs stay visible. */
export default function MembersRedirectPage() {
  redirect("/aegis/settings/members");
}
