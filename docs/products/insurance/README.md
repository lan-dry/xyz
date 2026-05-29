# Insurance product documentation

**Product:** Insurance bridge — risk metrics and reinsurance integration (second Salanor product, Stage 11 scaffold).

**Status:** Preview / scaffold only. API and console routes exist in the monorepo; production features ship in P4–P5.

| Surface | Path |
| ------- | ---- |
| API | `services/insurance-api` (`INSURANCE_API_PORT` default `8092`) |
| Console | `http://localhost:3000/insurance` |

Authentication uses **Salanor ID** (`services/id`) — same session as Aegis.
