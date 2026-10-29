# Stoa identity — production checklist

Stoa workspace auth uses the Salanor ID service (`services/id`) embedded at `/v1/stoa/id`.

## SSO (WorkOS)

| Item | Notes |
|------|--------|
| `WORKOS_API_KEY` | Required for SSO start / callback |
| `WORKOS_CLIENT_ID` | OAuth client |
| Organization SSO row | Enable in ID DB; map WorkOS organization id |
| Return URLs | HTTPS only; match `STOA_WORKSPACE_ORIGIN` and ID public URL |
| JIT provisioning | Disable unless HR-driven onboarding is intended |

Test flow: **Admin → Identity** shows SSO start URL for the org slug.

## SCIM

| Item | Notes |
|------|--------|
| Run platform migrations | `organization_scim` table |
| Rotate bearer token | **Admin → Identity** (org **admin** only) |
| HTTPS SCIM base | `{API_PUBLIC}/v1/stoa/scim/v2` |
| Group `externalId` | Map to Stoa **Sites** directory group for branch assignment |

## Organization RBAC (identity API)

| Role | Read members / invitations / security | Mutate membership / invites / SCIM / org profile |
|------|----------------------------------------|--------------------------------------------------|
| admin, owner | yes | yes |
| auditor, engineer | yes | **no** (403) |
| viewer | no | no |

Auditors can use Stoa admin read APIs and exports; identity write routes reject them even if the UI is bypassed.

## Cookies and origins

- Session cookie: `salanor_session` (see `@salanor/platform-auth`)
- CORS: `STOA_WORKSPACE_ORIGIN` on `stoa-api`
- Production: set `STOA_ALLOW_DEV_AUTH=0` and disable `X-Stoa-Dev-User` headers at the edge

## Email

Invitation and verification email require configured SMTP or provider env vars on the ID service (see ID service README / `.env.example`).
