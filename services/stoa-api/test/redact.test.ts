import { describe, expect, it } from "vitest";
import { redactPrompt } from "../src/dlp/redact.js";
import { mergeVaults, rehydrateText } from "../src/dlp/rehydrate.js";
import {
  buildPlaceholderHints,
  describePlaceholder,
} from "../src/dlp/placeholder-hints.js";

describe("redactPrompt", () => {
  it("masks email addresses with a numbered placeholder", () => {
    const result = redactPrompt("Contact client@firm.com today", {
      profile: "standard",
    });
    expect(result.text).toBe("Contact [EMAIL_1] today");
    expect(result.vault).toEqual({ "[EMAIL_1]": "client@firm.com" });
    expect(result.redactionCount).toBe(1);
    expect(result.manifest).toEqual([
      { group: "email", label: "Email addresses", count: 1 },
    ]);
  });

  it("applies financial profile to card-like numbers", () => {
    const result = redactPrompt("Card 4111 1111 1111 1111", {
      profile: "financial",
    });
    expect(result.text).toBe("Card [CARD_1]");
    expect(result.vault["[CARD_1]"]).toBe("4111 1111 1111 1111");
  });

  it("reuses placeholders for repeated values and numbers new ones", () => {
    const result = redactPrompt(
      "a@x.com, b@y.com, then A@x.com again",
      { profile: "standard" },
    );
    expect(result.text).toBe("[EMAIL_1], [EMAIL_2], then [EMAIL_1] again");
    expect(result.redactionCount).toBe(3);
  });

  it("keeps placeholders stable across conversation turns", () => {
    const first = redactPrompt("Mail me at jane@corp.com", { profile: "standard" });
    const second = redactPrompt("Also cc bob@corp.com and jane@corp.com", {
      profile: "standard",
      priorVault: first.vault,
    });
    expect(second.text).toBe("Also cc [EMAIL_2] and [EMAIL_1]");
    expect(second.vault).toEqual({
      "[EMAIL_2]": "bob@corp.com",
      "[EMAIL_1]": "jane@corp.com",
    });
  });

  it("does not re-redact its own placeholders with custom terms", () => {
    const result = redactPrompt("Write to jane@corp.com about Acme", {
      profile: "standard",
      customTerms: ["Acme", "EMAIL"],
    });
    expect(result.text).toBe("Write to [EMAIL_1] about [TERM_1]");
  });

  it("derives custom pattern placeholders from the admin token", () => {
    const result = redactPrompt("Matter MAT-2024-1847 is urgent", {
      profile: "standard",
      customPatterns: [
        { id: "m", label: "Matter", regex: "MAT-\\d{4}-\\d{4}", token: "[REDACTED_MATTER]", enabled: true },
      ],
    });
    expect(result.text).toBe("Matter [MATTER_1] is urgent");
  });
});

describe("banking message (financial profile)", () => {
  const message = `Bonjour, aide-moi à rédiger un e-mail au client M. Paul Ndongo (paul.ndongo@gmail.com, +237 677 45 12 89) pour confirmer que le virement de 2 500 000 FCFA vers son compte CM21 1000 5000 0101 2345 6789 012 a été exécuté le 14/10/2026, référence TRX-20261014-55821.
Sa carte Visa 4111 1111 1111 1111 a été bloquée par précaution.
Solde après opération : 12 450 750 FCFA. Taux appliqué : 7,5 % sur 36 mois.
Pour toute question : service client 8200. CNI du client : 112233445.`;
  const result = redactPrompt(message, { profile: "financial" });

  it("never sends any fragment of the sensitive values upstream", () => {
    for (const fragment of [
      "paul.ndongo",
      "677 45 12 89",
      "CM21",
      "6789 012",
      "4111",
      "55821",
      "112233445",
    ]) {
      expect(result.text).not.toContain(fragment);
    }
  });

  it("labels each value with the right category", () => {
    expect(result.vault).toMatchObject({
      "[EMAIL_1]": "paul.ndongo@gmail.com",
      "[PHONE_1]": "+237 677 45 12 89",
      "[IBAN_1]": "CM21 1000 5000 0101 2345 6789 012",
      "[CARD_1]": "4111 1111 1111 1111",
      "[ID_1]": "112233445",
    });
  });

  it("leaves amounts, dates, rates and short codes readable for the model", () => {
    for (const kept of ["2 500 000 FCFA", "12 450 750 FCFA", "14/10/2026", "7,5 %", "8200"]) {
      expect(result.text).toContain(kept);
    }
  });

  it("treats a 16-digit number that fails the card checksum as an account number", () => {
    const r = redactPrompt("Compte 1234 5678 9012 3456", { profile: "financial" });
    expect(r.text).toBe("Compte [ACCOUNT_1]");
  });
});

describe("rehydrateText", () => {
  const vault = {
    "[EMAIL_1]": "jane@corp.com",
    "[PHONE_1]": "+237 699 123 456",
    "[EMAIL_10]": "ten@corp.com",
  };

  it("restores bracketed, escaped, spaced and bare placeholders", () => {
    const reply =
      "Write to [EMAIL_1] or \\[PHONE_1\\]. Backup: [ EMAIL_10 ]. Bare: EMAIL_1.";
    expect(rehydrateText(reply, vault)).toBe(
      "Write to jane@corp.com or +237 699 123 456. Backup: ten@corp.com. Bare: jane@corp.com.",
    );
  });

  it("leaves unknown placeholders and similar words untouched", () => {
    expect(rehydrateText("[EMAIL_3] and MY_EMAIL_1x", vault)).toBe(
      "[EMAIL_3] and MY_EMAIL_1x",
    );
  });

  it("round-trips a drafted email so it can be copied as-is", () => {
    const user = redactPrompt(
      "Draft an email to a client. My contact is landry@salanor.com and my line is +237 699 123 456.",
      { profile: "financial" },
    );
    expect(user.text).not.toContain("landry@salanor.com");
    expect(user.text).not.toContain("699 123 456");

    const modelReply = `Dear client,\n\nFeel free to reach me at [EMAIL_1] or call [PHONE_1].\n\nBest regards`;
    const restored = rehydrateText(modelReply, mergeVaults([user.vault]));
    expect(restored).toBe(
      "Dear client,\n\nFeel free to reach me at landry@salanor.com or call +237 699 123 456.\n\nBest regards",
    );
  });
});

describe("account number labelling", () => {
  it("labels a long account number as an account even if its tail passes Luhn", () => {
    const result = redactPrompt(
      "Carte 4111 1111 1111 1111. Compte 10005 00001 12345678901.",
      { profile: "financial" },
    );
    expect(result.text).toBe("Carte [CARD_1]. Compte [ACCOUNT_1].");
  });
});

describe("facts given to the model about hidden values", () => {
  const ctx = { orgDomains: ["afribank.cm"] };
  const hint = (token: string, value: string) => describePlaceholder(token, value, ctx);

  it("describes cards by brand and last four digits only", () => {
    expect(hint("[CARD_1]", "4111 1111 1111 1111")).toBe("Visa card ending 1111");
    expect(hint("[CARD_2]", "5500 0000 0000 0004")).toBe("Mastercard card ending 0004");
  });

  it("describes phones by country and line type", () => {
    expect(hint("[PHONE_1]", "+237 677 45 12 89")).toBe("Cameroon mobile number (+237)");
    expect(hint("[PHONE_2]", "+237 222 23 40 00")).toBe("Cameroon landline number (+237)");
    expect(hint("[PHONE_3]", "677451289")).toBe("phone number written without a country code");
  });

  it("validates IBAN checksums without revealing the IBAN", () => {
    expect(hint("[IBAN_1]", "FR76 3000 6000 0112 3456 7890 189")).toBe(
      "IBAN from France, checksum valid",
    );
    expect(hint("[IBAN_2]", "FR76 3000 6000 0112 3456 7890 188")).toBe(
      "IBAN from France, checksum INVALID (likely mistyped)",
    );
  });

  it("recognizes the organization's own addresses automatically", () => {
    expect(hint("[EMAIL_1]", "reclamations@afribank.cm")).toBe(
      "email address at your own organization's domain",
    );
    expect(hint("[EMAIL_2]", "ops@mail.afribank.cm")).toBe(
      "email address at your own organization's domain",
    );
    expect(hint("[EMAIL_3]", "aicha.mbarga@yahoo.fr")).toBe(
      "personal email address (free webmail)",
    );
    expect(hint("[EMAIL_4]", "fraud@afribank.cm.evil.io")).toBe(
      "email address at another organization",
    );
  });

  it("never includes identifying parts of the value", () => {
    const vault = {
      "[EMAIL_1]": "aicha.mbarga@yahoo.fr",
      "[PHONE_1]": "+237 677 45 12 89",
      "[ID_1]": "114587236",
      "[ACCOUNT_1]": "10005 00012 04587123301",
      "[IBAN_1]": "CM21 1003 3050 0102 3456 7890 145",
      "[CARD_1]": "4111 1111 1111 1111",
    };
    const text = buildPlaceholderHints(vault, ctx).join("\n");
    for (const fragment of ["aicha", "mbarga", "677", "114587236", "10005", "04587123301", "3456"]) {
      expect(text).not.toContain(fragment);
    }
  });

  it("gives an age bracket for a date of birth, never the date", () => {
    const hint = describePlaceholder("[DOB_1]", "14/03/1986") ?? "";
    expect(hint).toMatch(/^date of birth \(person in their \d0s\)$/);
    expect(hint).not.toContain("1986");
  });
});

describe("banking patterns", () => {
  const financial = { profile: "financial" as const };

  it("hides Rwandan national ID numbers", () => {
    const r = redactPrompt("National ID 1199880012345678 on file.", financial);
    expect(r.text).toBe("National ID [ID_1] on file.");
    expect(describePlaceholder("[ID_1]", "1199880012345678")).toBe(
      "Rwandan national ID number",
    );
  });

  it("hides Cameroon NIU tax numbers", () => {
    const r = redactPrompt("Le NIU est M041200012345X.", financial);
    expect(r.text).toBe("Le NIU est [ID_1].");
    expect(describePlaceholder("[ID_1]", "M041200012345X")).toBe("Cameroon tax number (NIU)");
  });

  it("keeps RWF amounts visible", () => {
    const r = redactPrompt("Turnover 380 000 000 RWF this year.", financial);
    expect(r.text).toContain("380 000 000 RWF");
  });

  it("hides card security codes and expiry dates but not other dates", () => {
    const r = redactPrompt("Visa 4012 8888 8888 1881, exp 09/28, CVV 123. Échéance le 31/12/2026.", financial);
    expect(r.text).toBe("Visa [CARD_1], exp [EXPIRY_1], [CVV_1]. Échéance le 31/12/2026.");
  });

  it("hides passwords but not ordinary words after 'mot de passe'", () => {
    expect(redactPrompt("le mot de passe provisoire Banque2026!. Merci", financial).text).toBe(
      "le mot de passe provisoire [PASSWORD_1]. Merci",
    );
    expect(redactPrompt("Le mot de passe est oublié.", financial).text).toBe(
      "Le mot de passe est oublié.",
    );
  });

  it("hides live API keys", () => {
    expect(redactPrompt("key sk-live-8f3K2mQ9xT7vB4nR1pW6zY0cL5 ok", financial).text).toBe(
      "key [SECRET_1] ok",
    );
  });
});

describe("detector spans", () => {
  const financial = { profile: "financial" as const };

  it("hides names found by the model and every repeat of them", () => {
    const text = "Mme Aïcha Mbarga a appelé. Rappeler aïcha mbarga demain.";
    const r = redactPrompt(text, {
      ...financial,
      detected: [{ start: 4, end: 16, group: "person" }],
    });
    expect(r.text).toBe("Mme [NAME_1] a appelé. Rappeler [NAME_1] demain.");
    expect(r.vault["[NAME_1]"]).toBe("Aïcha Mbarga");
  });

  it("lets a pattern name the placeholder when it overlaps a model span", () => {
    const text = "Tél : 699 12 34 56";
    const r = redactPrompt(text, {
      ...financial,
      detected: [{ start: 6, end: 18, group: "address" }],
    });
    expect(r.text).toBe("Tél : [PHONE_1]");
  });

  it("ignores model groups outside the profile", () => {
    const r = redactPrompt("Rue Joss, Douala", {
      profile: "standard",
      detected: [{ start: 0, end: 16, group: "address" }],
    });
    expect(r.text).toBe("Rue Joss, Douala");
  });

  it("trims punctuation the model includes at span edges", () => {
    const text = "Client : « Paul Din », agence Akwa";
    const r = redactPrompt(text, {
      ...financial,
      detected: [{ start: 9, end: 20, group: "person" }],
    });
    expect(r.text).toBe("Client : « [NAME_1] », agence Akwa");
  });
});
