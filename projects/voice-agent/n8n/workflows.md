# n8n — workflows

The n8n side of voice-agent runs as one MCP-routed orchestrator plus seven tool sub-workflows exposed to Vapi, two internal helper sub-workflows (phone normalization, recording archival), one webhook for end-of-call reporting, and two error handlers that fan out to Discord. All workflows live on the self-hosted instance at `<n8n-host>`. All 13 are active.

## Workflow inventory

| Workflow | Type | Status | Role |
|---|---|---|---|
| `orchestrator` | MCP trigger | active | Single entry point for `n8n_orchestrator` calls from Vapi. Exposes the 7 tool sub-workflows as MCP-discoverable operations. |
| `client_lookup` | sub-workflow | active | Look up a customer in Supabase Postgres by email **or** phone (Switch by which field is non-empty). Returns CRM name + `customer_id` (UUID) for downstream `event_lookup` chaining, or a not-found marker. Validation fallback if both inputs are empty. |
| `create_client` | sub-workflow | active | Create or update a customer in Supabase Postgres. Postgres `upsert` operation matching on `email` (lowercased before send); phone normalized via `shared_phone_normalize`; email validated via regex; clears phone if it still contains an unresolved Liquid template. |
| `check_availability` | sub-workflow | active | Read events from Google Calendar for a given range, format them for Sophie. Returns either `"The entire day is available."` or an array of busy slots. |
| `book_event` | sub-workflow | active | Idempotent booking. Pre-checks GCal for an existing event in `start_time .. start_time+5min` with `attendees.email == email`; if match — returns existing `appointment_id`, no new event. Otherwise creates GCal event, looks up `customer_id` by email, and `upsert`s `appointments` row matching on `gcal_event_id` with status `scheduled`. |
| `event_lookup` | sub-workflow | active | Server-side filter by `customer_id` (UUID, mandatory input from Sophie). Returns appointments for the caller in the given time range with status `scheduled` or `rescheduled`. Closes the privacy gap where the LLM previously had to filter by email. |
| `update_event` | sub-workflow | active | Move an existing event to a new time in Google Calendar; flip the `appointments.status` to `rescheduled`. Service type / address / email are not modified — they remain from the original booking. |
| `delete_event` | sub-workflow | active | Delete a Google Calendar event; flip the `appointments.status` to `canceled` (soft delete — Postgres row preserved for audit). |
| `end_of_call` | webhook | active | Receives Vapi's end-of-call report. Looks up customer by `customer.number` (E.164); `extract_call_data` Code node parses transcript, tool-call aggregates, costs, structured `analysisPlan` outputs from Vapi payload; Postgres `upsert` into `calls` matching on `vapi_call_id` (idempotent on retries); fire-and-forget `archive_recording` sub-workflow runs in parallel. |
| `shared_phone_normalize` | sub-workflow | active | Internal helper. Single Code node: takes `{ phone_number, default_country: '+1' }` → returns `{ normalized_phone }` in E.164 (or empty string if input < 10 digits). Called from `client_lookup` and `create_client` to deduplicate logic. |
| `archive_recording` | sub-workflow | active | Triggered fire-and-forget from `end_of_call`. Downloads `.mp3` from Vapi `recording_url`, uploads to Supabase Storage bucket `recordings` via PUT with `x-upsert: true` (idempotent on retries), writes back `recording_storage_path` / `recording_size_bytes` / `recording_archived_at` to the corresponding `calls` row. Skips if `recording_archived_at IS NOT NULL`. |
| `tools_error_handler` | error handler | active | Catches failures inside tool sub-workflows. Posts to Discord channel `#n8n_logs_voice_agent_tools_error_alarm` with workflow name, execution URL, error message. |
| `external_error_handler` | error handler | active | Catches failures in non-tool triggers (orchestrator, end_of_call). Same Discord template. |

`orchestrator` exposes the seven tool sub-workflows as `toolWorkflow` nodes — Vapi sees them through the single `n8n_orchestrator` tool description and picks the right action by argument shape. The orchestrator UI groups them into **Scanning tools** (read-only: `client_lookup`, `event_lookup`, `check_availability`) and **Action tools** (mutating: `create_client`, `book_event`, `update_event`, `delete_event`). The two internal helpers (`shared_phone_normalize`, `archive_recording`) are not exposed to Vapi — they are invoked via `executeWorkflow` from other workflows.

## Tool descriptions advertised to Sophie's LLM

These descriptions are what the LLM sees over MCP and uses to decide which sub-tool to call. They embed routing rules directly (e.g. "NEVER use book_event for rescheduling").

| Sub-tool | Inputs | Description |
|---|---|---|
| `client_lookup` | `email`, `phone_number` | Look up a client profile in the CRM by phone number or email address. |
| `create_client` | `full_name`, `email`, `phone_number` | Create a new client profile in the CRM. Only for first-time callers. |
| `check_availability` | `after_time`, `before_time` | Check available time slots on the calendar for a given date range. |
| `book_event` | `start_time`, `end_time`, `email`, `client_name`, `service_type`, `address` | Create a NEW appointment. Only for first-time bookings. NEVER use for rescheduling existing appointments. |
| `event_lookup` | `after_time`, `before_time`, `customer_id` | Look up appointments for the current caller. Requires customer_id from client_lookup. Returns appointment details including appointment_id. |
| `update_event` | `start_time`, `end_time`, `appointment_id` | Reschedule an EXISTING appointment to a new time. Requires appointment_id from event_lookup. Updates both calendar and database. |
| `delete_event` | `appointment_id` | Cancel and delete an existing appointment. Requires appointment_id from event_lookup. |

`appointment_id` advertised to Sophie is the Google Calendar event id (the same value the schema stores as `appointments.gcal_event_id`); update / delete sub-workflows look up the row by that column.

## Call flow

```
Vapi (n8n_orchestrator) ──► orchestrator (MCP)
                              │
                              │ Identification
                              ├──► client_lookup       (Postgres SELECT by email or phone; returns customer_id UUID)
                              └──► create_client       (Postgres UPSERT on customers, match by email lower)
                              │                              │
                              │                              └──► shared_phone_normalize (E.164)
                              │
                              │ Booking
                              ├──► check_availability  (GCal read + format)
                              └──► book_event          (GCal idempotency check → create → Postgres UPSERT on appointments, match by gcal_event_id)
                              │
                              │ Reschedule / Cancel (Sophie passes customer_id from client_lookup / create_client)
                              ├──► event_lookup        (Postgres SELECT FROM appointments WHERE customer_id = $1)
                              ├──► update_event        (GCal update + Postgres UPDATE status → rescheduled)
                              └──► delete_event        (GCal delete + Postgres UPDATE status → canceled, soft delete)

Vapi end-of-call report ──► end_of_call webhook ──► extract_call_data (parse transcript / costs / analysisPlan)
                                                        │
                                                        ├──► Postgres UPSERT on calls (match by vapi_call_id, idempotent)
                                                        └──► archive_recording (fire-and-forget; .mp3 → Supabase Storage)

Any tool error ──► tools_error_handler ──► Discord
External trigger error ──► external_error_handler ──► Discord
```

## Error contract — Sophie reads instructions, not stack traces

Every sub-workflow returns the same shape on failure:

```json
{ "error": true, "instruction": "<exact phrase Sophie should say>" }
```

The instruction is tailored to the failed step:

| Failure | Instruction |
|---|---|
| `client_lookup` validation (no email or phone) | "Ask the customer to provide either their email address or phone number so you can look them up." |
| `book_event` validation | "Ask the customer to provide their name, email address, and preferred appointment time." |
| `book_event` runtime | "Apologize for the difficulty booking the appointment. Offer to have someone call the customer back." |
| `create_client` validation | "Ask the customer to spell their full name and provide a valid email address." |
| `create_client` runtime | "Apologize for the difficulty creating the account. Offer to have someone call the customer back." |
| `check_availability` runtime | "Apologize for the difficulty checking the schedule. Offer to have someone call the customer back." |
| `event_lookup` runtime | "Apologize for the difficulty looking up appointments. Offer to have someone call the customer back." |
| `update_event` runtime | "Apologize for the difficulty updating the appointment. Offer to have someone call the customer back." |
| `delete_event` runtime | "Apologize for the difficulty canceling the appointment. Offer to have someone call the customer back." |

In parallel, the actual error (workflow name, execution URL, message) is posted to the Discord channel by the `tools_error_handler` error workflow. Sophie never sees the underlying exception — only the instruction.

## Database schema

The current Postgres schema (Supabase) is documented in [`../db/README.md`](../db/README.md). Three tables: `customers`, `calls`, `appointments`. Highlights:

- **`appointments.status`** — text + CHECK with 5 values: `scheduled` / `rescheduled` / `canceled` / `completed` / `no-show`. The first three are set by `book_event` / `update_event` / `delete_event` respectively; `completed` and `no-show` remain manual.
- **`appointments.customer_id`** — FK to `customers(id)` with `ON DELETE RESTRICT`. The denormalized `email` / `client_name` / `address` columns of the old Airtable `appointment_logs` are gone; values come through JOIN.
- **`calls`** — receives Vapi's `analysisPlan` outputs in dedicated columns (`outcome`, `success_evaluation`, `call_category`, `customer_sentiment`, `summary`) plus turn-by-turn `transcript_messages` JSONB, full-text-searchable `transcript_text_tsv`, cost/latency breakdown, and `vapi_call_id` UNIQUE for idempotency.
- **`recordings` Storage bucket** — private, 50 MB per file, `audio/mpeg` and friends. Files keyed by `{vapi_call_id}.mp3` to join with `calls.recording_storage_path`.

## External services per workflow

- **Google Calendar:** `check_availability`, `book_event`, `event_lookup` (only as fallback if Postgres call fails — primary read is now Postgres), `update_event`, `delete_event`. Single shared calendar.
- **Supabase Postgres:** `client_lookup`, `create_client`, `book_event`, `event_lookup`, `update_event`, `delete_event`, `end_of_call`. One database, three tables (`customers`, `calls`, `appointments`).
- **Supabase Storage:** `archive_recording` writes to private bucket `recordings`.
- **Discord:** `tools_error_handler`, `external_error_handler`. Single channel.

## Conventions and shared settings

- **Postgres write operations** — `client_lookup` / `find_customer` use `executeQuery` (single parameter, safe with comma-split). `create_client.upsert_customer`, `book_event.upsert_record`, `end_of_call.create_record` use the Postgres `upsert` operation with explicit per-column expressions: comma-containing values (addresses, transcripts, `full_name` like `Smith, John`) are passed safely without query-parameter splitting. `update_event` and `delete_event` use `executeQuery` with all-required parameters.
- **Retries** — every external API node has `retryOnFail: true` with 3000 ms wait, plus `onError: continueErrorOutput` on Postgres write nodes so failures route to the workflow's `error_message` Set node instead of throwing.
- **`alwaysOutputData: true`** on critical "find" nodes (GCal `getAll`, Postgres `SELECT`) — empty result returns `[]` rather than failing the branch; downstream IF nodes handle the not-found case.
- **`callerPolicy: workflowsFromSameOwner`** on all sub-workflows — only the owning n8n user can call them via `executeWorkflow`.
- **Timezone:** `America/New_York` everywhere (matches the system prompt's Eastern Time invariant).
- **`errorWorkflow` setting:** orchestrator + `end_of_call` → `external_error_handler`; the 10 tool sub-workflows → `tools_error_handler`.
- **Phone normalisation** — extracted into the `shared_phone_normalize` sub-workflow, called via `executeWorkflow` from `client_lookup` and `create_client`. Default country code is **+1** (US-only); strips non-digit/non-plus, returns empty string if final length < 10.
- **Postgres credential** — single `supabase-voice_agent` credential (Session Pooler, port 5432) shared by all Postgres nodes. Storage upload uses a separate `supabase-service_role` HTTP Header Auth credential.

## Known limitations and improvement candidates

- **Webhook paths** (MCP trigger, end_of_call) are unauthenticated by default at the URL level — security relies on the path acting as a shared secret plus, for the MCP endpoint, the Bearer credential check on each request. Rotate paths if they leak.
- **`appointment_id` advertised to Sophie is the GCal event id**, not the `appointments.id` UUID — the naming is convenient for the LLM but slightly misleading inside SQL. A future cleanup would either rename the parameter or join on the actual UUID.
- **Address validation in `Service Matching`** is LLM-based against the knowledge-base service-area description — there is no real geocoding. Sophie sometimes refuses valid addresses when the wording doesn't obviously match the listed cities. Long-term fix: add a geocoding sub-tool (Google Maps Distance Matrix) so the workflow side decides, not the LLM.
- **`recording_url` may expire** if `archive_recording` runs after Vapi's CDN invalidates the link. Mitigation: archive_recording is fired immediately from `end_of_call`; if it still fails, a retry would re-fetch a fresh signed URL via Vapi API (not implemented yet).

## Telemetry

The n8n instance prunes execution data on a default retention window (n8n env: `EXECUTIONS_DATA_MAX_AGE`). At the time of this writing, the API returns very few historical executions for the 13 workflows — manual test runs were performed during build-out and the most recent migration validation, but older execution records have aged out. There is no production traffic yet (Vapi assistant has no phone number bound).

## Infrastructure detail kept out of this document

n8n workflow IDs, the `<n8n-host>` URL, the MCP webhook path, the end-of-call webhook path, and per-credential ids (Google Calendar OAuth, Supabase Postgres connection string, Supabase service_role key, Discord webhook) are intentionally omitted. They are infrastructure facts, not part of the showcase, and they have no business in a public artifact directory.
