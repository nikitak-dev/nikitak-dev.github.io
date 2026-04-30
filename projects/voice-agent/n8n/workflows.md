# n8n — workflows

The n8n side of voice-agent runs as one MCP-routed orchestrator plus seven tool sub-workflows, one webhook for end-of-call reporting, and two error handlers that fan out to Discord. All workflows live on the self-hosted instance at `<n8n-host>`.

## Workflow inventory

| Workflow | Type | Status | Role |
|---|---|---|---|
| `orchestrator` | MCP trigger | active | Single entry point for `n8n_fixr` calls from Vapi. Routes to the correct tool sub-workflow based on the requested action. |
| `client_lookup` | sub-workflow | active | Look up a customer in Airtable by email or phone. Returns CRM name + customer record ID, or a not-found marker. |
| `create_client` | sub-workflow | active | Create or update a customer in Airtable. Phone number is normalized to E.164 in a Code node before write. |
| `check_availability` | sub-workflow | active | Read busy slots from Google Calendar for a given date range. |
| `book_event` | sub-workflow | active | Create an event in Google Calendar **and** an `appointment_logs` record in Airtable. Pre-checks GCal for duplicates on `(start_time, email)` before creating — booking is idempotent. |
| `event_lookup` | sub-workflow | active | List a customer's upcoming events from Google Calendar (used by reschedule/cancel flows). |
| `update_event` | sub-workflow | active | Move an existing event to a new time in Google Calendar and flip the `appointment_logs` status to `rescheduled`. |
| `delete_event` | sub-workflow | active | Delete a Google Calendar event and flip the `appointment_logs` status to `canceled`. |
| `end_of_call` | webhook | active | Receives Vapi's end-of-call report and writes a `call_logs` record to Airtable (summary, outcome, cost, customer link). |
| `tools_error_handler` | error handler | active | Catches failures inside tool sub-workflows. Sends Discord alert; instructs the LLM to apologize and offer a callback. |
| `external_error_handler` | error handler | active | Catches failures in non-tool triggers (e.g. `end_of_call`). Sends Discord alert. |

`orchestrator` exposes the seven tool sub-workflows (`client_lookup`, `create_client`, `check_availability`, `book_event`, `event_lookup`, `update_event`, `delete_event`) as `toolWorkflow` nodes — Vapi sees them through the single `n8n_fixr` tool description and picks the right action by argument shape.

## Call flow

```
Vapi (n8n_fixr) ──► orchestrator (MCP)
                       │
                       │ Identification
                       ├──► client_lookup       (Airtable read)
                       └──► create_client       (Airtable write, E.164 normalize)
                       │
                       │ Booking
                       ├──► check_availability  (GCal read)
                       └──► book_event          (GCal write + Airtable write, idempotent)
                       │
                       │ Reschedule / Cancel
                       ├──► event_lookup        (GCal read)
                       ├──► update_event        (GCal write + Airtable status update)
                       └──► delete_event        (GCal delete + Airtable status update)

Vapi end-of-call report ──► end_of_call webhook ──► Airtable call_logs
                                                        │
Any tool error ──► tools_error_handler ──► Discord
External trigger error ──► external_error_handler ──► Discord
```

## External services per workflow

- **Google Calendar:** `check_availability`, `book_event`, `event_lookup`, `update_event`, `delete_event`.
- **Airtable:** `client_lookup`, `create_client`, `book_event`, `update_event`, `delete_event`, `end_of_call`.
- **Discord:** `tools_error_handler`, `external_error_handler`.

## Conventions

- Every tool sub-workflow has a try-catch wrapper. Failures route to `tools_error_handler` and return an LLM-friendly error message Sophie can speak (no exception leaks to the caller).
- Input validation lives in `IF` nodes at the entry of `book_event` and `create_client`, plus `fallbackOutput` on `client_lookup` for the not-found case.
- All n8n workflow IDs and the `<n8n-host>` URL are kept out of the public artifacts on purpose — they are infrastructure detail, not part of the showcase.
