import { redirect } from "next/navigation";

/** Cases list lives under Live feed (Phase 3 pitch). */
export default function TracesRedirectPage() {
  redirect("/aegis/live");
}
