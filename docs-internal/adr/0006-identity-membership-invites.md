# ADR-0006: Global account, org membership, and invitations

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Engineering  

## Context

Console identity was modeled as `user` rows scoped to a single `organization_id`. That blocks one login across multiple customer orgs, invite/accept flows, and per-org roles without duplicate accounts.

## Decision

- **`account`** — global identity (`email` unique case-insensitively).
- **`membership`** — `(account_id, organization_id, role, status)`; `membership_id` replaces console `user_id` in sessions and audit FKs.
- **`organization_invitation`** — pending invites with hashed token, expiry, and status machine (`pending` → `accepted` | `revoked` | `expired`).
- **`session`** — `account_id` + `membership_id` + active `organization_id`.
- **Salanor ID** owns login, `/auth/me`, org switch, members CRUD, invite create/accept/revoke.
- **Dev delivery:** invite links logged to the ID service terminal; optional **Resend** when `RESEND_API_KEY` is set.

Legacy `"user"` table is removed after migration `004_identity_membership`.

## Consequences

- **Positive:** Vercel/Supabase-style B2B model before production users; org switcher and members UI are real.
- **Negative:** One-time migration; `user_id` columns in product tables now reference `membership` (same UUIDs where backfilled).
- **Neutral:** SSO and magic links remain a later IdP milestone; schema does not need another reshape.

## API sketch

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/id/auth/me` | account + active org + all orgs |
| POST | `/v1/id/orgs/switch` | change active org on session |
| GET | `/v1/id/orgs/:orgId/members` | list memberships (admin) |
| GET/POST | `/v1/id/orgs/:orgId/invitations` | list / create |
| POST | `/v1/id/orgs/:orgId/invitations/:id/resend` | resend email + rotate token |
| DELETE | `/v1/id/invitations/:id` | revoke |
| GET | `/v1/id/invitations/preview` | public invite metadata |
| POST | `/v1/id/invitations/accept` | accept with session or login |
