# n8n — workflows

The n8n side of voice-agent runs as one MCP-routed orchestrator plus seven tool sub-workflows, one webhook for end-of-call reporting, and two error handlers that fan out to Discord. All workflows live on the self-hosted instance at `<n8n-host>`. All 11 are active.

## Workflow inventory

| Workflow | Type | Status | Role |
|---|---|---|---|
| `orchestrator` | MCP trigger | active | Single entry point for `n8n_orchestrator` calls from Vapi. Exposes the 7 tool sub-workflows as MCP-discoverable operations. |
| `client_lookup` | sub-workflow | active | Look up a customer in Airtable by email **or** phone (Switch by which field is non-empty). Returns CRM name + record ID, or a not-found marker. Validation fallback if both inputs are empty. |
| `create_client` | sub-workflow | active | Create or update a customer in Airtable. Generates a `customer_id` (base36 timestamp + random), normalizes phone to E.164, clears phone if it still contains an unresolved Liquid template. |
| `check_availability` | sub-workflow | active | Read events from Google Calendar for a given range, format them for Sophie. Returns either `"The entire day is available."` or an array of busy slots. |
| `book_event` | sub-workflow | active | Idempotent booking. Pre-checks GCal for an existing event in `start_time .. start_time+5min` with `attendees.email == email`; if match — returns existing `appointment_id`, no new event. Otherwise creates GCal event and upserts `appointment_logs` row with status `scheduled` and a linked customer record. |
| `event_lookup` | sub-workflow | active | List events from Google Calendar in a time range. **Does not filter by client** — returns all events in the range; per-caller filtering is left to Sophie's LLM. |
| `update_event` | sub-workflow | active | Move an existing event to a new time in Google Calendar; flip the `appointment_logs` status to `rescheduled`. Service type / address / email are not modified — they remain from the original booking. |
| `delete_event` | sub-workflow | active | Delete a Google Calendar event; flip the `appointment_logs` status to `canceled` (soft delete — record is preserved). |
| `end_of_call` | webhook | active | Receives Vapi's end-of-call report. Looks up customer by `customer.number` (E.164), creates a `call_logs` row with summary, recording URL, cost, customer link, and four Vapi `analysisPlan` structured outputs. |
| `tools_error_handler` | error handler | active | Catches failures inside tool sub-workflows. Posts to Discord channel `#n8n_logs_voice_agent_tools_error_alarm` with workflow name, execution URL, error message. |
| `external_error_handler` | error handler | active | Catches failures in non-tool triggers (orchestrator, end_of_call). Same Discord template. |

`orchestrator` exposes the seven tool sub-workflows as `toolWorkflow` nodes — Vapi sees them through the single `n8n_orchestrator` tool description and picks the right action by argument shape. The orchestrator UI groups them into **Scanning tools** (read-only: `client_lookup`, `event_lookup`, `check_availability`) and **Action tools** (mutating: `create_client`, `book_event`, `update_event`, `delete_event`).

## Tool descriptions advertised to Sophie's LLM

These descriptions are what the LLM sees over MCP and uses to decide which sub-tool to call. They embed routing rules directly (e.g. "NEVER use book_event for rescheduling").

| Sub-tool | Inputs | Description |
|---|---|---|
| `client_lookup` | `email`, `phone_number` | Look up a client profile in the CRM by phone number or email address. |
| `create_client` | `full_name`, `email`, `phone_number` | Create a new client profile in the CRM. Only for first-time callers. |
| `check_availability` | `after_time`, `before_time` | Check available time slots on the calendar for a given date range. |
| `book_event` | `start_time`, `end_time`, `email`, `client_name`, `service_type`, `address` | Create a NEW appointment. Only for first-time bookings. NEVER use for rescheduling existing appointments. |
| `event_lookup` | `after_time`, `before_time` | Look up existing appointments by time range. Returns appointment details including appointment_id. MUST be called before update_event or delete_event. |
| `update_event` | `start_time`, `end_time`, `appointment_id` | Reschedule an EXISTING appointment to a new time. Requires appointment_id from event_lookup. Updates both calendar and database. |
| `delete_event` | `appointment_id` | Cancel and delete an existing appointment. Requires appointment_id from event_lookup. |

## Call flow

```
Vapi (n8n_orchestrator) ──► orchestrator (MCP)
                              │
                              │ Identification
                              ├──► client_lookup       (Airtable read; switch by email/phone)
                              └──► create_client       (Airtable upsert; E.164 normalize; gen customer_id)
                              │
                              │ Booking
                              ├──► check_availability  (GCal read + format)
                              └──► book_event          (GCal idempotency check → create → Airtable upsert)
                              │
                              │ Reschedule / Cancel
                              ├──► event_lookup        (GCal read; LLM filters by client)
                              ├──► update_event        (GCal update + Airtable status → rescheduled)
                              └──► delete_event        (GCal delete + Airtable status → canceled)

Vapi end-of-call report ──► end_of_call webhook ──► Airtable call_logs (with structured outputs)
                                                        │
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

## Airtable schema highlights

- **`appointment_logs.status`** — single-select with **5** values: `scheduled` (set by `book_event`), `rescheduled` (set by `update_event`), `canceled` (set by `delete_event`), plus `completed` and `no-show` (manually flipped outside n8n).
- **`appointment_logs.customer`** — linked record to `customers`. Populated via a search-then-link pattern: `book_event` looks up customer by email, `end_of_call` looks up by E.164 phone (`customer.number` from Vapi).
- **`call_logs`** — receives Vapi's `analysisPlan` structured outputs by hard-coded UUID lookup: `outcome`, `success_evaluation` (boolean), `call_category` (enum: `booking, reschedule, inquiry, cancel, complaint`), `customer_sentiment` (enum: `positive, neutral, negative`). Plus `callrecording_id`, `summary`, `callrecording_url`, `cost`, linked `customer`.

## External services per workflow

- **Google Calendar:** `check_availability`, `book_event`, `event_lookup`, `update_event`, `delete_event`. Single shared calendar.
- **Airtable:** `client_lookup`, `create_client`, `book_event`, `update_event`, `delete_event`, `end_of_call`. One base, three tables.
- **Discord:** `tools_error_handler`, `external_error_handler`. Single channel.

## Conventions and shared settings

- **Retries** — every external API node has `retryOnFail: true` with 3000 ms wait, plus `onError: continueErrorOutput` so failures route to the workflow's `error_message` Set node instead of throwing.
- **`alwaysOutputData: true`** on critical "find" nodes (GCal `getAll`, Airtable search) — empty result returns `[]` rather than failing the branch, downstream IF nodes handle the not-found case.
- **`callerPolicy: workflowsFromSameOwner`** on all sub-workflows — only the owning n8n user can call them via `executeWorkflow`.
- **Timezone:** `America/New_York` everywhere (matches the system prompt's Eastern Time invariant).
- **`errorWorkflow` setting:** orchestrator → `external_error_handler`; the 10 other workflows → `tools_error_handler`.
- **Phone normalisation** — duplicated Code block in `client_lookup` and `create_client`. Default country code is **+1** (US-only); strips non-digit/non-plus, returns empty string if final length < 10.

## Known limitations and improvement candidates

- **`event_lookup` does not filter by caller** — returns every appointment in the requested time range. Sophie's LLM is responsible for matching events to the current caller by email; if she misreads, she could surface another customer's appointment. Server-side email filter would close this gap.
- **`end_of_call` uses Airtable `create` (not `upsert`)** despite having `matchingColumns: ["callrecording_id"]` in schema metadata. A retry of the same end-of-call POST from Vapi would create a duplicate `call_logs` row. Should be flipped to `upsert` operation.
- **Email validation is loose** — both `book_event` and `create_client` only check `email CONTAINS "@"`. A regex (RFC 5322-ish) would be safer.
- **`event_summary` parameter** referenced in `book_event.create_event.description` is not declared in the orchestrator's input schema — value renders as `undefined`. Either add to the schema or drop from the description template.
- **Phone normalisation duplicated** in two workflows — candidate for a small shared sub-workflow once a third caller appears.
- **Webhook paths** (MCP trigger, end_of_call) are unauthenticated by default at the URL level — security relies on the path acting as a shared secret plus, for the MCP endpoint, the Bearer credential check on each request. Rotate paths if they leak.

## Telemetry

The n8n instance prunes execution data on a default retention window (n8n env: `EXECUTIONS_DATA_MAX_AGE`). At the time of this writing, the API returns zero historical executions for all 11 workflows — manual test runs were performed during build-out, but their execution records have aged out. There is no production traffic yet (Vapi assistant has no phone number bound).

## Infrastructure detail kept out of this document

n8n workflow IDs, the `<n8n-host>` URL, the MCP webhook path, the end-of-call webhook path, and per-credential ids (Google Calendar OAuth, Airtable token, Discord webhook) are intentionally omitted. They are infrastructure facts, not part of the showcase, and they have no business in a public artifact directory.
