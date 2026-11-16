import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify a record - Salanor",
  description:
    "Check that a Salanor Aegis record or evidence bundle is genuine and has not been changed.",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
