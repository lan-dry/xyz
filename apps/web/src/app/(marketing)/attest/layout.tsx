import type { ReactNode } from "react";

/** Attest product pages use AttestSiteHeader via MarketingChrome (pathname /attest/* or Attest hosts). */
export default function AttestProductLayout({ children }: { children: ReactNode }) {
  return (
    <div data-attest-product>
      {process.env.NODE_ENV === "development" ? (
        <output
          hidden
          data-salanor-dev="attest-served-in-place — middleware rewrite, not a redirect to salanor.com"
        />
      ) : null}
      {children}
    </div>
  );
}
