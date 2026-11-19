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
  /**
   * Fields bound into the decision token (Stage 3). Empty / omitted → no token.
   * Typical: amount, currency, beneficiary_account, product.
   */
  executable_params?: string[];
  /** observe (default) = token issued but executor not required; enforce = must confirm. */
  execution_control?: "observe" | "enforce";
  /** When Aegis cannot be reached for confirm (enforce). Default allow_and_flag. */
  on_aegis_unavailable?: "allow_and_flag" | "block";
  /** Bound into the token; default loan.disburse. */
  action_type?: string;
  /** Token lifetime in seconds; default 3600. */
  token_ttl_sec?: number;
  /** Stage 4: minimum evidence grade (G1/G2/G3). */
  required_grade?: "G1" | "G2" | "G3" | null;
  /** When still below required_grade past the deadline. Default await. */
  on_missing?: "await" | "exception";
  /** Hours after case creation before flagging below_required_grade. Default 24. */
  grade_deadline_hours?: number;
};

/** Optional display strings — configuration, never engine defaults. */
export type PackLabels = {
  rule_titles?: Record<string, string>;
  role_labels?: Record<string, string>;
  product_labels?: Record<string, string>;
  event_type_labels?: Record<string, string>;
};

/** Segment × product rolling limits (Aegis-reported activity only). */
export type PackSegmentProductLimit = {
  segment: string;
  product: string;
  label: string;
  window_hours: number;
  max_amount?: number;
  max_count?: number;
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
  /** Optional segment × product daily/rolling limits. */
  segment_product_limits?: PackSegmentProductLimit[];
};
