import {
  MODEL_GROUPS,
  PROFILE_GROUPS,
  type DlpProfile,
  type ModelGroup,
  type PatternGroup,
} from "./patterns.js";
import type { TenantDlpSettings } from "../tenant/settings.js";
import { detectorEnabled } from "./detector-config.js";

/** Name, address and date-of-birth detection needs the language model detector. */
export function activeProfileGroups(profile: DlpProfile): PatternGroup[] {
  const enabled = detectorEnabled();
  return PROFILE_GROUPS[profile].filter(
    (group) => enabled || !MODEL_GROUPS.includes(group as ModelGroup),
  );
}

export const GROUP_LABELS: Record<PatternGroup, string> = {
  email: "Email addresses",
  phone: "Phone numbers",
  payment_card: "Payment card numbers",
  account_number: "Account and reference numbers",
  iban: "IBAN bank identifiers",
  national_id: "National / tax identifiers",
  ipv4: "Internal IPv4 addresses",
  api_secrets: "API keys and secret tokens",
  person: "Names",
  address: "Postal addresses",
  date_of_birth: "Dates of birth",
};

const PROFILE_META: Record<
  DlpProfile,
  { label: string; description: string }
> = {
  standard: {
    label: "Standard",
    description: "Contact details such as email and phone.",
  },
  financial: {
    label: "Financial institution",
    description:
      "Contact details, payment cards, IBAN, national identifiers, and API keys.",
  },
  strict: {
    label: "Strict",
    description: "Everything in Financial, plus internal network addresses.",
  },
};

export type WorkspaceDlpPublicSummary = {
  profile: DlpProfile;
  profileLabel: string;
  profileDescription: string;
  categories: { id: PatternGroup; label: string }[];
  customTermCount: number;
  customPatternCount: number;
  usesCustomRules: boolean;
  method: "pattern_rules";
  memberNote: string;
  rehydrationNote: string;
};

export function buildWorkspaceDlpPublicSummary(
  dlp: TenantDlpSettings,
): WorkspaceDlpPublicSummary {
  const profile = dlp.profile;
  const meta = PROFILE_META[profile];
  const groups = activeProfileGroups(profile);
  const customTermCount = (dlp.customTerms ?? []).filter(Boolean).length;
  const customPatternCount = (dlp.customPatterns ?? []).filter(
    (p) => p.enabled,
  ).length;
  const usesCustomRules = customTermCount > 0 || customPatternCount > 0;
  let memberNote =
    "Personal and banking details are hidden before your message is sent to the AI.";
  if (usesCustomRules) {
    memberNote += " Your organization has added its own confidential words.";
  }
  const rehydrationNote =
    "Private details are replaced with placeholders like [EMAIL_1] before sending, then put back in the reply.";
  return {
    profile,
    profileLabel: meta.label,
    profileDescription: meta.description,
    categories: groups.map((id) => ({ id, label: GROUP_LABELS[id] })),
    customTermCount,
    customPatternCount,
    usesCustomRules,
    method: "pattern_rules",
    memberNote,
    rehydrationNote,
  };
}
