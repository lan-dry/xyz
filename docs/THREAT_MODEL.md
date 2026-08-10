# Threat model — Salanor (living document)

**Version:** 0.1 DRAFT

This document evolves with phases (see **IMPLEMENTATION_PLAN.md** gates).

---

## 1. Asset inventory

| Asset | Criticality |
|-------|-------------|
| APS-1 private signing keys | Catastrophic |
| Customer API secrets (hashes) | High |
| Event ledger integrity | Critical |
| Contact & careers PII | Medium |
| Research MDX authenticity | Medium |

---

## 2. Adversary classes

| Class | Capability |
|-------|-------------|
| A1 Anonymous abuser | Form spam / scraping |
| A2 Tenant user | Scoped API misuse |
| A3 Rogue insider customer | Erase forward-only keys only |
| A4 Rogue Salanor employee | Abuse admin paths |
| A5 External attacker SSRF/RCE | Infra intrusion |

Mitigations enumerated per phase in SECURITY runbooks (**to be authored P1/P3**).

---

## STRIDE placeholders

Table to elaborate P1+: Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation — map controls.

---

## Review cadence

Quarterly baseline; major architecture ADR triggers diff review.
