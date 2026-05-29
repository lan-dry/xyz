# Salanor ID (`services/id`)

Unified console authentication for all Salanor products (ADR-0006).

| Endpoint | Purpose |
| -------- | ------- |
| `POST /v1/id/auth/login` | Email/password → `salanor_session` cookie |
| `GET /v1/id/auth/me` | Account, active org, all org memberships |
| `POST /v1/id/orgs/switch` | Change active organization |
| `GET /v1/id/orgs/:orgId/members` | List members (admin) |
| `GET/POST /v1/id/orgs/:orgId/invitations` | List / create invites (admin) |
| `DELETE /v1/id/invitations/:id` | Revoke pending invite |
| `GET /v1/id/invitations/preview?token=` | Public invite metadata |
| `POST /v1/id/invitations/accept` | Accept invite (authenticated) |
| `POST /v1/id/auth/validate` | Token validation for product APIs |
| `POST /v1/id/auth/logout` | End session |

Default port: `8091` (`SALANOR_ID_PORT`).

**Invites (local):** every invite prints an accept URL in this service’s terminal.  
**Invites (email):** set `RESEND_API_KEY` (+ optional `INVITE_EMAIL_FROM`) in `.env`.

Product services set `SALANOR_ID_URL=http://127.0.0.1:8091` to validate sessions remotely.
