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
| [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) | ✓ | Sophie's full system prompt — identity, voice rules, tool calling, data verification, call-flow logic, error handling, callback routing. 146 lines. |
| [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt) | ✓ | Knowledge base for the test case — services, pricing, hours, service area, FAQs, escalation. Loaded into Vapi Files; queried by Sophie via the `search_knowledge_base` tool. `.txt` extension required by Vapi. |
| [`tests/scenarios.md`](tests/scenarios.md) | ✓ | 15 manual call scenarios (happy-path booking, returning client, reschedule, cancel, KB-only Q&A, out-of-area, out-of-hours, invalid email, service-not-in-KB, idempotency, tool failure, silent caller, callback request, multi-action call, mid-response interrupt) + post-test verification checklist. |
| [`n8n/workflows.md`](n8n/workflows.md) | ✓ | Inventory of the 11 n8n workflows, per-tool MCP descriptions Sophie's LLM sees, call-flow diagram, error-instruction contract, shared workflow settings, known limitations. |
| [`db/`](db/) | ✓ | Supabase Postgres schema — DDL migrations (`migrations/`), generated TypeScript types (`types/database.ts`), schema documentation. Replaces the previous Airtable backend. |
| [`adrs/`](adrs/) | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Currently only [`_template.md`](adrs/_template.md) — see *Implementation history* below for problems already solved that may eventually become ADRs. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. Everything in this directory is repo-only documentation.

## Implementation history

Solved during the build-out. Listed for context — none of these are wrapped as ADRs yet.

1. **Status field on `appointments`** — text + CHECK with five values (`scheduled, rescheduled, canceled, completed, no-show`). `book_event`, `update_event`, `delete_event` keep the first three in sync; `completed` and `no-show` are manual.
2. **Linked customer records** on `appointments` and `calls` → `customers` (FK `customer_id`).
3. **Callback offers replaced live transfers** for out-of-scope requests (commercial team, operations team, field team). System prompt now offers a callback rather than attempting a live handoff.
4. **Phone number normalization to E.164** in Code nodes inside `client_lookup` and `create_client` (default country code `+1`).
5. **Idempotent booking** — `book_event` checks Google Calendar within `start_time .. start_time+5min` for an existing event with the caller's email in attendees; if found, returns the existing `appointment_id` instead of creating a duplicate.
6. **Error contract: instructions, not exceptions** — every tool sub-workflow returns `{ error: true, instruction: "<what Sophie should say>" }`. Sophie speaks the instruction; the underlying error goes to Discord via `tools_error_handler`.
7. **Input validation** — `IF` nodes at the entry of `book_event` and `create_client`; `fallbackOutput` on `client_lookup` Switch for the case where neither email nor phone was provided.
8. **Latency tuning** — `maxTokens: 250` on the LLM to keep response time short for voice.
9. **End-of-call analysis** — Vapi `analysisPlan` produces four custom Structured Outputs (`outcome` as enum: `booking_completed` / `reschedule_completed` / `cancellation_completed` / `info_provided` / `callback_promised` / `no_resolution`; `appointment_booked` boolean; `call_category` string; `customer_sentiment` string); the `end_of_call` webhook reads them by UUID and persists into matching `calls` columns. Built-in `summary` is read from `analysis.summary` directly (not via Structured Output) — repurposing `outcome` as enum avoids the duplicate "brief summary" content the field used to hold. Configured with `onError` + `alwaysOutputData` so a partial Vapi report still creates a record.
10. **Manual test scenarios** — 15 call scripts in [`tests/scenarios.md`](tests/scenarios.md), with a post-test verification checklist.
11. **n8n token migration to Vapi Custom Credential** — Bearer Token credential referenced by `credentialId`, no longer inlined into `server.headers`. Removes the leak surface where Vapi management API was returning the token in clear text on every `get_tool` call.
12. **Schema migrated from Airtable to Supabase Postgres** — fresh-start migration. New schema captures everything Vapi `end-of-call-report` provides (turn-by-turn transcript in JSONB, cost/latency breakdown, structured `analysisPlan` outputs, recording archived in Storage bucket). RLS enabled with `service_role`-only policies (production hooks for `authenticated owner` policies are in place but commented). Schema details in [`db/`](db/).
13. **n8n workflows rewired to Postgres** — six existing tool sub-workflows (`client_lookup`, `create_client`, `book_event`, `update_event`, `delete_event`, `end_of_call`) converted from Airtable to Postgres nodes; two helper sub-workflows added (`shared_phone_normalize`, `archive_recording`).
14. **Comma-safe Postgres writes via `upsert` operation** — discovered mid-migration that n8n's Postgres `executeQuery` does a literal comma-split on the resolved `queryReplacement` string, breaking any value containing a comma (addresses, transcripts, names like `Smith, John`). Migrated all write paths to the Postgres `upsert` operation with explicit per-column expressions, which sidesteps the bug. `executeQuery` is kept only for SELECTs with single parameters.
15. **Idempotency on retries** — `end_of_call.create_record` upserts on `vapi_call_id`; `book_event.upsert_record` upserts on `gcal_event_id`. Vapi retries no longer create duplicate `calls` rows; race conditions on booking no longer create duplicate `appointments`.
16. **`event_lookup` server-side filter by `customer_id`** — closes the privacy gap where the LLM was responsible for filtering calendar events to the right caller by email. Sophie now passes the `customer_id` she remembered from `client_lookup` / `create_client`, and the workflow returns only that caller's appointments. Status filter `IN ('scheduled', 'rescheduled')` excludes cancelled / completed / no-show rows.
17. **`extract_call_data` Code node inside `end_of_call`** — parses Vapi payload into typed fields: turn-by-turn transcript, transcript text, tool-call aggregates (`tool_calls_count`, `tool_calls_summary`), cost breakdown, structured `analysisPlan` outputs (matched by configured UUIDs). `try/catch` falls back to a `minimal` skeleton so a partial Vapi payload still creates a row.
18. **Recording archival** — `archive_recording` triggered fire-and-forget from `end_of_call`. Downloads `.mp3` from Vapi `recording_url`, uploads to Supabase Storage bucket `recordings` via PUT with `x-upsert: true` (idempotent on retries), writes back `recording_storage_path` / `recording_size_bytes` / `recording_archived_at` to the corresponding `calls` row. Skips if `recording_archived_at` is already set.
19. **System prompt updates** — `customer_id` chain instruction (Sophie remembers UUID from `client_lookup` / `create_client` and passes to `event_lookup`); date verification rule (full day-of-week + month + day + year confirmation before any booking / reschedule / cancel tool call); ISO date format in `[Important Information]` (`YYYY-MM-DD (Day-of-week)`) to reduce LLM date-arithmetic errors; tool name updated from legacy `n8n_fixr` to `n8n_orchestrator`.
20. **Email regex validation** — replaces the previous `contains "@"` check in `book_event` and `create_client`.

## Open follow-ups

### Portfolio side
- Project page (`src/pages/voice-agent.astro`) and documentation modal — not built yet; the hub card is currently `LOCKED`.
- Wrap selected items from *Implementation history* as ADRs once a clear "decision under tension" emerges. Strong candidates: callback-vs-transfer, MCP-orchestrator routing, idempotency contract, error-instruction contract, comma-safe writes via `upsert` operation, `customer_id` chain via system prompt instead of session state.

### Project side
- **Manual test pass against Supabase** — all 15 scenarios in [`tests/scenarios.md`](tests/scenarios.md). Critical paths (new client booking, reschedule, cancel) were re-validated live; the remaining scenarios still need a sweep.
- **Bind a phone number** to the assistant for live voice testing (currently no `phoneNumber` is attached, Sophie is reachable only via Vapi Web SDK / chat or programmatic `create_call`). Voice calls will exercise `archive_recording` and `end_of_call` for the first time end-to-end.
- **Address geocoding sub-tool** — current service-area check is LLM-based against the KB description; valid Tampa-area addresses sometimes get rejected when the wording doesn't obviously match the listed cities. A Google Maps Distance Matrix sub-tool would let the workflow side decide deterministically.
