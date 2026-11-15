# OIDC claim → console / bank role mapping

Module: `services/aegis-api/src/auth/oidc-claim-mapper.ts`

## Env

| Variable | Meaning |
|----------|---------|
| `AEGIS_OIDC_ROLE_CLAIM` | Claim name holding roles (default `roles`). Also reads `groups` and Keycloak `realm_access.roles`. |
| `AEGIS_OIDC_ROLE_MAP` | JSON map from claim value → console role or `bank:<role_key>`. |

## Defaults

Claim values `admin`, `approver`, `auditor`, `engineer`, `viewer`, `owner` map to the same console roles.  
Bank ladder keys (`credit_manager`, `credit_officer`, `compliance_officer`, `head_of_compliance`, `dpo`) map to `bank:<key>` and are applied via `membership_bank_role` / delegation flows.

## Example

```bash
AEGIS_OIDC_ROLE_CLAIM=groups
AEGIS_OIDC_ROLE_MAP={"Aegis-Admins":"admin","Aegis-Approvers":"approver","BK-Credit-Managers":"bank:credit_manager"}
```

When multiple console roles match, the highest privilege wins (`owner` > `admin` > … > `viewer`).
