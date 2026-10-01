import styles from "./blog.module.css";

type Props = {
  linkedinUrl?: string | null;
  xUrl?: string | null;
  instagramUrl?: string | null;
};

export function BlogAuthorSocial({ linkedinUrl, xUrl, instagramUrl }: Props) {
  const links = [
    linkedinUrl ? { href: linkedinUrl, label: "LinkedIn" } : null,
    xUrl ? { href: xUrl, label: "X" } : null,
    instagramUrl ? { href: instagramUrl, label: "Instagram" } : null,
  ].filter(Boolean) as { href: string; label: string }[];

  if (links.length === 0) return null;

  return (
    <div className={styles.authorSocial}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.authorSocialLink}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
