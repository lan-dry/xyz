# aegis-signer

Witness jobs for Aegis (Stage 8–9).

| Script | Command | Purpose |
| ------ | ------- | ------- |
| Merkle batch | `pnpm --filter aegis-signer batch` | Event hashes → `merkle_root` + `inclusion_proof` |
| Transparency | `pnpm --filter aegis-api publish-transparency` | Inclusion proofs → `transparency_log_entry` |

Root shortcuts: `pnpm witness:batch`, `pnpm transparency:publish`.
