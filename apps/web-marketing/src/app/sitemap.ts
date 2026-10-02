import type { MetadataRoute } from "next";

import { getPublishedBlogSlugs } from "@/lib/blog/store";
import { listPublishedResearch } from "@/lib/cms/research-store";

const SITE = "https://www.salanor.com";

const routes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/products/aegis", changeFrequency: "weekly", priority: 0.95 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/products/aether", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about/founding", changeFrequency: "yearly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { path: "/spec", changeFrequency: "monthly", priority: 0.75 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/research", changeFrequency: "weekly", priority: 0.6 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.65 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/security", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/fedramp", changeFrequency: "yearly", priority: 0.35 },
  { path: "/trust", changeFrequency: "monthly", priority: 0.85 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE}${path === "/" ? "" : path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));

  let blogEntries: MetadataRoute.Sitemap = [];
  try {
    const slugs = await getPublishedBlogSlugs();
    blogEntries = slugs.map(({ slug, updatedAt }) => ({
      url: `${SITE}/blog/${slug}`,
      lastModified: new Date(updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    blogEntries = [];
  }

  let researchEntries: MetadataRoute.Sitemap = [];
  try {
    const posts = await listPublishedResearch();
    researchEntries = posts.map((p) => ({
      url: `${SITE}/research/${p.slug}`,
      lastModified: new Date(p.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.55,
    }));
  } catch {
    researchEntries = [];
  }

  return [...staticEntries, ...blogEntries, ...researchEntries];
}
