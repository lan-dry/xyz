# Deploy configs

Production deployment is documented in **`docs/PRODUCTION_DEPLOY.md`**.

| Path | Purpose |
|------|---------|
| `deploy/docker/Dockerfile.backend` | Shared Docker image for Node backend services |
| `deploy/fly/*/fly.toml` | Fly.io app config per service |

Deploy a backend from the repository root:

```bash
fly deploy --config deploy/fly/aegis-api/fly.toml
```

See the full runbook for Neon, Vercel, secrets, DNS, and first-time setup.
