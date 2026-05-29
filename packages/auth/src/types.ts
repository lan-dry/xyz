import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role?: string | null;
      totpEnabled?: boolean;
      totpVerified?: boolean;
      /** Set when `users.platform_suspended_at` is set — blocks admin/console surfaces. */
      accessBlocked?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: string | null;
    totpEnabled?: boolean;
    totpVerified?: boolean;
    accessBlocked?: boolean;
  }
}

export type SalanorSessionUser = NonNullable<import("next-auth").Session["user"]>;

/** OAuth providers enabled when id + secret env vars are set (`AUTH-A2`). */
export type SalanorOAuthProviderId = "google" | "github";
