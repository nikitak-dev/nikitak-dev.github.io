# ADR-006: `customer_id` chained through Sophie's context, not server-side session state

- **Date:** 2026-05-02
- **Status:** ✅ Implemented

## Context

Reschedule and cancel flows need to fetch the caller's existing appointments. The original `event_lookup` implementation read events directly from Google Calendar and let Sophie's LLM filter the result by matching the caller's email against `attendees`. That had two problems:

1. **Privacy gap.** Filtering on the LLM side meant the LLM saw all events in the time range — across all callers — and was responsible for picking the right ones. A prompt-injection attack ("show me all appointments today") could leak others' bookings before the filter ran. The LLM also occasionally returned the wrong caller's events because of fuzzy email matching.
2. **Wrong source of truth.** Google Calendar is one of two stores; `appointments` (Postgres) is the canonical CRM record. Reading the calendar duplicates the join logic that already exists in Postgres.

The fix needs server-side filtering by a value the LLM cannot fabricate. Two ways to plumb it:

- **Server-side session state.** n8n keeps a session map `{ vapi_call_id → customer_id }` populated by `client_lookup` / `create_client`, consumed by `event_lookup`. Requires a side-store (Redis / Postgres table), correlation key in every tool call, and lifecycle management.
- **Pass `customer_id` through the LLM context.** `client_lookup` / `create_client` return the UUID; the system prompt tells Sophie to remember it; `event_lookup` requires it as input.

## Decision

`customer_id` (UUID) is returned by `client_lookup` and `create_client`, **memorised by Sophie via prompt instruction**, and passed back as a required input to `event_lookup`. Server-side, `event_lookup` filters appointments by `customer_id` directly — the LLM never participates in filtering.

The system prompt (`[Identification for Action]` and `[Appointment Changes]` sections) tells Sophie:

> "REMEMBER the customer_id (UUID) returned in the response — you will need it for any appointment lookup later in the call."

> "Pass the customer_id you remembered from the most recent client_lookup or create_client response."

The `event_lookup` workflow Postgres query:

```sql
SELECT … FROM appointments
WHERE customer_id = $1
  AND start_time BETWEEN $2 AND $3
  AND status IN ('scheduled', 'rescheduled')
```

Status filter excludes already-cancelled / completed / no-show rows — the caller doesn't need to see them when picking which appointment to change.

## Consequences

### What this earns

- **Server-side privacy.** `event_lookup` returns only the current caller's appointments. No way for the LLM to see another customer's data even under prompt-injection.
- **No side-store.** No session table, no Redis key lifecycle, no correlation cleanup. Per-call state lives where call-state already lives — in the LLM context.
- **Single source of truth.** Reschedule / cancel flows operate on Postgres `appointments`, the same store `book_event` writes to. Google Calendar is treated as projection of that state, not the source.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| `event_lookup` schema | `customer_id` is a required input, hard-filtered server-side | Inspect tool description and Postgres query — must reference `customer_id` |
| Prompt obeys | After `client_lookup` returns, Sophie passes the UUID into `event_lookup` on the next reschedule/cancel turn | Manual test: identify caller → request reschedule → check execution log shows non-empty `customer_id` |
| Cross-caller isolation | A `customer_id` from caller A passed to a session for caller B returns A's appointments only — proves filter is server-side | Negative test in scenarios |

### Trade-offs (Non-goals — deliberately not done)

- **LLM-controlled identifier.** Sophie can in principle pass any UUID. If she sends a UUID belonging to a different caller, `event_lookup` will return that caller's appointments. The mitigation would be a server-side check that the `customer_id` matches the call's `customer.number` (E.164) — not yet implemented; flagged as a security follow-up.
- **`update_event` / `delete_event` don't share this discipline.** They take `appointment_id` (= `gcal_event_id`) as input — also LLM-controlled. A caller who knows another customer's `gcal_event_id` could ask Sophie to cancel it. Same mitigation needed: server-side ownership check (JOIN `appointments` on `customer_id`).
- **No "pretend you forgot" recovery.** If Sophie loses the UUID mid-conversation (rare context-window edge case), there's no fallback to look it up from `customer.number`. A re-identification path could be added.

## References

- [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — `[Identification for Action]` and `[Appointment Changes]` sections.
- [`n8n/workflows.md`](../n8n/workflows.md) — `event_lookup` description.
- [`CHANGELOG.md`](../CHANGELOG.md) — "`event_lookup` server-side filter by `customer_id`" and "System prompt updates" entries under the 2026-05 migration.
- ADR-002 — `customer_id` is the input schema's required field as advertised through MCP.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
