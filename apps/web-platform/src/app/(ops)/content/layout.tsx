/** Ops CMS routes use cookies, DB, and Git — never prerender at build time. */
export const dynamic = "force-dynamic";

export default function OpsContentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
