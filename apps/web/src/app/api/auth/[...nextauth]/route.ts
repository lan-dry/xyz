import { handlers } from "@/auth";
import { patchAuthResponseSetCookieDomain } from "@salanor/auth/auth-cookie-headers";

export const runtime = "nodejs";

type AuthHandler = (req: Request, ctx: { params: Promise<{ nextauth: string[] }> }) => Promise<Response>;

function logAuthCallbackFailure(req: Request, response: Response): void {
  const url = new URL(req.url);
  if (!url.pathname.includes("/api/auth/callback/")) return;

  const location = response.headers.get("location") ?? "";
  const queryError = url.searchParams.get("error");
  const redirectError =
    location.includes("/sign-in") &&
    (location.includes("error=") || Boolean(queryError));

  if (response.status >= 400 || redirectError) {
    console.error("[auth] callback failed", {
      path: url.pathname,
      status: response.status,
      error: queryError ?? (location.includes("error=") ? "redirect" : undefined),
      location: location || undefined,
    });
  }
}

async function withSharedLocalhostCookies(
  handler: AuthHandler,
  req: Request,
  ctx: { params: Promise<{ nextauth: string[] }> },
): Promise<Response> {
  const response = await handler(req, ctx);
  logAuthCallbackFailure(req, response);
  return patchAuthResponseSetCookieDomain(response);
}

export const GET: AuthHandler = (req, ctx) => withSharedLocalhostCookies(handlers.GET, req, ctx);
export const POST: AuthHandler = (req, ctx) => withSharedLocalhostCookies(handlers.POST, req, ctx);
