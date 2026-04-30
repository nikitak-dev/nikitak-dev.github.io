# voice-agent — project artifacts

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation.

- **Status:** PRIVATE. The Vapi assistant is not publicly callable; the project ships as a portfolio artifact, not a live demo.
- **Test case:** GreenScape Landscaping (Saint Petersburg, FL) — fictional landscaping company.
- **Stack:** Vapi (voice AI) · n8n (backend) · Airtable (CRM) · Google Calendar · Discord (alerts).

For the technical breakdown, start with [`architecture.md`](architecture.md) — stack, high-level flow, Vapi configuration, system prompt structure, operational notes.

## What's in this directory

| Path | Tracked? | Contents |
|---|---|---|
| [`architecture.md`](architecture.md) | ✓ | Stack, high-level flow diagram, Vapi configuration (IDs masked), system prompt structure, operational notes preserved from build-out. |
| [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) | ✓ | Sophie's full system prompt — identity, voice rules, tool calling, data verification, call-flow logic, error handling, callback routing. 146 lines. |
| [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt) | ✓ | Knowledge base for the test case — services, pricing, hours, service area, FAQs, escalation. Loaded into Vapi Files; queried by Sophie via the `search_knowledge_base` tool. `.txt` extension required by Vapi. |
| [`tests/scenarios.md`](tests/scenarios.md) | ✓ | 15 manual call scenarios (happy-path booking, returning client, reschedule, cancel, KB-only Q&A, out-of-area, out-of-hours, invalid email, service-not-in-KB, idempotency, tool failure, silent caller, callback request, multi-action call, mid-response interrupt) + post-test verification checklist. |
| [`n8n/workflows.md`](n8n/workflows.md) | ✓ | Inventory of the 11 n8n workflows (orchestrator + 7 tool sub-workflows + end-of-call webhook + 2 error handlers), call-flow diagram, external service mapping. |
| [`adrs/`](adrs/) | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Currently only [`_template.md`](adrs/_template.md) — see *Implementation history* below for problems already solved that may eventually become ADRs. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. Everything in this directory is repo-only documentation.

## Implementation history (initial production-hardening pass)

Solved during the first round of build-out. Listed for context — none of these are wrapped as ADRs yet.

1. **Status field on `appointment_logs`** — single-select `scheduled` / `rescheduled` / `canceled`. `book_event`, `update_event`, `delete_event` keep it in sync.
2. **Linked customer records** on `appointment_logs` and `call_logs` → `customers`.
3. **Callback offers replaced live transfers** for out-of-scope requests (commercial team, operations team, field team). System prompt now offers a callback rather than attempting a live handoff.
4. **Phone number normalization to E.164** in Code nodes inside `client_lookup` and `create_client`.
5. **Idempotent booking** — `book_event` checks Google Calendar for an existing event on `(start_time, email)` before creating, so a duplicate Vapi tool call cannot create two events.
6. **Error responses** — try-catch in all 7 tool sub-workflows, Discord alerts via `tools_error_handler`, LLM-friendly error strings so Sophie can speak them naturally.
7. **Input validation** — `IF` nodes at the entry of `book_event` and `create_client`; `fallbackOutput` on `client_lookup` for the not-found case.
8. **Latency** — `maxTokens: 250` on the LLM to keep response time short for voice.
9. **Vapi `analysisPlan`** for end-of-call structured outputs (`appointment_booked`, `call_category`, `customer_sentiment`); `end_of_call` webhook configured with `onError` + `alwaysOutputData`.
10. **Manual test scenarios** — 15 call scripts in [`tests/scenarios.md`](tests/scenarios.md), with a post-test verification checklist.

## Open follow-ups

- Project page (`src/pages/voice-agent.astro`) and documentation modal — not built yet; the hub card is currently `LOCKED`.
- Wrap selected items from *Implementation history* as ADRs once a clear "decision under tension" emerges (callback-vs-transfer, MCP-orchestrator routing, idempotency contract).
- Manual test pass remaining: full sweep of all 15 scenarios + post-test checklist verification.
- Configure the Vapi `analysisPlan` structured outputs in the Vapi dashboard so end-of-call reports populate `appointment_booked`, `call_category`, `customer_sentiment`.
- Add the matching fields to the Airtable `call_logs` table so the `end_of_call` webhook can persist those structured outputs.
