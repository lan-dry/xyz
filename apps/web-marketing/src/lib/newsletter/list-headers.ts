import { newsletterPublicOrigin } from "@/lib/site-origin";

import { newsletterUnsubscribeUrl } from "./urls";

/** RFC 8058 + Gmail/Yahoo list UI (header Unsubscribe + Subscriptions manager). */
export function newsletterListMailHeaders(unsubscribeToken: string): Record<string, string> {
  const httpsUrl = newsletterUnsubscribeUrl(unsubscribeToken);
  const origin = newsletterPublicOrigin();
  return {
    "List-Unsubscribe": `<${httpsUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "List-ID": "Salanor Updates <updates.salanor.com>",
    "List-Help": `<mailto:hello@salanor.com?subject=Newsletter%20help>`,
    "List-Archive": `<${origin}/blog>`,
  };
}
