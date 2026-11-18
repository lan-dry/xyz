import { redirect } from "next/navigation";

/** Insurance product is hidden until the service is connected. */
export default function InsuranceRedirectPage() {
  redirect("/aegis");
}
