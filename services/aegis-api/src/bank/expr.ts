/**
 * Attribute-driven condition expressions for bank rules.
 * Supports and / or / not, comparisons, lists, exists, and attribute math
 * (e.g. amount > 3 * customer.avg_payment_90d).
 */

export type AttrBag = Record<string, unknown>;

export type Expr =
  | { and: Expr[] }
  | { or: Expr[] }
  | { not: Expr }
  | { exists: string }
  | { eq: [string | number | boolean | null, string | number | boolean | null] }
  | { ne: [string | number | boolean | null, string | number | boolean | null] }
  | { gt: [string | number, string | number] }
  | { gte: [string | number, string | number] }
  | { lt: [string | number, string | number] }
  | { lte: [string | number, string | number] }
  | { in: [string, Array<string | number | boolean>] }
  | { nin: [string, Array<string | number | boolean>] }
  | { contains: [string, string | number | boolean] }
  /** Left and right are numeric paths or literals; ops: +, -, *, / */
  | { math: { left: MathTerm; op: ">" | ">=" | "<" | "<=" | "==" | "!="; right: MathTerm } };

export type MathTerm =
  | number
  | string
  | { path: string }
  | { mul: [MathTerm, MathTerm] }
  | { add: [MathTerm, MathTerm] }
  | { sub: [MathTerm, MathTerm] }
  | { div: [MathTerm, MathTerm] };

export function getPath(attrs: AttrBag, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split(".");
  let cur: unknown = attrs;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function resolveOperand(
  attrs: AttrBag,
  operand: string | number | boolean | null,
): unknown {
  if (typeof operand === "string" && operand.includes(".")) {
    const v = getPath(attrs, operand);
    return v === undefined ? operand : v;
  }
  if (typeof operand === "string" && Object.prototype.hasOwnProperty.call(attrs, operand)) {
    return attrs[operand];
  }
  return operand;
}

export function evalMathTerm(attrs: AttrBag, term: MathTerm): number {
  if (typeof term === "number") return term;
  if (typeof term === "string") {
    const n = asNumber(getPath(attrs, term) ?? attrs[term] ?? term);
    if (n === undefined) {
      throw new Error(`math term unresolved: ${term}`);
    }
    return n;
  }
  if ("path" in term) {
    const n = asNumber(getPath(attrs, term.path));
    if (n === undefined) throw new Error(`math path unresolved: ${term.path}`);
    return n;
  }
  if ("mul" in term) {
    return evalMathTerm(attrs, term.mul[0]) * evalMathTerm(attrs, term.mul[1]);
  }
  if ("add" in term) {
    return evalMathTerm(attrs, term.add[0]) + evalMathTerm(attrs, term.add[1]);
  }
  if ("sub" in term) {
    return evalMathTerm(attrs, term.sub[0]) - evalMathTerm(attrs, term.sub[1]);
  }
  if ("div" in term) {
    const d = evalMathTerm(attrs, term.div[1]);
    if (d === 0) throw new Error("division by zero");
    return evalMathTerm(attrs, term.div[0]) / d;
  }
  throw new Error("invalid math term");
}

export function evalExpr(attrs: AttrBag, expr: Expr): boolean {
  if ("and" in expr) {
    return expr.and.every((e) => evalExpr(attrs, e));
  }
  if ("or" in expr) {
    return expr.or.some((e) => evalExpr(attrs, e));
  }
  if ("not" in expr) {
    return !evalExpr(attrs, expr.not);
  }
  if ("exists" in expr) {
    const v = getPath(attrs, expr.exists);
    return v !== undefined && v !== null;
  }
  if ("eq" in expr) {
    const [a, b] = expr.eq;
    return resolveOperand(attrs, a) === resolveOperand(attrs, b);
  }
  if ("ne" in expr) {
    const [a, b] = expr.ne;
    return resolveOperand(attrs, a) !== resolveOperand(attrs, b);
  }
  if ("gt" in expr || "gte" in expr || "lt" in expr || "lte" in expr) {
    const pair =
      "gt" in expr
        ? expr.gt
        : "gte" in expr
          ? expr.gte
          : "lt" in expr
            ? expr.lt
            : expr.lte;
    const left = asNumber(resolveOperand(attrs, pair[0]));
    const right = asNumber(resolveOperand(attrs, pair[1]));
    if (left === undefined || right === undefined) return false;
    if ("gt" in expr) return left > right;
    if ("gte" in expr) return left >= right;
    if ("lt" in expr) return left < right;
    return left <= right;
  }
  if ("in" in expr) {
    const [path, list] = expr.in;
    const v = resolveOperand(attrs, path);
    return list.some((item) => item === v);
  }
  if ("nin" in expr) {
    const [path, list] = expr.nin;
    const v = resolveOperand(attrs, path);
    return !list.some((item) => item === v);
  }
  if ("contains" in expr) {
    const [path, item] = expr.contains;
    const v = resolveOperand(attrs, path);
    if (Array.isArray(v)) return v.includes(item);
    if (typeof v === "string" && typeof item === "string") return v.includes(item);
    return false;
  }
  if ("math" in expr) {
    let left: number;
    let right: number;
    try {
      left = evalMathTerm(attrs, expr.math.left);
      right = evalMathTerm(attrs, expr.math.right);
    } catch {
      return false;
    }
    switch (expr.math.op) {
      case ">":
        return left > right;
      case ">=":
        return left >= right;
      case "<":
        return left < right;
      case "<=":
        return left <= right;
      case "==":
        return left === right;
      case "!=":
        return left !== right;
      default:
        return false;
    }
  }
  return false;
}

/** Convenience: amount > factor * path (e.g. 3 * customer.avg_payment_90d). */
export function amountExceedsMultiple(
  attrs: AttrBag,
  amountPath: string,
  factor: number,
  avgPath: string,
): boolean {
  return evalExpr(attrs, {
    math: {
      left: { path: amountPath },
      op: ">",
      right: { mul: [factor, { path: avgPath }] },
    },
  });
}
