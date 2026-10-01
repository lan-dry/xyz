# Research attribution (Platform Ops → www)

Enterprise / academia-style rules (Option A — account is the byline):

| Concept | Storage | Rule |
|---------|---------|------|
| **Who may publish** | Salanor ID session + `platform:content.write` | Must be authenticated staff |
| **Public byline** | `account.byline_*` columns | Always **your** account — no picking another person's name |
| **Post attribution** | `research_posts.author_account_id` | Set to the signed-in account on every save |
| **Who clicked publish** | `research_posts.published_by_account_id` | Set when status becomes `published` |
| **Who last saved** | `research_posts.last_edited_by_account_id` | Updated on every save |

Drafts may exist without appearing on www. **Published** posts require a usable byline name (Content → My byline).

Schema lives in greenfield `001_baseline.sql` only (`account.byline_*`, `research_posts.author_account_id`). No separate `authors` table.

Reset DB: see `services/aegis-api/migrations/README.md`.
