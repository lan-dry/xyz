/**
 * Non-identifying facts about withheld values, computed locally and given to the
 * model so it can reason about a value without seeing it ("card ending 1111",
 * "Cameroon mobile number", "IBAN checksum invalid"). Nothing here may let the
 * model rebuild the value: no digits beyond a card's last four (PCI DSS display
 * rule), no email local part, no identity number digits.
 */

export type HintContext = {
  /** Email domains of the organization's own members, learned from sign-ins. */
  orgDomains?: string[];
};

const FREE_WEBMAIL =
  /^(?:(?:yahoo|hotmail|outlook|live|gmx|yandex)\.(?:[a-z]{2,3}|co\.[a-z]{2}|com\.[a-z]{2})|gmail\.com|googlemail\.com|ymail\.com|msn\.com|icloud\.com|me\.com|aol\.com|proton\.me|protonmail\.com|mail\.ru|zoho\.com|orange\.fr|laposte\.net|free\.fr|sfr\.fr|wanadoo\.fr)$/i;

export function isFreeWebmailDomain(domain: string): boolean {
  return FREE_WEBMAIL.test(domain);
}

const COUNTRIES_BY_DIAL_CODE: Record<string, string> = {
  "1": "United States or Canada",
  "27": "South Africa",
  "32": "Belgium",
  "33": "France",
  "34": "Spain",
  "39": "Italy",
  "41": "Switzerland",
  "44": "United Kingdom",
  "49": "Germany",
  "86": "China",
  "212": "Morocco",
  "213": "Algeria",
  "216": "Tunisia",
  "221": "Senegal",
  "223": "Mali",
  "225": "Côte d'Ivoire",
  "226": "Burkina Faso",
  "227": "Niger",
  "228": "Togo",
  "229": "Benin",
  "233": "Ghana",
  "234": "Nigeria",
  "235": "Chad",
  "236": "Central African Republic",
  "237": "Cameroon",
  "240": "Equatorial Guinea",
  "241": "Gabon",
  "242": "Republic of the Congo",
  "243": "DR Congo",
  "250": "Rwanda",
  "254": "Kenya",
  "971": "United Arab Emirates",
};

const COUNTRIES_BY_ISO: Record<string, string> = {
  BE: "Belgium",
  BF: "Burkina Faso",
  BJ: "Benin",
  CF: "Central African Republic",
  CG: "Republic of the Congo",
  CH: "Switzerland",
  CI: "Côte d'Ivoire",
  CM: "Cameroon",
  DE: "Germany",
  DZ: "Algeria",
  ES: "Spain",
  FR: "France",
  GA: "Gabon",
  GB: "United Kingdom",
  GQ: "Equatorial Guinea",
  IT: "Italy",
  LU: "Luxembourg",
  MA: "Morocco",
  ML: "Mali",
  NE: "Niger",
  NL: "Netherlands",
  PT: "Portugal",
  RW: "Rwanda",
  SN: "Senegal",
  TD: "Chad",
  TG: "Togo",
  TN: "Tunisia",
};

function emailHint(value: string, ctx: HintContext): string {
  const domain = value.slice(value.lastIndexOf("@") + 1).toLowerCase();
  const own = (ctx.orgDomains ?? []).some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
  if (own) {
    return "email address at your own organization's domain";
  }
  if (isFreeWebmailDomain(domain)) {
    return "personal email address (free webmail)";
  }
  return "email address at another organization";
}

function phoneHint(value: string): string {
  const compact = value.replace(/[^\d+]/g, "");
  const international = compact.startsWith("+")
    ? compact.slice(1)
    : compact.startsWith("00")
      ? compact.slice(2)
      : null;
  if (international === null) {
    return "phone number written without a country code";
  }
  for (const len of [3, 2, 1]) {
    const code = international.slice(0, len);
    const country = COUNTRIES_BY_DIAL_CODE[code];
    if (!country) {
      continue;
    }
    const national = international.slice(len);
    let kind = "phone number";
    if (code === "250") {
      // Rwanda: 07x mobile, 02x landline (national format drops the leading 0).
      kind = national.startsWith("7")
        ? "mobile number"
        : national.startsWith("2")
          ? "landline number"
          : kind;
    } else if (code === "237") {
      kind = national.startsWith("6")
        ? "mobile number"
        : national.startsWith("2")
          ? "landline number"
          : kind;
    } else if (code === "33") {
      kind = /^[67]/.test(national) ? "mobile number" : "landline number";
    }
    return `${country} ${kind} (+${code})`;
  }
  return "international phone number";
}

function cardBrand(digits: string): string {
  if (digits.startsWith("4")) {
    return "Visa";
  }
  const first2 = Number(digits.slice(0, 2));
  const first4 = Number(digits.slice(0, 4));
  if ((first2 >= 51 && first2 <= 55) || (first4 >= 2221 && first4 <= 2720)) {
    return "Mastercard";
  }
  if (first2 === 34 || first2 === 37) {
    return "American Express";
  }
  if (first2 === 62) {
    return "UnionPay";
  }
  if (first2 === 35) {
    return "JCB";
  }
  if (digits.startsWith("6011") || first2 === 65) {
    return "Discover";
  }
  return "Payment";
}

function cardHint(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `${cardBrand(digits)} card ending ${digits.slice(-4)}`;
}

export function ibanChecksumValid(value: string): boolean {
  const iban = value.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return false;
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const n = ch >= "A" ? ch.charCodeAt(0) - 55 : Number(ch);
    remainder = Number(`${remainder}${n}`) % 97;
  }
  return remainder === 1;
}

function ibanHint(value: string): string {
  const iso = value.replace(/[\s-]/g, "").slice(0, 2).toUpperCase();
  const country = COUNTRIES_BY_ISO[iso] ?? `country code ${iso}`;
  const check = ibanChecksumValid(value)
    ? "checksum valid"
    : "checksum INVALID (likely mistyped)";
  return `IBAN from ${country}, ${check}`;
}

function idHint(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^1\d{15}$/.test(digits)) {
    return "Rwandan national ID number";
  }
  if (/^[A-Z]\d{12}[A-Z]$/.test(value.trim())) {
    return "Cameroon tax number (NIU)";
  }
  if (/^[A-Z]{1,2}\d{6,8}[A-Z]?$/i.test(value.trim())) {
    return "passport-style document number";
  }
  return `national identity or tax number (${digits.length} digits)`;
}

function ipHint(value: string): string {
  const [a, b] = value.split(".").map(Number);
  const internal =
    a === 10 ||
    a === 127 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
  return internal ? "internal network address" : "public IP address";
}

/** Age in whole decades only, so the date itself can't be recovered. */
function dobHint(value: string, now = new Date()): string {
  const year = Number(/\b(19\d{2}|20\d{2})\b/.exec(value)?.[1]);
  if (!year) {
    return "date of birth";
  }
  const age = now.getFullYear() - year;
  if (age < 0 || age > 120) {
    return "date of birth";
  }
  if (age < 18) {
    return "date of birth (a minor)";
  }
  const decade = Math.floor(age / 10) * 10;
  return `date of birth (person in their ${decade}s)`;
}

const PLACEHOLDER = /^\[([A-Z][A-Z0-9_]*?)_\d+\]$/;

export function describePlaceholder(
  token: string,
  value: string,
  ctx: HintContext = {},
): string | null {
  const stem = PLACEHOLDER.exec(token)?.[1];
  switch (stem) {
    case "EMAIL":
      return emailHint(value, ctx);
    case "PHONE":
      return phoneHint(value);
    case "CARD":
      return cardHint(value);
    case "IBAN":
      return ibanHint(value);
    case "ACCOUNT":
      return `account or reference number (${value.replace(/\D/g, "").length} digits)`;
    case "ID":
      return idHint(value);
    case "IP":
      return ipHint(value);
    case "SECRET":
      return "API key or secret";
    case "PASSWORD":
      return "password";
    case "CVV":
      return "card security code";
    case "EXPIRY":
      return "card expiry date";
    case "NAME":
      return "person's name";
    case "ADDRESS":
      return "postal or street address";
    case "DOB":
      return dobHint(value);
    default:
      return null;
  }
}

/** One line per placeholder in the vault, ready for the model's instructions. */
export function buildPlaceholderHints(
  vault: Record<string, string>,
  ctx: HintContext = {},
): string[] {
  const lines: string[] = [];
  for (const [token, value] of Object.entries(vault)) {
    const hint = describePlaceholder(token, value, ctx);
    if (hint) {
      lines.push(`- ${token}: ${hint}`);
    }
  }
  return lines;
}
