import { redirect } from "next/navigation";

/** Phase 3 rename: Evidence is the pitch label for compliance exports / bundles. */
export default function EvidencePage() {
  redirect("/aegis/exports");
}
