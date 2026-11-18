/**
 * Multi-system bank identity map (Stage 8).
 * Each system has its own source_id and key_id — mirrors a real bank.
 */

export const SYSTEMS = [
  {
    id: "los",
    source_id: "src_los",
    key_id: "k_los_2026_01",
    name: "Loan Origination System",
    kind: "application",
    role: "Originates loan applications; talks to Aegis through its Connector.",
  },
  {
    id: "core",
    source_id: "src_core",
    key_id: "k_core_2026_01",
    name: "Core Banking / Ledger",
    kind: "executor",
    role: "System of record. Disburses only after confirming a decision token.",
  },
  {
    id: "pay",
    source_id: "src_pay",
    key_id: "k_pay_2026_01",
    name: "Payment Gateway",
    kind: "executor",
    role: "Outbound payments (SWIFT / mobile-money stub). Confirms before send.",
  },
  {
    id: "bureau",
    source_id: "src_bureau",
    key_id: "k_bureau_2026_01",
    name: "Demo Credit Bureau",
    kind: "third_party",
    role: "Independent third party. Signs credit-score responses.",
    external: true,
    default_url: "http://127.0.0.1:4100",
  },
];

export function getSystem(id) {
  return SYSTEMS.find((s) => s.id === id || s.source_id === id) ?? null;
}
