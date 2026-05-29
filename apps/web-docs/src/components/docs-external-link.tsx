/** Header / inline link that opens an external URL in a new tab. */
export function DocsExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="docs-header-link docs-header-link-external"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>{children}</span>
      <ExternalTabIcon />
      <span className="docs-sr-only"> (opens in new tab)</span>
    </a>
  );
}

function ExternalTabIcon() {
  return (
    <svg
      className="docs-external-icon"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}
