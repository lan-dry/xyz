# Customer-asserted data (definition for counsel review)

**Status:** draft for review by counsel. Not a contract term, warranty, or legal conclusion.
Do not paste into customer agreements without counsel sign-off.

## Plain definition

**Customer-asserted data** means any field, fact, or document content that the customer's
system (or a person acting for the customer) sends into Aegis, and that Aegis records as
the source's own claim — including fields marked `asserted_by_source` on a sealed receipt.

Examples (illustrative, not exhaustive):

- Loan amount, currency, beneficiary, applicant identifiers supplied by a loan system
- A credit score that the loan system asserts without a nested third-party signature
- Narrative reasons typed by an approver that are not independently measured by Aegis

## What Aegis does with it

Aegis may seal, hash, chain, time-stamp, and grade the **record** that contains
customer-asserted data. That shows when the record was made and that it has not changed
since sealing. It does **not** mean Aegis checked that the asserted values are true,
complete, or lawful.

Where a field is instead `derived_by_aegis`, `corroborated`, `independently_captured`,
or `signed_by_third_party`, the receipt says so. Those labels still do not equal a
guarantee of real-world accuracy.

## Suggested wording direction (not legal advice)

Product and pilot materials should keep customer-asserted data distinct from:

- integrity of the sealed record (signature / hash / chain), and
- evidence grade (who vouched, and how).

Counsel should decide how this definition appears in order forms, DPAs, and liability
language. Until then, treat this file as internal product vocabulary only.

See also: [PROVENANCE.md](../PROVENANCE.md), [ASSURANCE_LADDER.md](./ASSURANCE_LADDER.md).
