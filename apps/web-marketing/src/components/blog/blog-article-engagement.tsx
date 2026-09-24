"use client";

import { useEffect, useRef } from "react";

import { sendBlogEngagement } from "@/lib/blog/engagement-client";

type Props = {
  slug: string;
};

export function BlogArticleEngagement({ slug }: Props) {
  const startedAt = useRef(Date.now());
  const sentDepth = useRef(new Set<number>());
  const sentTimeBuckets = useRef(new Set<number>());

  useEffect(() => {
    startedAt.current = Date.now();
    sentDepth.current.clear();
    sentTimeBuckets.current.clear();

    void sendBlogEngagement({ slug, event: "page_view" });

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const ratio = window.scrollY / max;
      for (const depth of [25, 50, 75, 90]) {
        if (ratio * 100 >= depth && !sentDepth.current.has(depth)) {
          sentDepth.current.add(depth);
          void sendBlogEngagement({
            slug,
            event: "scroll_depth",
            valueNum: depth,
          });
        }
      }
    };

    const tick = window.setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt.current) / 1000);
      for (const bucket of [30, 60, 120, 300]) {
        if (sec >= bucket && !sentTimeBuckets.current.has(bucket)) {
          sentTimeBuckets.current.add(bucket);
          void sendBlogEngagement({
            slug,
            event: "time_on_page",
            valueNum: bucket,
          });
        }
      }
    }, 5000);

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearInterval(tick);
      const totalSec = Math.round((Date.now() - startedAt.current) / 1000);
      if (totalSec >= 5) {
        void sendBlogEngagement({
          slug,
          event: "time_on_page",
          valueNum: totalSec,
          metadata: { final: true },
        });
      }
    };
  }, [slug]);

  return null;
}
