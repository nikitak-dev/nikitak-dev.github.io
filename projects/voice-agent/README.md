# voice-agent — project artifacts

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation. Test case: GreenScape Landscaping (Saint Petersburg, FL) — fictional landscaping company.

- **Status:** PRIVATE. The Vapi assistant is not publicly callable; project ships as a portfolio artifact, not a live demo.
- **Live page:** [/voice-agent/](https://nikitak-dev.github.io/voice-agent/)
- **Canonical docs:** click `DOCS & VIDEO` on the live page (modal). Source: [`src/components/docs/VoiceAgentDocs.astro`](../../src/components/docs/VoiceAgentDocs.astro) (EN) and [`src/components/docs/voice-agent.ru.md`](../../src/components/docs/voice-agent.ru.md) (RU companion).

## What's in this directory

| Path | Tracked? | Contents |
|---|---|---|
| [`adrs/`](adrs/) | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Files named `NNN-slug.md`; new ADRs start from [`_template.md`](adrs/_template.md). |
| [`db/`](db/) | ✓ | Supabase Postgres schema — DDL migrations (`migrations/`) + generated TypeScript types (`types/database.ts`). |
| [`eval/`](eval/) | ✓ | Regression suite. Legacy Vapi Test Suite (chat, 5 smoke scenarios) + 4 Vapi **Evals** for the mutating flows (book / reschedule / cancel / phone greet-by-name) + [`ownership-regression.sql`](eval/ownership-regression.sql) backend invariant. Scripts + per-run JSON in `results/`; full breakdown in [`eval/README.md`](eval/README.md). |
| [`knowledge-base/`](knowledge-base/) | ✓ | Knowledge base for the test case (services, pricing, hours, FAQs). Loaded into Vapi Files; queried by Sophie via the `search_knowledge_base` tool. `.txt` extension required by Vapi. |
| [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) | ✓ | Sophie's full system prompt — snapshot of the live Vapi UI. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. Everything in this directory is repo-only documentation.
