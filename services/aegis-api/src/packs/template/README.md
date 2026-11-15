# Policy pack template

Aegis evaluates **tenant configuration**, not hard-coded sector rules.

1. Copy `pack.template.json` to a new folder (or load JSON from your config store).
2. Set `demo_only: false` for real tenant packs.
3. Fill `roles`, `authority_matrix`, `field_policies`, `rules`, and `workflows`.
4. Apply with your seed/import tooling — no engine code changes required.

Shipped demo packs (`demo.banking`, `demo.insurance`) are labelled `demo_only: true` and are illustrative only.
