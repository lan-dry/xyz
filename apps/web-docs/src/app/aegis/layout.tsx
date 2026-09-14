import { AegisDocsLayoutClient } from "@/components/aegis-docs-layout-client";

export default function AegisDocsLayout({ children }: { children: React.ReactNode }) {
  return <AegisDocsLayoutClient>{children}</AegisDocsLayoutClient>;
}
