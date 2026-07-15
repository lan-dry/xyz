import type { ReactNode } from "react";

/** Aegis product pages use AegisSiteHeader via MarketingChrome (pathname /aegis/* or Aegis hosts). */
export default function AegisProductLayout({ children }: { children: ReactNode }) {
  return (
    <div data-aegis-product>
      {process.env.NODE_ENV === "development" ? (
        <output
          hidden
          data-salanor-dev="aegis-served-in-place — middleware rewrite, not a redirect to salanor.com"
        />
      ) : null}
      {children}
    </div>
  );
}
