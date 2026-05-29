import { readFileSync } from "node:fs";
import path from "node:path";

export type ContactChannel = {
  id: string;
  label: string;
  description: string;
  email: string;
};

export type SocialLink = {
  id: string;
  label: string;
  url: string;
};

export type SiteContact = {
  intro: string;
  channels: ContactChannel[];
  social: SocialLink[];
  address: {
    label: string;
    lines: string[];
  };
};

const DEFAULT_CONTACT: SiteContact = {
  intro:
    "We read every message. Pick the path that fits, or use the form — we respond within two business days.",
  channels: [
    {
      id: "partnerships",
      label: "Partnerships",
      description: "Design partners, pilots, integrations, and procurement.",
      email: "partners@salanor.com",
    },
    {
      id: "press",
      label: "Press",
      description: "Interview requests and media briefings.",
      email: "press@salanor.com",
    },
    {
      id: "general",
      label: "General",
      description: "Everything else, including responsible disclosure coordination.",
      email: "hello@salanor.com",
    },
  ],
  social: [],
  address: { label: "Office", lines: [] },
};

let cached: SiteContact | null = null;

function contactFilePath(): string {
  const configured = process.env.SITE_CONTACT_PATH?.trim();
  if (configured) return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  return path.join(process.cwd(), "data", "site-contact.json");
}

/** Editable via `apps/web-marketing/data/site-contact.json` (or SITE_CONTACT_PATH). */
export function getSiteContact(): SiteContact {
  if (cached) return cached;
  try {
    const raw = readFileSync(contactFilePath(), "utf8");
    const parsed = JSON.parse(raw) as SiteContact;
    if (!parsed.channels?.length) return DEFAULT_CONTACT;
    cached = parsed;
    return parsed;
  } catch {
    return DEFAULT_CONTACT;
  }
}

export function contactEmailForReason(reason: string): string {
  const { channels } = getSiteContact();
  switch (reason) {
    case "press":
      return channels.find((c) => c.id === "press")?.email ?? "press@salanor.com";
    case "security":
      return channels.find((c) => c.id === "general")?.email ?? "hello@salanor.com";
    case "investor":
    case "design_partner":
    case "enterprise":
    default:
      return channels.find((c) => c.id === "partnerships")?.email ?? "partners@salanor.com";
  }
}
