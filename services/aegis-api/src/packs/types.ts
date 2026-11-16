/**
 * Replaceable policy packs — tenant configuration, not engine defaults.
 * Demo packs must set demo_only: true.
 */

export type PackRole = {
  role_key: string;
  display_name: string;
  level: number;
};

export type PackMatrixRow = {
  matrix_id?: string;
  product: string;
  amount_min: number;
  amount_max: number | null;
  currency: string;
  risk_tier: string | null;
  required_role: string | null;
  outcome: "allow" | "hold" | "stop";
  rule_code: string | null;
  active?: boolean;
};

export type PackFieldPolicy = {
  field_path: string;
  mode: "store" | "mask" | "hash" | "evaluate_only" | "omit";
  mask_keep_last?: number;
};

export type PackRule = {
  rule_id: string;
  tool_pattern: string;
  decision: "allow" | "deny" | "allow_with_obligation";
  priority: number;
  conditions?: Record<string, unknown>;
  obligations?: unknown;
};

export type PackWorkflow = {
  name: string;
  product: string;
  record_only?: boolean;
  on_unreachable?: "hold" | "proceed_and_flag";
};

/** Optional display strings — configuration, never engine defaults. */
export type PackLabels = {
  rule_titles?: Record<string, string>;
  role_labels?: Record<string, string>;
  product_labels?: Record<string, string>;
  event_type_labels?: Record<string, string>;
};

export type PolicyPack = {
  /** Pack id, e.g. demo.banking, demo.insurance */
  id: string;
  /** Human label */
  name: string;
  /** Must be true for illustrative seed data shipped with the product. */
  demo_only: boolean;
  /** Sector label for docs only (banking | insurance | fintech | custom). */
  sector: string;
  version: number;
  combine: "top_priority" | "all_matching";
  roles: PackRole[];
  authority_matrix: PackMatrixRow[];
  field_policies: PackFieldPolicy[];
  rules: PackRule[];
  workflows: PackWorkflow[];
  /** Currencies used by this pack's products — configuration, not engine default. */
  currencies: string[];
  /** Plain-language titles for rules/roles/products (optional). */
  labels?: PackLabels;
};
