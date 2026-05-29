export type CommandEntry = {
  command: string;
  summary: string;
  details: string;
  when: string;
  prerequisites?: string;
  destructive?: boolean;
};

export type CommandSection = {
  id: string;
  title: string;
  description: string;
  commands: CommandEntry[];
};

export const ROLE_GUIDE = {
  platformRoles: {
    title: "Platform roles (Salanor internal — one per account)",
    body:
      "Each Salanor employee account has at most one platform role: superadmin, admin, or staff (NULL = customer only). Platform roles unlock Platform Ops (:3003 / ops.salanor.com). This is separate from org roles (admin, engineer, auditor, viewer) on each membership.",
    roles: [
      {
        name: "Super admin",
        slug: "superadmin",
        summary: "Full Ops access including assigning platform roles.",
      },
      {
        name: "Platform admin",
        slug: "admin",
        summary: "Provision orgs, edit plans, suspend accounts, reset passwords; grant staff/admin platform roles.",
      },
      {
        name: "Platform staff",
        slug: "staff",
        summary: "Read-only across tenants — visibility without mutations.",
      },
    ],
    grant:
      "Super admin: assign any platform role. Platform admin: assign staff/admin or remove platform role (not super admin). Changes are logged as platform.role.changed in Audit log. Seed sets dev@salanor.local to superadmin.",
    cannot:
      "Cannot demote the last super admin. Org admins cannot grant platform roles.",
  },
  orgAdmin: {
    title: "Organization admin (customer console)",
    body:
      "Each org has roles: admin, engineer, auditor, viewer. Admins invite members, revoke invites, and change any member’s role (including promoting engineer → admin) under Console → Members.",
    grant:
      "Invite with role admin, or change an existing member’s role in the members table. You cannot demote the **only** admin in an org.",
    cannot:
      "Org admins cannot grant platform roles or access other organizations.",
  },
  bootstrap: {
    title: "Bootstrap secret (automation)",
    body:
      "`PLATFORM_BOOTSTRAP_SECRET` calls `POST /v1/id/platform/*` without a browser — used by `pnpm pilot:e2e`, provision scripts, and CI. Same platform powers as staff API routes; not a human login.",
  },
} as const;

export const COMMAND_SECTIONS: CommandSection[] = [
  {
    id: "quick-start",
    title: "Quick start (first day)",
    description: "Minimal path from clone to running stack.",
    commands: [
      {
        command: "docker compose up -d",
        summary: "Start Postgres + Redis locally",
        details: "Infrastructure for API, ID, and console. Required before migrate/seed.",
        when: "First setup or after reboot when containers stopped",
      },
      {
        command: "pnpm install",
        summary: "Install monorepo dependencies",
        details: "Run from repo root. Uses pnpm workspaces.",
        when: "After clone or when package.json / lockfile changes",
      },
      {
        command: "pnpm db:migrate",
        summary: "Apply SQL migrations",
        details: "Runs `aegis-api` migration CLI against `DATABASE_URL`.",
        when: "Fresh DB or after pulling new migrations",
      },
      {
        command: "pnpm db:seed",
        summary: "Load dev accounts and sample org",
        details:
          "Idempotent seed (`tools/seed/dev.sql`). Creates dev@salanor.local, sets platform_role = superadmin, dev orgs, demo keys. **Never run in production.**",
        when: "Reset dev login or first local setup",
        destructive: true,
      },
      {
        command: "pnpm dev",
        summary: "Start all main apps in parallel",
        details:
          "Console :3000, marketing :3001, docs :3002, platform ops :3003, aegis-api :8080, id :8091, insurance-api :8092.",
        when: "Daily development",
        prerequisites: "`.env` from `.env.example`, Docker up, migrate applied",
      },
    ],
  },
  {
    id: "dev-servers",
    title: "Development — individual apps",
    description: "Run one surface when you do not need the full stack.",
    commands: [
      {
        command: "pnpm dev:console",
        summary: "Customer Aegis Console only",
        details: "Next.js on port 3000. Needs `pnpm dev:id` for login.",
        when: "UI work on console",
      },
      {
        command: "pnpm dev:platform",
        summary: "Platform Ops only",
        details: "Internal admin app on port 3003. Requires a platform role on the account.",
        when: "Ops UI or cross-tenant admin",
      },
      {
        command: "pnpm dev:docs",
        summary: "Customer docs site",
        details: "Next.js on port 3002 (`apps/web-docs`).",
        when: "Documentation changes",
      },
      {
        command: "pnpm dev:marketing",
        summary: "Marketing site",
        details: "Port 3001.",
        when: "Landing / contact form",
      },
      {
        command: "pnpm dev:id",
        summary: "Salanor ID auth service",
        details: "Port 8091. **Required for any login** (console, ops, invite flows).",
        when: "Auth bugs or always alongside console/ops",
      },
      {
        command: "pnpm --filter aegis-api dev",
        summary: "Aegis API only",
        details: "Port 8080. Ingest, policy, console API routes.",
        when: "API-only work, demos with curl/SDK",
      },
      {
        command: "pnpm dev:insurance",
        summary: "Insurance API (Aether stub)",
        details: "Port 8092.",
        when: "Insurance product experiments",
      },
      {
        command: "pnpm dev:billing",
        summary: "Billing / Stripe webhook service",
        details: "Separate service for Stripe integration testing.",
        when: "Billing or usage rollup work",
      },
    ],
  },
  {
    id: "database",
    title: "Database",
    description: "Schema and dev data. Production uses migrate only — never seed.",
    commands: [
      {
        command: "pnpm db:migrate",
        summary: "Apply pending migrations",
        details: "Forward-only schema updates on Postgres.",
        when: "Deploy pipeline or after git pull with new migrations",
      },
      {
        command: "pnpm db:migrate:down",
        summary: "Roll back one migration generation",
        details: "Development only. Can drop columns/tables.",
        when: "Local migration debugging",
        destructive: true,
      },
      {
        command: "pnpm db:seed",
        summary: "Re-seed dev data",
        details: "Resets dev password hashes and sample org. Wipes predictable dev state.",
        when: "Forgot dev password or need clean demo org",
        destructive: true,
      },
    ],
  },
  {
    id: "quality",
    title: "Lint, test, build",
    description: "CI runs these on every PR.",
    commands: [
      {
        command: "pnpm lint",
        summary: "ESLint across monorepo",
        details: "Nx run-many lint.",
        when: "Before commit / matches CI",
      },
      {
        command: "pnpm typecheck",
        summary: "TypeScript check all projects",
        details: "Nx run-many typecheck.",
        when: "Before commit",
      },
      {
        command: "pnpm test",
        summary: "All package tests",
        details: "Includes aegis-api vitest integration tests (needs Postgres).",
        when: "Regression check",
        prerequisites: "Dedicated test DB recommended",
      },
      {
        command: "pnpm build",
        summary: "Production builds",
        details: "Builds all Nx projects with build target.",
        when: "Release validation",
      },
      {
        command: "pnpm --filter aegis-api test",
        summary: "API integration tests only",
        details: "Vitest against real Postgres schema.",
        when: "API / policy / ingest changes",
      },
      {
        command: "pnpm sdk:conformance",
        summary: "Cross-language signing vectors",
        details:
          "Builds TS SDK, checks golden digest/signature, runs Go + Python tests against `sdks/conformance/vectors/`.",
        when: "After changing APS-1 canonical signing in any SDK",
        prerequisites: "Go 1.22+, Python 3.10+ on PATH (CI has both)",
      },
    ],
  },
  {
    id: "pilot-demo",
    title: "Pilot & demo",
    description: "Walkthrough scripts for investors and design partners.",
    commands: [
      {
        command: "pnpm pilot:agent",
        summary: "Run reference LLM + policy agent",
        details:
          "Builds SDK, runs `apps/pilot-agent` with Gemini. Signs events, wrapFetch demo, prints console trace URL.",
        when: "Live pilot / investor demo",
        prerequisites: "`pnpm dev`, org ingest key in `apps/pilot-agent/.env`, `pnpm pilot:ensure-policy`",
      },
      {
        command: "pnpm pilot:ensure-policy",
        summary: "Install deny Stripe policy for demo org",
        details: "Upserts pilot policy so payment tool call is denied in agent demo.",
        when: "Before first `pilot:agent` on a fresh org",
      },
      {
        command: "pnpm demo:ingest",
        summary: "Sign + ingest one APS event",
        details: "CLI via `@salanor/demo-tools`. Uses DEMO_* env vars.",
        when: "Quick proof of ingest pipeline",
        prerequisites: "aegis-api running, migrate + seed or provisioned org",
      },
      {
        command: "pnpm demo:proxy",
        summary: "SDK wrapFetch allow/deny demo",
        details: "Exercises policy evaluation before outbound HTTP.",
        when: "Policy proxy smoke test",
      },
      {
        command: "pnpm demo:full-system",
        summary: "Full pipeline demo",
        details: "Proxy, approval, witness, verifier, export, SIEM-style checks in one script.",
        when: "Deep technical demo or release gate",
        prerequisites: "Stack up, demo env vars set",
      },
      {
        command: "pnpm demo:verify-chain",
        summary: "Verify event hash chain for org",
        details: "Checks ledger integrity for demo organization.",
        when: "After ingest demos",
      },
      {
        command: "pnpm demo:verify-inclusion <event_id>",
        summary: "Verify Merkle inclusion for one event",
        details: "Needs witness roots published.",
        when: "Transparency / inclusion story",
      },
      {
        command: "pnpm verifier:public -- --org <slug> --event <id>",
        summary: "Third-party public verify (HTTP only)",
        details: "No SDK — simulates external auditor calling public API.",
        when: "Prove verify endpoint to partners",
      },
    ],
  },
  {
    id: "pilot-gates",
    title: "Pilot release gates",
    description: "Automated checks before a partner release.",
    commands: [
      {
        command: "pnpm pilot:e2e",
        summary: "Partner onboarding E2E",
        details:
          "Provision org via platform API, login, ingest — full script (`tools/scripts/e2e-onboarding.mjs`).",
        when: "Pre-release / CI",
        prerequisites: "aegis-api + id running, `PLATFORM_BOOTSTRAP_SECRET`",
      },
      {
        command: "pnpm pilot:phase-a",
        summary: "Phase A API smoke",
        details: "Health, console routes, basic API sanity.",
        when: "Quick regression with stack up",
      },
      {
        command: "pnpm pilot:plan-limit",
        summary: "Verify plan limit 402 behavior",
        details: "Ensures usage limits return expected billing errors.",
        when: "Plan enforcement changes",
      },
      {
        command: "pnpm pilot:reset",
        summary: "Reset pilot demo state",
        details: "Scripted cleanup for repeated demos (see script for scope).",
        when: "Between demo runs",
        destructive: true,
      },
    ],
  },
  {
    id: "witness",
    title: "Witness & transparency",
    description: "Merkle batching and public transparency log.",
    commands: [
      {
        command: "pnpm witness:batch",
        summary: "Batch events into merkle roots",
        details: "Runs `aegis-signer` batch job against Postgres event hashes.",
        when: "Scheduled ops or after demo ingest volume",
      },
      {
        command: "pnpm transparency:publish",
        summary: "Publish witness proofs to transparency log",
        details: "Appends inclusion proofs for published roots.",
        when: "After witness batch, before public verify demo",
      },
    ],
  },
  {
    id: "compliance",
    title: "Compliance exports",
    description: "ZIP bundles for auditors. Console creates jobs; these commands process them.",
    commands: [
      {
        command: "pnpm compliance:worker",
        summary: "Process pending exports + due schedules",
        details:
          "Builds ZIPs (events, policies, SOC mapping). Console toggle alone does not run this — schedule via cron in production.",
        when: "Daily ops cron or after admin requests export",
      },
      {
        command: "pnpm compliance:schedule",
        summary: "Run monthly schedules only",
        details: "Creates export for previous calendar month when `next_run_at` is due.",
        when: "Split cron from worker if desired",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing & usage",
    description: "Stripe and usage rollup (when billing service enabled).",
    commands: [
      {
        command: "pnpm billing:usage-backfill",
        summary: "Recompute usage rollups",
        details: "Backfill job for org usage counters / billing alignment.",
        when: "After billing bugs or migration",
      },
    ],
  },
  {
    id: "dev-utils",
    title: "Developer utilities",
    description: "Local-only helpers — not for production.",
    commands: [
      {
        command: "pnpm dev:delete-accounts -- email@example.com",
        summary: "Delete test accounts by email",
        details: "Removes account row from Postgres. Optional `--purge-orgs` if sole admin.",
        when: "Clean up signup tests",
        destructive: true,
      },
      {
        command: "pnpm --filter aegis-api policy:build-wasm",
        summary: "Rebuild OPA WASM policy bundle",
        details: "Required after Rego policy changes in `services/aegis-api/policy/`.",
        when: "Policy engine / WASM changes",
      },
    ],
  },
  {
    id: "health",
    title: "Health checks (curl)",
    description: "Verify services are up.",
    commands: [
      {
        command: "curl http://127.0.0.1:8080/health",
        summary: "Aegis API health",
        details: 'Expect JSON with database status when `DATABASE_URL` set.',
        when: "After `pnpm dev` or deploy",
      },
      {
        command: "curl http://127.0.0.1:8091/health",
        summary: "Salanor ID health",
        details: "Auth service for console and Platform Ops login.",
        when: "Login failures — check ID first",
      },
      {
        command: "curl http://127.0.0.1:8092/health",
        summary: "Insurance API health",
        details: "Optional product API.",
        when: "Insurance experiments",
      },
    ],
  },
];

export const SCENARIO_CHEATSHEET = [
  {
    scenario: "First day on repo",
    steps: "docker compose up -d → pnpm install → pnpm db:migrate → pnpm db:seed → pnpm dev",
  },
  {
    scenario: "Investor demo (15 min)",
    steps: "pnpm dev → pnpm pilot:ensure-policy → pnpm pilot:agent → console trace → deny payment event",
  },
  {
    scenario: "Grant yourself Platform Ops",
    steps: "pnpm db:seed (dev@salanor.local) or SQL: platform_role = 'superadmin' → open :3003",
  },
  {
    scenario: "Promote user to org admin",
    steps: "Console → Members (as admin) → change role dropdown to admin",
  },
  {
    scenario: "Provision new pilot customer",
    steps: "Platform Ops → Provision org — or POST /v1/id/platform/provision with bootstrap secret",
  },
  {
    scenario: "Monthly auditor ZIP",
    steps: "Customer enables schedule in Console → cron pnpm compliance:schedule (or compliance:worker)",
  },
  {
    scenario: "Reset dev login password",
    steps: "pnpm db:seed (resets dev password hashes)",
  },
] as const;
