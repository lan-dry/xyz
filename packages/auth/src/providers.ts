import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { sendSalanorMagicLinkEmail } from "./magic-link-email";
import type { SalanorOAuthProviderId } from "./types";

function hasOAuthPair(idKey: string, secretKey: string): boolean {
  return Boolean(process.env[idKey]?.trim() && process.env[secretKey]?.trim());
}

export function getOAuthProviderIds(): SalanorOAuthProviderId[] {
  const ids: SalanorOAuthProviderId[] = [];
  if (hasOAuthPair("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET")) ids.push("google");
  if (hasOAuthPair("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET")) ids.push("github");
  return ids;
}

/** Auth.js providers for Salanor apps (magic link + optional OAuth). */
export function salanorAuthProviders(): Provider[] {
  const providers: Provider[] = [
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
      sendVerificationRequest: sendSalanorMagicLinkEmail,
    }),
  ];

  if (hasOAuthPair("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET")) {
    providers.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      }),
    );
  }

  if (hasOAuthPair("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET")) {
    providers.push(
      GitHub({
        clientId: process.env.AUTH_GITHUB_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!,
      }),
    );
  }

  return providers;
}
