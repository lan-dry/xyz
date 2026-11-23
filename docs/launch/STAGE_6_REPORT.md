# Stage 6 report — invites and roles

| Item | Status |
|------|--------|
| Roles admin / approver / auditor | **Already present** in platform-auth + route inventory |
| Auditor cannot write / approve | **Done** (existing `canWriteOrgConsole` / `canDecideApprovals` + matrix) |
| Invite by email / accept / expire | **Already present** (org invitations); not re-audited end-to-end this slice |
| Full per-route role matrix expansion | **Partly** — inventory includes auditor; every new sandbox route listed |

## Honesty

No new invite UX rewrite. Existing role model reused and covered by console-route-auth-matrix + tenant-isolation.
