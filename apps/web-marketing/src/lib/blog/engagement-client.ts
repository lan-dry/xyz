import { trackEvent } from "@/lib/analytics/gtag";

import { getBlogSessionKey } from "./engagement-session";

export type BlogEngagementEventName =
  | "page_view"
  | "time_on_page"
  | "scroll_depth"
  | "listen_start"
  | "listen_pause"
  | "listen_resume"
  | "listen_complete"
  | "listen_seconds"
  | "share_click"
  | "copy_link";

type Payload = {
  slug: string;
  event: BlogEngagementEventName;
  valueNum?: number;
  metadata?: Record<string, string | number | boolean>;
};

export async function sendBlogEngagement(payload: Payload): Promise<void> {
  const sessionKey = getBlogSessionKey();

  trackEvent(`blog_${payload.event}`, {
    article_slug: payload.slug,
    session_key: sessionKey,
    value: payload.valueNum,
    ...payload.metadata,
  });

  try {
    await fetch("/api/blog/engagement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: payload.slug,
        event: payload.event,
        sessionKey,
        valueNum: payload.valueNum ?? null,
        metadata: payload.metadata ?? {},
      }),
      keepalive: true,
    });
  } catch {
    /* analytics must not break reading */
  }
}
