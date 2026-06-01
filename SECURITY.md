# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| main    | yes       |

## Reporting a vulnerability

Please report security issues **privately** to **security@salanor.com** (or your designated security contact).

Do not open public GitHub issues for undisclosed vulnerabilities.

Include:

- Description and impact
- Steps to reproduce
- Affected components (SDK, web app, infrastructure)
- Suggested fix (if any)

We aim to acknowledge reports within **5 business days** and will coordinate disclosure timelines with reporters.

## Scope (P0)

The local Aegis slice (`@salanor/aegis-ledger-sdk`, `salanor-aegis-ledger`) stores events on disk in the developer environment. Treat ledger paths as sensitive if they contain production-like data.
