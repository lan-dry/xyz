import type { MetadataRoute } from "next";

const SITE = "https://www.salanor.com";

const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/products/aegis", changeFrequency: "weekly", priority: 0.95 },
  { path: "/products/aether", changeFrequency: "monthly", priority: 0.7 },
  { path: "/about", changeFrequency: "monthly", priority: 0.8 },
  { path: "/about/founding", changeFrequency: "yearly", priority: 0.6 },
  { path: "/contact", changeFrequency: "monthly", priority: 0.8 },
  { path: "/spec", changeFrequency: "monthly", priority: 0.75 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.55 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/legal/security", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return routes.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
