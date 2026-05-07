# voice-agent — project artifacts

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation.

- **Status:** PRIVATE. The Vapi assistant is not publicly callable; the project ships as a portfolio artifact, not a live demo.
- **Test case:** GreenScape Landscaping (Saint Petersburg, FL) — fictional landscaping company.
- **Stack:** Vapi (assistant host) · Anthropic Claude Haiku 4.5 (LLM) · ElevenLabs Flash v2.5 (TTS) · Deepgram Flux General English (STT) · n8n (backend) · Supabase (Postgres CRM + Storage for recordings) · Google Calendar · Discord (alerts).

For the technical breakdown, start with [`architecture.md`](architecture.md) — stack, high-level flow, Vapi configuration, system prompt structure, operational notes.

## What's in this directory

| Path | Tracked? | Contents |
|---|---|---|
| [`architecture.md`](architecture.md) | ✓ | Stack (LLM/TTS/STT models named), high-level flow diagram, Vapi configuration (IDs masked), n8n auth via Vapi Custom Credential, system prompt structure, operational notes preserved from build-out. |
| [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) | ✓ | Sophie's full system prompt — identity, voice rules, tool calling, data verification, call-flow logic, error handling, callback routing. ~150 lines, snapshot of the live Vapi UI prompt. |
| [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt) | ✓ | Knowledge base for the test case — services, pricing, hours, service area, FAQs, escalation. Loaded into Vapi Files; queried by Sophie via the `search_knowledge_base` tool. `.txt` extension required by Vapi. |
| [`tests/scenarios.md`](tests/scenarios.md) | ✓ | 15 manual call scenarios (happy-path booking, returning client, reschedule, cancel, KB-only Q&A, out-of-area, out-of-hours, invalid email, service-not-in-KB, idempotency, tool failure, silent caller, callback request, multi-action call, mid-response interrupt) + post-test verification checklist. |
| [`n8n/workflows.md`](n8n/workflows.md) | ✓ | Inventory of the 13 n8n workflows, per-tool MCP descriptions Sophie's LLM sees, call-flow diagram, error-instruction contract, shared workflow settings, known limitations. |
| [`db/`](db/) | ✓ | Supabase Postgres schema — DDL migrations (`migrations/`), generated TypeScript types (`types/database.ts`), schema documentation. Replaces the previous Airtable backend. |
| [`adrs/`](adrs/) | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Seven ADRs covering the load-bearing build-out decisions: [001 callback-vs-transfer](adrs/001-callback-instead-of-live-transfer.md), [002 MCP-orchestrator routing](adrs/002-mcp-orchestrator-single-tool.md), [003 idempotency via UPSERT](adrs/003-idempotency-via-upsert-on-vendor-ids.md), [004 error-instruction contract](adrs/004-error-instruction-contract.md), [005 comma-safe Postgres upsert](adrs/005-comma-safe-postgres-upsert.md), [006 `customer_id` chain via prompt](adrs/006-customer-id-chain-via-prompt.md), [007 webhook auth via Bearer header](adrs/007-webhook-auth-bearer-header.md). [`_template.md`](adrs/_template.md) for new ones. |
| [`vapi-evals/`](vapi-evals/) | ✓ | Vapi Test Suite (chat-mode) — five smoke scenarios + scripts (`create-suite.ps1`, `run-suite.ps1`) + per-run JSON snapshots in `results/`. Acts as the regression check after every prompt edit. |
| [`CHANGELOG.md`](CHANGELOG.md) | ✓ | Build-out journal grouped by phase, newest first. ADRs are linked from the relevant entries. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. Everything in this directory is repo-only documentation.

## Implementation history

Build-out journal lives in [`CHANGELOG.md`](CHANGELOG.md), grouped by phase (newest first): May 2026 Phase C compliance + automated evals → May 2026 Supabase migration → March 2026 callback flow → February 2026 initial build-out. Load-bearing decisions are wrapped as [ADRs](adrs/) and cross-linked from the CHANGELOG.

## Open follow-ups

### Portfolio side
- Project page (`src/pages/voice-agent.astro`) and documentation modal — not built yet; the hub card is currently `LOCKED`.
- Future ADR candidates as new tensions emerge: HMAC-with-timestamp on top of the existing Bearer header (replay protection — gap acknowledged in [ADR-007](adrs/007-webhook-auth-bearer-header.md)), retention policy for `vapi_metadata` raw payload, prompt-versioning strategy (Vapi UI as source vs git as source).

### Project side
- **Regression evals** — five chat-mode scenarios in [`vapi-evals/`](vapi-evals/) cover prompt-driven flow logic; re-run after every prompt edit (current cadence: manual). Voice-mode tests + mutating happy-path tests are deliberately out of scope until a staging Vapi assistant + isolated n8n / Supabase exist.
- **Manual test pass against Supabase** — all 15 scenarios in [`tests/scenarios.md`](tests/scenarios.md). Critical paths (new client booking, reschedule, cancel) were re-validated live; the remaining scenarios still need a sweep.
- **End-to-end voice run.** A US number is now bound to the assistant (kept unlisted — see [`architecture.md`](architecture.md)), but the full voice path (`archive_recording` + `end_of_call` against a real `recording_url`) has not been exercised yet — Vapi Dashboard "Talk" button is currently broken (vendor side), and a programmatic `create_call` to self for the same purpose is the next step.
- **Address geocoding sub-tool** — see [`architecture.md` Possible Improvements](architecture.md#possible-improvements). The earlier prompt-driven LLM check was removed in Phase C; deterministic Distance Matrix lookup is the planned replacement.
