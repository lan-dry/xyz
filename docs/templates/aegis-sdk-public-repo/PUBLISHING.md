# Publishing `aegis-sdk` to GitHub

## Recommended repo layout

```
aegis-sdk/                 # public repo: github.com/salanor/aegis-sdk
├── LICENSE
├── README.md
├── package.json           # name: @salanor/aegis, publishConfig.access: public
├── tsconfig.json
├── src/                   # copy from monorepo sdks/typescript/src
├── spec/
│   └── aps-0.1.schema.json
└── examples/
    └── quickstart.mjs
```

## Steps

1. Create empty repo **salanor/aegis-sdk** (public) on GitHub.
2. Copy `sdks/typescript` sources + build config; remove workspace-only deps (`@salanor/config` → inline eslint/tsconfig or use standalone).
3. Copy files from `docs/templates/aegis-sdk-public-repo/` (README, LICENSE, example).
4. Copy `spec/aps/v0.1.json` → `spec/aps-0.1.schema.json` (align field names with `ApsEvent` in SDK before claiming conformance).
5. `npm publish --access public` from CI on tag `v0.1.x`, or use GitHub Packages if you prefer private registry first.
6. Link README spec URL to **https://salanor.com/spec** (canonical human spec).

## Monorepo sync

Until publish automation exists, tag monorepo releases and `git subtree split` or manual copy on each SDK release. Do **not** publish `aegis-ledger-sdk` (internal pipeline) in this repo.

## Python (optional second repo)

`github.com/salanor/aegis-sdk-python` with `salanor-aegis` from `packages/aegis-sdk-py` — same LICENSE/README pattern.
