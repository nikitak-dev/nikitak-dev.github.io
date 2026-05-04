# voice-agent — changelog

Build-out journal grouped by development phase, newest first. Items with a clear "decision under tension" are wrapped as [ADRs](adrs/); the rest stay here as context.

## 2026-05 — Migration to Supabase Postgres + n8n rewiring

- **Schema migrated from Airtable to Supabase Postgres** — fresh-start migration. New schema captures everything Vapi `end-of-call-report` provides (turn-by-turn transcript in JSONB, cost/latency breakdown, structured `analysisPlan` outputs, recording archived in Storage bucket). RLS enabled with `service_role`-only policies (production hooks for `authenticated owner` policies are in place but commented). Schema details in [`db/`](db/).
- **n8n workflows rewired to Postgres** — six existing tool sub-workflows (`client_lookup`, `create_client`, `book_event`, `update_event`, `delete_event`, `end_of_call`) converted from Airtable to Postgres nodes; two helper sub-workflows added (`shared_phone_normalize`, `archive_recording`).
- **Comma-safe Postgres writes via `upsert` operation** — discovered mid-migration that n8n's Postgres `executeQuery` does a literal comma-split on the resolved `queryReplacement` string, breaking any value containing a comma (addresses, transcripts, names like `Smith, John`). Migrated all write paths to the Postgres `upsert` operation with explicit per-column expressions, which sidesteps the bug. `executeQuery` is kept only for SELECTs with single parameters. → [ADR-005](adrs/005-comma-safe-postgres-upsert.md)
- **Idempotency on retries** — `end_of_call.create_record` upserts on `vapi_call_id`; `book_event.upsert_record` upserts on `gcal_event_id`. Vapi retries no longer create duplicate `calls` rows; race conditions on booking no longer create duplicate `appointments`. → [ADR-003](adrs/003-idempotency-via-upsert-on-vendor-ids.md)
- **`event_lookup` server-side filter by `customer_id`** — closes the privacy gap where the LLM was responsible for filtering calendar events to the right caller by email. Sophie now passes the `customer_id` she remembered from `client_lookup` / `create_client`, and the workflow returns only that caller's appointments. Status filter `IN ('scheduled', 'rescheduled')` excludes cancelled / completed / no-show rows. → [ADR-006](adrs/006-customer-id-chain-via-prompt.md)
- **`extract_call_data` Code node inside `end_of_call`** — parses Vapi payload into typed fields: turn-by-turn transcript, transcript text, tool-call aggregates (`tool_calls_count`, `tool_calls_summary`), cost breakdown, structured `analysisPlan` outputs (matched by configured UUIDs). `try/catch` falls back to a `minimal` skeleton so a partial Vapi payload still creates a row.
- **Recording archival** — `archive_recording` triggered fire-and-forget from `end_of_call`. Downloads `.mp3` from Vapi `recording_url`, uploads to Supabase Storage bucket `recordings` via PUT with `x-upsert: true` (idempotent on retries), writes back `recording_storage_path` / `recording_size_bytes` / `recording_archived_at` to the corresponding `calls` row. Skips if `recording_archived_at` is already set.
- **System prompt updates** — `customer_id` chain instruction (Sophie remembers UUID from `client_lookup` / `create_client` and passes to `event_lookup`); date verification rule (full day-of-week + month + day + year confirmation before any booking / reschedule / cancel tool call); ISO date format in `[Important Information]` (`YYYY-MM-DD (Day-of-week)`) to reduce LLM date-arithmetic errors; tool name updated from legacy `n8n_fixr` to `n8n_orchestrator`.
- **`appointment_booked` rename** — `calls.success_evaluation` renamed to `calls.appointment_booked` to match the actual Vapi Structured Output. Migration `00006`; n8n `end_of_call` mapping and `db/types/database.ts` regenerated.

## 2026-03 — Callback flow

- **Callback offers replaced live transfers** for out-of-scope requests (commercial team, operations team, field team). System prompt now offers a callback rather than attempting a live handoff. → [ADR-001](adrs/001-callback-instead-of-live-transfer.md)

## 2026-02 — Initial build-out

### Vapi assistant configuration

- **Latency tuning** — `maxTokens: 250` on the LLM to keep response time short for voice.
- **End-of-call analysis** — Vapi `analysisPlan` produces four custom Structured Outputs (`outcome` as enum: `booking_completed` / `reschedule_completed` / `cancellation_completed` / `info_provided` / `callback_promised` / `no_resolution`; `appointment_booked` boolean; `call_category` string; `customer_sentiment` string); the `end_of_call` webhook reads them by UUID and persists into matching `calls` columns. Built-in `summary` is read from `analysis.summary` directly (not via Structured Output) — repurposing `outcome` as enum avoids the duplicate "brief summary" content the field used to hold. Configured with `onError` + `alwaysOutputData` so a partial Vapi report still creates a record.
- **n8n token migration to Vapi Custom Credential** — Bearer Token credential referenced by `credentialId`, no longer inlined into `server.headers`. Removes the leak surface where Vapi management API was returning the token in clear text on every `get_tool` call.
- **MCP-routed orchestrator** — single `n8n_orchestrator` Vapi tool fans out into seven sub-workflows over MCP, instead of seven separate Vapi tools. → [ADR-002](adrs/002-mcp-orchestrator-single-tool.md)

### n8n sub-workflow logic

- **Phone number normalization to E.164** in Code nodes inside `client_lookup` and `create_client` (default country code `+1`).
- **Idempotent booking** — `book_event` checks Google Calendar within `start_time .. start_time+5min` for an existing event with the caller's email in attendees; if found, returns the existing `appointment_id` instead of creating a duplicate.
- **Error contract: instructions, not exceptions** — every tool sub-workflow returns `{ error: true, instruction: "<what Sophie should say>" }`. Sophie speaks the instruction; the underlying error goes to Discord via `tools_error_handler`. → [ADR-004](adrs/004-error-instruction-contract.md)
- **Input validation** — `IF` nodes at the entry of `book_event` and `create_client`; `fallbackOutput` on `client_lookup` Switch for the case where neither email nor phone was provided.
- **Email regex validation** — replaces the previous `contains "@"` check in `book_event` and `create_client`.

### Schema (Airtable era — superseded by 2026-05 Postgres migration)

- **Status field on `appointments`** — text + CHECK with five values (`scheduled, rescheduled, canceled, completed, no-show`). `book_event`, `update_event`, `delete_event` keep the first three in sync; `completed` and `no-show` are manual.
- **Linked customer records** on `appointments` and `calls` → `customers` (FK `customer_id`).

### Testing

- **Manual test scenarios** — 15 call scripts in [`tests/scenarios.md`](tests/scenarios.md), with a post-test verification checklist.
