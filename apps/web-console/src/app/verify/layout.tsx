import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify event · Salanor",
  description:
    "Public Merkle inclusion verification for Salanor Aegis APS events.",
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
