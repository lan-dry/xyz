# OIDC role mapping (P4)

Aegis keeps existing SSO. Map identity claims to org roles and optional authority ladder roles.

## Org console roles

| Claim example | Aegis membership role |
|---------------|------------------------|
| `aegis_role=admin` or group `aegis-admins` | `admin` |
| `aegis_role=approver` | `approver` |
| `aegis_role=auditor` | `auditor` |
| `aegis_role=viewer` | `viewer` |

Authority ladder roles (pack-specific, e.g. `credit_manager`, `claims_supervisor`) are stored in `membership_bank_role` and checked at approval time — not interchangeable with console roles.

## Example OIDC configuration (WorkOS / generic OIDC)

```json
{
  "provider": "oidc",
  "issuer": "https://idp.example.com/",
  "client_id": "aegis-console",
  "role_claim": "aegis_role",
  "group_claim": "groups",
  "group_map": {
    "aegis-admins": "admin",
    "aegis-approvers": "approver",
    "aegis-auditors": "auditor"
  },
  "authority_role_claim": "aegis_authority_roles"
}
```

`aegis_authority_roles` should be a string array of pack role keys. Levels are resolved from the tenant's `bank_role_ladder` at approval time.

## Test note

Automated mapping unit coverage lives with platform-auth SSO tests where configured. This file is the contract for pilots.
