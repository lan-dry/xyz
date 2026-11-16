import { notFound } from "next/navigation";

import { isBankDemoProfile } from "@/lib/ui-profile";

import { SimulatorClient } from "./simulator-client";

/** Demo only: 404 outside the bank_demo profile. */
export default function SimulatorPage() {
  if (!isBankDemoProfile()) notFound();
  return <SimulatorClient />;
}
