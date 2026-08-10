# Launch readiness (first design partners)

Checklist before first external pilots — not a full enterprise GA gate.

## Must have (done or in repo)

- [ ] Marketing site live (`salanor.com`) with locked tagline (`BRAND` in `apps/web-marketing/src/lib/marketing-content.ts`)
- [ ] `/spec` + contact form → Postgres `contact_messages`
- [ ] `/.well-known/security.txt` + `/legal/security`
- [ ] Public SDK repo published (`docs/templates/aegis-sdk-public-repo/`)
- [ ] Pilot API or documented local quickstart + 90s demo video
- [ ] `pnpm db:push` (web) + `pnpm db:migrate` (Aegis API) on staging/prod DBs
- [ ] Postmark `EMAIL_SERVER` for contact + magic links

## Should have (next 2–4 weeks)

- [ ] Privacy + Terms reviewed by counsel (templates exist under `/legal`)
- [ ] DPA template for EU pilots
- [ ] Staging environment (Vercel + Fly/Railway + Neon)
- [ ] Uptime monitoring on `aegis-api` and `id` health endpoints
- [ ] One-page design partner LOI

## Not required for first calls

- SOC 2 Type II (company audit — months)
- Enterprise SAML (AUTH-A5 — first enterprise deal)
- W3C `did:agent` registration

## Deploy cost note

Fly.io: no permanent free tier for new accounts (short trial only). Budget ~$5–25/mo per small API machine; Vercel free tier covers marketing Next.js.
