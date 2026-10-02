import { newsletterPublicOrigin } from "@/lib/site-origin";

/** Permanent one-click unsubscribe URL (include in every marketing email). */
export function newsletterUnsubscribeUrl(unsubscribeToken: string): string {
  const base = newsletterPublicOrigin();
  return `${base}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
}
