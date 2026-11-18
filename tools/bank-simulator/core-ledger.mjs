/**
 * Core Banking / Ledger: accounts + transactions.
 * Prefers real Postgres (BANK_CORE_DATABASE_URL); falls back to memory.
 * Disburse path confirms a decision token with Aegis before moving money,
 * and can export a JSONL / CSV feed for reconciliation.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bank_account (
  account_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RWF',
  balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bank_transaction (
  txn_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES bank_account(account_id),
  case_id TEXT,
  token_id TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'RWF',
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  status TEXT NOT NULL DEFAULT 'posted',
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_txn_case ON bank_transaction(case_id);
`;

export class CoreLedger {
  /**
   * @param {{ databaseUrl?: string, dataDir: string, confirmFn?: Function, permitFn?: Function }} opts
   */
  constructor(opts) {
    this.databaseUrl = opts.databaseUrl?.trim() || "";
    this.dataDir = opts.dataDir;
    this.confirmFn = opts.confirmFn;
    this.permitFn = opts.permitFn;
    this.pool = null;
    this.mode = "memory";
    /** @type {Map<string, { account_id: string, customer_name: string, currency: string, balance: number }>} */
    this.accounts = new Map();
    /** @type {Array<Record<string, unknown>>} */
    this.transactions = [];
    this.refused = [];
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    if (this.databaseUrl) {
      try {
        const pg = await import("pg");
        this.pool = new pg.default.Pool({ connectionString: this.databaseUrl, max: 4 });
        await this.pool.query(SCHEMA);
        const count = await this.pool.query("SELECT count(*)::int AS n FROM bank_account");
        if ((count.rows[0]?.n ?? 0) === 0) {
          await this.pool.query(
            `INSERT INTO bank_account (account_id, customer_name, currency, balance)
             VALUES ('ACCT-DEMO-001', 'Demo Customer', 'RWF', 0)
             ON CONFLICT DO NOTHING`,
          );
        }
        this.mode = "postgres";
        return;
      } catch (err) {
        console.warn(
          "[core-ledger] Postgres unavailable, using memory:",
          err instanceof Error ? err.message : err,
        );
        this.pool = null;
        this.mode = "memory";
      }
    }
    this.accounts.set("ACCT-DEMO-001", {
      account_id: "ACCT-DEMO-001",
      customer_name: "Demo Customer",
      currency: "RWF",
      balance: 0,
    });
  }

  async close() {
    if (this.pool) await this.pool.end().catch(() => {});
  }

  status() {
    return {
      mode: this.mode,
      database_configured: Boolean(this.databaseUrl),
      account_count: this.mode === "memory" ? this.accounts.size : undefined,
      transaction_count: this.mode === "memory" ? this.transactions.length : undefined,
    };
  }

  /**
   * Disburse only after Aegis confirm (preferred) or permit (legacy gate).
   * @param {{ case_id: string, action?: Record<string, unknown>, token?: unknown, skip_aegis?: boolean, force_db_bypass?: boolean }} input
   */
  async disburse(input) {
    const caseId = String(input.case_id ?? "").trim();
    const action = input.action && typeof input.action === "object" ? input.action : {};
    const amount = Number(action.amount ?? 0);
    const currency = String(action.currency ?? "RWF");
    const accountId = String(action.beneficiary_account ?? action.account_id ?? "ACCT-DEMO-001");

    if (!caseId) {
      return { status: 422, body: { ok: false, error: "case_id required", permitted: false } };
    }

    if (input.skip_aegis === true && !input.force_db_bypass) {
      const row = {
        at: new Date().toISOString(),
        case_id: caseId,
        reason: "Core ledger refuses ungated disbursement (token/confirm required)",
        code: "confirm_required",
      };
      this.refused.unshift(row);
      return { status: 403, body: { ok: false, permitted: false, ...row } };
    }

    // Insider DB bypass path (red team #6 forced): write without confirm.
    if (input.force_db_bypass === true) {
      const entry = await this.postTxn({
        case_id: caseId,
        account_id: accountId,
        amount,
        currency,
        token_id: null,
        meta: { bypass: true, note: "forced_db_write_without_token" },
      });
      return {
        status: 200,
        body: {
          ok: true,
          bypass: true,
          entry,
          warning: "Money moved without confirm — expect executed_without_receipt on reconciliation",
        },
      };
    }

    let confirmResult = null;
    if (input.token && this.confirmFn) {
      confirmResult = await this.confirmFn({
        token: input.token,
        params: {
          amount: String(action.amount ?? ""),
          currency,
          beneficiary_account: accountId,
          product: String(action.product ?? "retail_loan"),
        },
      });
      if (!confirmResult?.ok) {
        const row = {
          at: new Date().toISOString(),
          case_id: caseId,
          reason: confirmResult?.reason ?? "confirm refused",
          code: confirmResult?.code ?? "confirm_failed",
          confirm: confirmResult,
        };
        this.refused.unshift(row);
        return { status: 403, body: { ok: false, permitted: false, ...row } };
      }
    } else if (this.permitFn) {
      const permit = await this.permitFn(caseId, action);
      if (permit.status !== 200 || !permit.data?.permitted) {
        const row = {
          at: new Date().toISOString(),
          case_id: caseId,
          reason: permit.data?.reason ?? `permit HTTP ${permit.status}`,
          code: permit.data?.code ?? "denied",
          permit: permit.data ?? null,
        };
        this.refused.unshift(row);
        return { status: 403, body: { ok: false, permitted: false, ...row } };
      }
      confirmResult = { ok: true, via: "permit", permit: permit.data };
    } else {
      return {
        status: 503,
        body: { ok: false, error: "No confirm or permit path configured", permitted: false },
      };
    }

    const entry = await this.postTxn({
      case_id: caseId,
      account_id: accountId,
      amount,
      currency,
      token_id: input.token?.token_id ?? confirmResult?.token_id ?? null,
      meta: { confirm: confirmResult },
    });

    return {
      status: 200,
      body: { ok: true, permitted: true, entry, confirm: confirmResult },
    };
  }

  async postTxn({ case_id, account_id, amount, currency, token_id, meta }) {
    const txn_id = `txn_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const at = new Date().toISOString();
    const row = {
      txn_id,
      account_id,
      case_id,
      token_id,
      amount,
      currency,
      direction: "credit",
      status: "posted",
      meta: meta ?? {},
      created_at: at,
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO bank_account (account_id, customer_name, currency, balance)
         VALUES ($1, 'Demo Customer', $2, 0)
         ON CONFLICT (account_id) DO NOTHING`,
        [account_id, currency],
      );
      await this.pool.query(
        `INSERT INTO bank_transaction
           (txn_id, account_id, case_id, token_id, amount, currency, direction, status, meta)
         VALUES ($1,$2,$3,$4,$5,$6,'credit','posted',$7::jsonb)`,
        [
          txn_id,
          account_id,
          case_id,
          token_id,
          amount,
          currency,
          JSON.stringify(meta ?? {}),
        ],
      );
      await this.pool.query(
        `UPDATE bank_account SET balance = balance + $2 WHERE account_id = $1`,
        [account_id, amount],
      );
    } else {
      const acct = this.accounts.get(account_id) ?? {
        account_id,
        customer_name: "Demo Customer",
        currency,
        balance: 0,
      };
      acct.balance += Number(amount) || 0;
      this.accounts.set(account_id, acct);
      this.transactions.unshift(row);
      if (this.transactions.length > 500) this.transactions.length = 500;
    }
    return row;
  }

  /** Insider edit: change amount after the fact (red team #11 / #13). */
  async editTransactionAmount(txnId, newAmount) {
    if (this.pool) {
      const r = await this.pool.query(
        `UPDATE bank_transaction SET amount = $2, meta = meta || $3::jsonb
         WHERE txn_id = $1 RETURNING *`,
        [txnId, newAmount, JSON.stringify({ tampered: true, at: new Date().toISOString() })],
      );
      return r.rows[0] ?? null;
    }
    const row = this.transactions.find((t) => t.txn_id === txnId);
    if (!row) return null;
    row.amount = newAmount;
    row.meta = { ...(row.meta || {}), tampered: true, at: new Date().toISOString() };
    return row;
  }

  async listTransactions(limit = 40) {
    if (this.pool) {
      const r = await this.pool.query(
        `SELECT * FROM bank_transaction ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return r.rows;
    }
    return this.transactions.slice(0, limit);
  }

  /**
   * Export feed for reconciliation (JSONL + CSV).
   * @param {"jsonl"|"csv"} format
   */
  async exportFeed(format = "jsonl") {
    const rows = await this.listTransactions(10_000);
    await mkdir(this.dataDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (format === "csv") {
      const header = "txn_id,case_id,token_id,amount,currency,account_id,created_at";
      const lines = rows.map(
        (r) =>
          [
            r.txn_id,
            r.case_id ?? "",
            r.token_id ?? "",
            r.amount,
            r.currency,
            r.account_id,
            r.created_at,
          ].join(","),
      );
      const text = [header, ...lines].join("\n");
      const path = join(this.dataDir, `feed-${stamp}.csv`);
      await writeFile(path, text, "utf8");
      return { format: "csv", path, rows: rows.length, text };
    }
    const text = rows.map((r) => JSON.stringify(r)).join("\n");
    const path = join(this.dataDir, `feed-${stamp}.jsonl`);
    await writeFile(path, text, "utf8");
    return { format: "jsonl", path, rows: rows.length, text };
  }
}
