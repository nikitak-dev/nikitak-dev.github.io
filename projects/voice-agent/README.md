# voice-agent — project artifacts

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation.

- **Status:** PRIVATE. The Vapi assistant is not publicly callable; the project ships as a portfolio artifact, not a live demo.
- **Test case:** GreenScape Landscaping (Saint Petersburg, FL) — fictional landscaping company.
- **Stack:** Vapi (assistant host) · Anthropic Claude Sonnet 4 (LLM) · ElevenLabs Flash v2.5 (TTS) · Deepgram Nova-3 (STT) · n8n (backend) · Airtable (CRM) · Google Calendar · Discord (alerts).

For the technical breakdown, start with [`architecture.md`](architecture.md) — stack, high-level flow, Vapi configuration, system prompt structure, operational notes.

## What's in this directory

| Path | Tracked? | Contents |
|---|---|---|
| [`architecture.md`](architecture.md) | ✓ | Stack (LLM/TTS/STT models named), high-level flow diagram, Vapi configuration (IDs masked), n8n auth via Vapi Custom Credential, system prompt structure, operational notes preserved from build-out. |
| [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) | ✓ | Sophie's full system prompt — identity, voice rules, tool calling, data verification, call-flow logic, error handling, callback routing. 146 lines. |
| [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt) | ✓ | Knowledge base for the test case — services, pricing, hours, service area, FAQs, escalation. Loaded into Vapi Files; queried by Sophie via the `search_knowledge_base` tool. `.txt` extension required by Vapi. |
| [`tests/scenarios.md`](tests/scenarios.md) | ✓ | 15 manual call scenarios (happy-path booking, returning client, reschedule, cancel, KB-only Q&A, out-of-area, out-of-hours, invalid email, service-not-in-KB, idempotency, tool failure, silent caller, callback request, multi-action call, mid-response interrupt) + post-test verification checklist. |
| [`n8n/workflows.md`](n8n/workflows.md) | ✓ | Inventory of the 11 n8n workflows, per-tool MCP descriptions Sophie's LLM sees, call-flow diagram, error-instruction contract, Airtable schema highlights, shared workflow settings, known limitations. |
| [`adrs/`](adrs/) | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Currently only [`_template.md`](adrs/_template.md) — see *Implementation history* below for problems already solved that may eventually become ADRs. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. Everything in this directory is repo-only documentation.

## Implementation history

Solved during the build-out. Listed for context — none of these are wrapped as ADRs yet.

1. **Status field on `appointment_logs`** — single-select with five values (`scheduled, rescheduled, canceled, completed, no-show`). `book_event`, `update_event`, `delete_event` keep the first three in sync; `completed` and `no-show` are manual.
2. **Linked customer records** on `appointment_logs` and `call_logs` → `customers`.
3. **Callback offers replaced live transfers** for out-of-scope requests (commercial team, operations team, field team). System prompt now offers a callback rather than attempting a live handoff.
4. **Phone number normalization to E.164** in Code nodes inside `client_lookup` and `create_client` (default country code `+1`).
5. **Idempotent booking** — `book_event` checks Google Calendar within `start_time .. start_time+5min` for an existing event with the caller's email in attendees; if found, returns the existing `appointment_id` instead of creating a duplicate.
6. **Error contract: instructions, not exceptions** — every tool sub-workflow returns `{ error: true, instruction: "<what Sophie should say>" }`. Sophie speaks the instruction; the underlying error goes to Discord via `tools_error_handler`.
7. **Input validation** — `IF` nodes at the entry of `book_event` and `create_client`; `fallbackOutput` on `client_lookup` Switch for the case where neither email nor phone was provided.
8. **Latency tuning** — `maxTokens: 250` on the LLM to keep response time short for voice.
9. **End-of-call analysis** — Vapi `analysisPlan` produces four structured outputs (`outcome`, `success_evaluation`, `call_category`, `customer_sentiment`); the `end_of_call` webhook reads them by UUID and persists into matching `call_logs` columns. Configured with `onError` + `alwaysOutputData` so a partial Vapi report still creates a record.
10. **Manual test scenarios** — 15 call scripts in [`tests/scenarios.md`](tests/scenarios.md), with a post-test verification checklist.
11. **n8n token migration to Vapi Custom Credential** — Bearer Token credential referenced by `credentialId`, no longer inlined into `server.headers`. Removes the leak surface where Vapi management API was returning the token in clear text on every `get_tool` call.

## Open follow-ups

### Portfolio side
- Project page (`src/pages/voice-agent.astro`) and documentation modal — not built yet; the hub card is currently `LOCKED`.
- Wrap selected items from *Implementation history* as ADRs once a clear "decision under tension" emerges (callback-vs-transfer, MCP-orchestrator routing, idempotency contract, error-instruction contract).

### Project side
- Manual test pass — full sweep of all 15 scenarios + post-test checklist verification. Earlier test runs happened during build-out; n8n's default execution-retention policy aged them out.
- **`event_lookup` server-side filter by email/customer** — currently returns every appointment in the requested range, leaving per-caller filtering to Sophie's LLM. A misclassification could surface another customer's appointment. See [`n8n/workflows.md`](n8n/workflows.md) → "Known limitations".
- **`end_of_call` idempotency** — flip from Airtable `create` to `upsert` keyed on `callrecording_id`. A retried Vapi end-of-call POST currently creates a duplicate row.
- **Stronger email validation** — both `book_event` and `create_client` accept anything containing `@`. A regex check or a verification roundtrip would harden this.
- **Phone normalisation deduplication** — same Code block lives in `client_lookup` and `create_client`. Extract to a small shared sub-workflow once a third caller appears.
- **Bind a phone number** to the assistant for live testing (currently no `phoneNumber` is attached, Sophie is reachable only via Vapi Web SDK or programmatic `create_call`).
