import { redirect } from "next/navigation";

/** Insurance product is hidden until the service is connected. */
export default function InsuranceLayout({
  children: _children,
}: {
  children: React.ReactNode;
}) {
  redirect("/aegis");
}
