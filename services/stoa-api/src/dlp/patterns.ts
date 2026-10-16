export type PatternGroup =
  | "email"
  | "phone"
  | "payment_card"
  | "account_number"
  | "iban"
  | "national_id"
  | "ipv4"
  | "api_secrets"
  | ModelGroup;

/** Found by the language model detector, not by patterns. */
export type ModelGroup = "person" | "address" | "date_of_birth";

export const MODEL_GROUPS: ModelGroup[] = ["person", "address", "date_of_birth"];

export const MODEL_PLACEHOLDERS: Record<ModelGroup, string> = {
  person: "NAME",
  address: "ADDRESS",
  date_of_birth: "DOB",
};

export type RedactionPattern = {
  group: PatternGroup;
  regex: RegExp;
  /** Placeholder stem sent upstream, e.g. EMAIL → [EMAIL_1]. */
  placeholder: string;
  /** Wins over overlapping matches of lower priority. */
  priority: number;
  minDigits?: number;
  maxDigits?: number;
  /** Extra check on the matched text (checksums, shape). */
  validate?: (match: string) => boolean;
  /** Words shortly before the match that confirm this category, e.g. "CNI" for IDs. */
  context?: RegExp;
  /** Skip numbers written as money, e.g. "125 000 000 FCFA". */
  skipAmounts?: boolean;
};

export function luhnValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) {
        d -= 9;
      }
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

const DIGIT_RUN = /(?:\+|\b)\d(?:[ .()-]{0,2}\d){8,15}\b/g;

export const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    group: "email",
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    placeholder: "EMAIL",
    priority: 100,
  },
  {
    group: "api_secrets",
    regex: /\b(?:sk|pk|rk|apikey)[-_](?:(?:live|test|prod)[-_])?[A-Za-z0-9]{20,}\b/gi,
    placeholder: "SECRET",
    priority: 95,
  },
  {
    group: "api_secrets",
    regex:
      /(?<=\b(?:mot de passe|password|passcode|pwd|mdp)(?:\s+(?:provisoire|temporaire|temporary|actuel|current|is|est))?\s*:?\s*)\S+?(?=[.,;:]?(?:\s|$))/gi,
    placeholder: "PASSWORD",
    priority: 95,
    // Ordinary words after "mot de passe" ("est oublié") are not passwords.
    validate: (m) => m.length >= 4 && (/\d/.test(m) || /[^\p{L}]/u.test(m)),
  },
  {
    group: "payment_card",
    regex: /\b(?:CVV2?|CVC2?|CSC|cryptogramme)\s*:?\s*\d{3,4}\b/gi,
    placeholder: "CVV",
    priority: 95,
  },
  {
    group: "payment_card",
    regex: /(?<=\b(?:exp(?:iry)?|valid thru|val\.?)\.?\s*:?\s*)(?:0[1-9]|1[0-2])\/\d{2}\b/gi,
    placeholder: "EXPIRY",
    priority: 95,
  },
  {
    group: "national_id",
    // Rwandan national ID: 16 digits starting with 1.
    regex: /\b1\d{15}\b/g,
    placeholder: "ID",
    priority: 92,
    context:
      /(national\s*id|nid|carte\s*d['']?identit|identity|id\s*(?:card|no|number|n°)|cni)/i,
  },
  {
    group: "national_id",
    // Cameroon tax number (NIU): letter, 12 digits, letter.
    regex: /\b[A-Z]\d{12}[A-Z]\b/g,
    placeholder: "ID",
    priority: 90,
  },
  {
    group: "iban",
    regex: /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){2,7}(?:[ -]?[A-Z0-9]{1,4})?\b/gi,
    placeholder: "IBAN",
    priority: 90,
    validate: (m) => {
      const compact = m.replace(/[ -]/g, "");
      return compact.length >= 15 && compact.length <= 34 && /\d{8}/.test(compact.replace(/[A-Z]/gi, ""));
    },
    context: /(iban|bic|swift|virement|transfer|compte|account|\brib\b|b[ée]n[ée]ficiaire|beneficiary)/i,
  },
  {
    group: "payment_card",
    // Must start a number: the tail of a longer account number can pass Luhn by chance.
    regex: /(?<!\d[ -]?)\b\d(?:[ -]?\d){12,18}\b/g,
    placeholder: "CARD",
    priority: 85,
    validate: luhnValid,
    context: /(carte|card|visa|mastercard|\bcb\b)/i,
    skipAmounts: true,
  },
  {
    group: "account_number",
    regex: /(?<![+\d])\b\d(?:[ -]?\d){9,29}\b/g,
    placeholder: "ACCOUNT",
    priority: 80,
    minDigits: 10,
    context:
      /(compte|account|acct|a\/c|\brib\b|\bref\b|r[ée]f[ée]rence|dossier|contrat|contract|loan|pr[êe]t|b[ée]n[ée]ficiaire|beneficiary)/i,
    skipAmounts: true,
  },
  {
    group: "phone",
    regex: DIGIT_RUN,
    placeholder: "PHONE",
    priority: 76,
    minDigits: 9,
    maxDigits: 15,
    context: /(t[ée]l|phone|mobile|portable|whatsapp|appel|call|ligne|line|num[ée]ro|contact)/i,
    skipAmounts: true,
  },
  {
    group: "national_id",
    regex:
      /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b|\b\d{9,15}\b|\b[A-Z]{1,2}\d{6,8}[A-Z]?\b/g,
    placeholder: "ID",
    priority: 75,
    validate: (m) => m.replace(/\D/g, "").length >= 9 || /^[A-Z]{1,2}\d{6,8}[A-Z]?$/.test(m),
    context: /(cni|nin|niu|nif|ssn|nas|passport|passeport|identit|id\s*(?:card|no|number|n°)|tax|fiscal)/i,
    skipAmounts: true,
  },
  {
    group: "ipv4",
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    placeholder: "IP",
    priority: 60,
  },
];

export type DlpProfile = "standard" | "financial" | "strict";

export const PROFILE_GROUPS: Record<DlpProfile, PatternGroup[]> = {
  standard: ["email", "phone", "person"],
  financial: [
    "email",
    "phone",
    "payment_card",
    "account_number",
    "iban",
    "national_id",
    "ipv4",
    "api_secrets",
    "person",
    "address",
    "date_of_birth",
  ],
  strict: [
    "email",
    "phone",
    "payment_card",
    "account_number",
    "iban",
    "national_id",
    "ipv4",
    "api_secrets",
    "person",
    "address",
    "date_of_birth",
  ],
};
