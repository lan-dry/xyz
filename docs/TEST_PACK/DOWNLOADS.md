# Downloads and how to verify them

| File | How you get it | How to verify |
|------|----------------|---------------|
| Evidence bundle JSON | Case → **Download evidence bundle** | `pnpm aegis-verify <bundle.json> --keys <keys.json>` → exit 0 / `ok: true`. Tamper any sealed field → must **FAIL** |
| Tampered copy | Copy the bundle; change one hash/event | Same command → **FAIL** with findings |
| CSV report | **Reports** → Export / Download CSV | Opens in spreadsheet; columns match preview (Decision, Mode, Number of cases, …) |
| Receipt JSON | Case / receipt download if offered | Included in evidence bundle; verify via aegis-verify |
| Compliance ZIP (if enabled) | Exports / compliance | `pnpm aegis:verify-compliance-zip` |

### aegis-verify expected shape

```text
pnpm aegis-verify path\to\bundle.json --keys path\to\keys.json
```

Success: process exit **0**, output indicates verification **ok** / PASS (no failing findings).  
Failure after tamper: non-zero exit and listed findings (signature, hash chain, or receipt hash).

Public page: open **Verify** (new tab) with share link or pasted receipt — same check names as the console (signature, hash chain, sequence, policy hash, approvals, witness, trusted time).
