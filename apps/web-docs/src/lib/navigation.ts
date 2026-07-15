export type NavItem = {
  title: string;
  href: string;
  children?: NavItem[];
};

/** Customer-facing integration docs (default). */
export const aegisNav: NavItem[] = [
  { title: "Overview", href: "/aegis" },
  { title: "Getting started", href: "/aegis/getting-started" },
  {
    title: "SDK",
    href: "/aegis/sdk",
    children: [
      { title: "Overview", href: "/aegis/sdk" },
      { title: "TypeScript / JavaScript", href: "/aegis/sdk/typescript" },
      { title: "Python (alpha)", href: "/aegis/sdk/python" },
      { title: "Go", href: "/aegis/sdk/go" },
    ],
  },
  {
    title: "HTTP API",
    href: "/aegis/api",
    children: [
      { title: "Overview", href: "/aegis/api" },
      { title: "Authentication", href: "/aegis/api/authentication" },
      { title: "Ingest events", href: "/aegis/api/events" },
      { title: "Policy evaluate", href: "/aegis/api/policy" },
      { title: "Approvals", href: "/aegis/api/approvals" },
      { title: "Public verify", href: "/aegis/api/public" },
    ],
  },
  {
    title: "Event model",
    href: "/aegis/events/envelope",
    children: [
      { title: "APS envelope", href: "/aegis/events/envelope" },
      { title: "Payload conventions", href: "/aegis/events/payload" },
    ],
  },
  { title: "Errors & limits", href: "/aegis/errors" },
];
