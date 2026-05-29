import { aegisNav, type NavItem } from "./navigation";

export type DocsSearchEntry = {
  title: string;
  href: string;
  section: string;
  keywords: string;
};

/** Flatten sidebar nav + extra terms for client-side search (Ctrl+K). */
function flattenNav(items: NavItem[], section = "Aegis"): DocsSearchEntry[] {
  const out: DocsSearchEntry[] = [];
  for (const item of items) {
    if (item.children?.length) {
      for (const child of item.children) {
        out.push({
          title: child.title,
          href: child.href,
          section: item.title,
          keywords: `${item.title} ${child.title}`.toLowerCase(),
        });
      }
    } else {
      out.push({
        title: item.title,
        href: item.href,
        section,
        keywords: item.title.toLowerCase(),
      });
    }
  }
  return out;
}

const EXTRA: DocsSearchEntry[] = [
  {
    title: "Python sign_and_ingest",
    href: "/aegis/sdk/python",
    section: "SDK",
    keywords: "python pip salanor-aegis",
  },
  {
    title: "Go SignAndIngest",
    href: "/aegis/sdk/go",
    section: "SDK",
    keywords: "golang go module salanor-go",
  },
  {
    title: "SDK overview",
    href: "/aegis/sdk",
    section: "SDK",
    keywords: "languages rust java typescript python go",
  },
  {
    title: "signAndIngest",
    href: "/aegis/sdk/typescript",
    section: "SDK",
    keywords: "sign ingest llm event typescript",
  },
  {
    title: "wrapFetch",
    href: "/aegis/sdk/typescript",
    section: "SDK",
    keywords: "wrap fetch policy stripe tool",
  },
  {
    title: "POST /events",
    href: "/aegis/api/events",
    section: "HTTP API",
    keywords: "ingest events post api",
  },
  {
    title: "Ingest API key",
    href: "/aegis/api/authentication",
    section: "HTTP API",
    keywords: "bearer authorization api key",
  },
  {
    title: "Policy evaluate",
    href: "/aegis/api/policy",
    section: "HTTP API",
    keywords: "deny allow obligation policy",
  },
  {
    title: "APS envelope",
    href: "/aegis/events/envelope",
    section: "Event model",
    keywords: "schema event_id trace_id signature",
  },
  {
    title: "data_touched",
    href: "/aegis/events/payload",
    section: "Event model",
    keywords: "payload pii provenance metadata",
  },
];

export const docsSearchIndex: DocsSearchEntry[] = [
  ...flattenNav(aegisNav),
  ...EXTRA,
];

export function searchDocs(query: string, limit = 8): DocsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return docsSearchIndex.slice(0, limit);

  const scored = docsSearchIndex.map((entry) => {
    const hay = `${entry.title} ${entry.section} ${entry.keywords}`.toLowerCase();
    let score = 0;
    if (entry.title.toLowerCase().startsWith(q)) score += 10;
    if (entry.title.toLowerCase().includes(q)) score += 5;
    if (hay.includes(q)) score += 2;
    for (const word of q.split(/\s+/)) {
      if (word && hay.includes(word)) score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
