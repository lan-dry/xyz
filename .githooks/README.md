# Git hooks

## Remove Cursor co-author from commits

Cursor may append `Co-authored-by: Cursor <cursoragent@cursor.com>` to agent commits.
This hook strips that line before the commit is finalized.

**One-time install** (from repo root):

```powershell
git config core.hooksPath .githooks
```

On Windows, Git for Windows runs these hooks via sh (included with Git).

Repeat for `D:\deploy\salanor` if you commit there too.

Also disable in Cursor: **Settings → Git & PRs → Attribution** (turn off commit attribution).
