# Policy pack template

Aegis evaluates **tenant configuration**, not hard-coded sector rules.

## Create a sector pack

1. Copy this folder to `src/packs/<your_sector>/` (or keep packs under `demo/` when they are illustrative only).
2. Edit `pack.json`: `id`, `name`, `sector`, `version`, `currencies`, `roles`, `authority_matrix`, `rules`, `workflows`, optional `labels`.
3. Set `demo_only: false` for a real customer pack; keep `demo_only: true` for illustrative seeds.
4. Apply into a tenant:

```bash
pnpm --filter aegis-api pack:apply -- --pack <name> --org <organization_uuid>
```

Re-apply without `--force` never overwrites existing role display names, field policies, or workflows silently. The tenant records `applied_pack.id` + `applied_pack.version` in `organization.governance_settings`.

## What belongs in a pack

| Area | Pack field |
|------|------------|
| Workflows / products | `workflows` |
| Roles + ladder levels | `roles` |
| Authority matrix | `authority_matrix` |
| Special rules | `rules` |
| Field handling | `field_policies` |
| Display labels | `labels` |
| Sample scenarios | demo/simulator stories or your seed CLI (not the engine) |

No engine code changes are required for a new sector.
