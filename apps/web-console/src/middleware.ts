import { NextResponse, type NextRequest } from "next/server";

/**
 * Keep console HTML/RSC out of the browser disk cache.
 *
 * Without this, Chrome can keep an old client shell (e.g. "Insurance · preview")
 * after a deploy or `next dev` restart - Incognito looks correct, the main
 * profile does not. Hashed `/_next/static/*` assets in production stay
 * immutable; only unhashed dev chunks are forced to revalidate.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  const isDevChunk =
    process.env.NODE_ENV !== "production" &&
    pathname.startsWith("/_next/static/chunks/");
  const isDocument =
    !pathname.startsWith("/_next/static/") &&
    !pathname.startsWith("/_next/image") &&
    !/\.(?:ico|png|jpe?g|svg|webp|woff2?)$/i.test(pathname);

  // Production hashed `/_next/static/*` keep Next's immutable Cache-Control.
  if (isDocument || isDevChunk) {
    response.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
  }

  // "Clear site data" in DevTools does NOT wipe the HTTP disk cache. Without this,
  // Chrome can keep an old `/_next/static/chunks/...` shell forever on localhost
  // (Incognito looks fine; the main profile does not). Localhost is a secure context.
  if (isDocument && process.env.NODE_ENV !== "production") {
    response.headers.set("Clear-Site-Data", '"cache"');
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/image|favicon.ico|.*\\.(?:ico|png|jpe?g|svg|webp|woff2?)$).*)"],
};
