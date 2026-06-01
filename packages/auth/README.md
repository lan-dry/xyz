# @salanor/auth

Centralized [Auth.js v5](https://authjs.dev/) configuration for Salanor apps.

## Usage

**Server (Next.js App Router)**

```ts
// apps/your-app/src/auth.ts
import { createSalanorAuth } from "@salanor/auth/server";
import { prisma } from "@/lib/prisma";

export const { auth, handlers, signIn, signOut } = createSalanorAuth(prisma);
```

```ts
// apps/your-app/src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**Admin access**

- **Primary gate:** `sal_internal_users` row with role `superadmin`, `eng`, or `support`.
- **`ADMIN_EMAILS`** — optional **dev bootstrap only** (`NODE_ENV=development` or `ADMIN_EMAILS_BOOTSTRAP=1`): auto-upserts `superadmin` on first sign-in for listed emails. **Not used in production** as the sole gate.
- **First superadmin:** `pnpm db:seed:superadmin` with `SEED_SUPERADMIN_EMAIL=you@company.com` (or first `ADMIN_EMAILS` entry).

**Client**

```tsx
import { useSession } from "@salanor/auth";
```

## Environment

See repo root `.env.example`:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Session signing (`openssl rand -hex 32`) |
| `AUTH_URL` | Canonical Auth.js base URL (e.g. `http://localhost:3000`) |
| `AUTH_TRUST_HOST` | Set `true` so magic links use the sign-in host (`app.aegis.localhost:3000`, etc.). When `true` + local dev, `/api/auth` handlers use the **request origin** instead of rewriting to `AUTH_URL` (NextAuth’s default `reqWithEnvURL` breaks `*.localhost`). Post-login redirects stay on that host. |
| `AUTH_COOKIE_DOMAIN` | Dev only; defaults to `.localhost` for `*.localhost` session sharing (`none`/`off` disables) |
| `SALANOR_ENV` | Set `local` to enable `.localhost` cookies when `NODE_ENV=production` (`next start` on loopback) |
| `ADMIN_EMAILS` | Dev bootstrap allowlist (optional; see above) |
| `ADMIN_EMAILS_BOOTSTRAP` | Set `1` to enable bootstrap outside development |
| `SEED_SUPERADMIN_EMAIL` | Founder email for `pnpm db:seed:superadmin` |
| `EMAIL_SERVER` / `EMAIL_FROM` | Magic link SMTP (Postmark recommended). In dev, the full magic link is logged as `[auth] magic link for …` — open it in the **same browser** where you requested sign-in. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth (optional, A2) |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth (optional, A2) |

OAuth providers are registered only when **both** id and secret are set for that provider.

## OAuth setup (AUTH-A2)

### Google

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Create credentials** → **OAuth client ID** → Web application.
2. **Authorized redirect URIs:** `{AUTH_URL}/api/auth/callback/google` (e.g. `http://localhost:3000/api/auth/callback/google`).
3. Copy **Client ID** → `AUTH_GOOGLE_ID`, **Client secret** → `AUTH_GOOGLE_SECRET`.

### GitHub

1. [GitHub Developer Settings → OAuth Apps](https://github.com/settings/developers) → **New OAuth App**.
2. **Authorization callback URL:** `{AUTH_URL}/api/auth/callback/github`.
3. Copy **Client ID** → `AUTH_GITHUB_ID`, generate **Client secret** → `AUTH_GITHUB_SECRET`.

### Account linking

Auth.js + Prisma adapter links providers to the same `User` when the **email matches** (default). Admin access requires `sal_internal_users` (or dev bootstrap above) via the `signIn` callback.

### Staging / production

Set the same callback URLs on each OAuth app for your Vercel preview and production hosts. Update `AUTH_URL` per environment.

## Full auth roadmap

Product sequencing and exit criteria: **`docs/AUTH_ROADMAP.md`** (stages `AUTH-A1` … `AUTH-A5`).

## 2FA (AUTH-A3 baseline)

`AUTH_MODULE_VERSION` and `AUTH_EXTENSION_POINTS` document stable extension hooks.

- `callbacks.jwt` stamps `token.totpEnabled` / `token.totpVerified` at primary sign-in.
- Middleware gates `/admin`, `/console`, and `/api/console` when TOTP is enabled and challenge is not verified.
- Enrollment + challenge routes live in `apps/web`:
  - `/api/console/totp/setup|verify|disable`
  - `/api/auth/totp/verify`
  - `/sign-in/totp`
- **Remaining hardening:** recovery codes, explicit `auth.sign_out` / `auth.sign_in_failure` audit hooks.

Do not fork provider config per app; extend `createSalanorAuth` in this package only.
