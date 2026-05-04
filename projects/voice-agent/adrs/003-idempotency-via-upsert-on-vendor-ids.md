# ADR-003: Idempotency on retries via UPSERT keyed by vendor IDs

- **Date:** 2026-05-01
- **Status:** ✅ Implemented

## Context

Two retry paths can produce duplicate Postgres rows:

1. **Vapi `end-of-call-report` webhook retries.** Vapi retries on non-2xx responses. Without dedup, a slow Postgres write or a flaky n8n response can produce two `calls` rows for one phone call — splitting transcript, costs, and analysis across rows that look like two distinct conversations.
2. **Race condition on `book_event`.** Sophie can call `book_event` twice in quick succession (e.g. caller says "book it" mid-confirmation, LLM treats both as fresh tool calls). Without dedup, both succeed → two Google Calendar events at the same time + two `appointments` rows pointing at distinct `gcal_event_id`s.

Both are real. Webhook retries are guaranteed by Vapi's delivery contract; double-tool-call has been observed in test scenarios.

## Decision

Idempotency is enforced at the Postgres layer using **UPSERT (`INSERT ... ON CONFLICT DO UPDATE`)** keyed by vendor-side identifiers that are guaranteed unique:

| Table | Conflict key | Vendor producing the value |
|---|---|---|
| `calls` | `vapi_call_id` (UNIQUE NOT NULL) | Vapi assigns one UUID per call lifecycle |
| `appointments` | `gcal_event_id` (UNIQUE NOT NULL) | Google Calendar assigns one ID per created event |

Concretely:

- **`end_of_call.create_record`** (n8n workflow `end_of_call`, node `create_record`) — Postgres `upsert` operation, `matchingColumns: [vapi_call_id]`. Webhook retry → second call hits the UNIQUE constraint → ON CONFLICT DO UPDATE refreshes the row with whatever fields shifted (e.g. summary text the analysis pipeline finalised after the first POST).
- **`book_event.upsert_record`** (n8n workflow `book_event`) — Postgres `upsert`, `matchingColumns: [gcal_event_id]`. Pre-step is a GCal availability check that looks up an existing event in `start_time .. start_time+5min` for the caller's email; if found, returns the existing event ID without creating a new GCal event. The Postgres UPSERT on the same `gcal_event_id` then becomes a no-op.

**Why vendor IDs.** Vendor IDs are the only **guaranteed-unique** values present at the moment of write. Using our own UUIDs would not protect us — Vapi could retry with the same payload, our PRIMARY KEY would be a fresh UUID each time, no conflict raised. Vendor IDs travel with the payload, so the same physical event (call / booking) always produces the same conflict key.

## Consequences

### What this earns

- **At-most-one row per real-world event.** Whether Vapi retries 1 or 5 times, exactly one `calls` row exists per `vapi_call_id`. Whether Sophie's LLM double-fires `book_event`, exactly one `appointments` row exists per `gcal_event_id`.
- **Self-healing on partial writes.** If the first webhook write was missing a field (e.g. analysis hadn't completed yet), the retry writes the now-complete payload and the row gets updated.
- **No application-side deduplication.** No "have we seen this call_id?" lookups. The UNIQUE constraint enforces correctness.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Schema migration | `vapi_call_id` UNIQUE NOT NULL on `calls`; `gcal_event_id` UNIQUE NOT NULL on `appointments` | Re-apply [`db/migrations/00001_init_voice_agent_schema.sql`](../db/migrations/00001_init_voice_agent_schema.sql) |
| n8n write nodes | Both write nodes use Postgres `upsert` operation, not `insert` | Inspect node config; `matchingColumns` must reference the UNIQUE column |
| Manual idempotency test | `SELECT vapi_call_id, COUNT(*) FROM calls GROUP BY vapi_call_id HAVING COUNT(*) > 1` returns zero rows after burst | If non-zero — UPSERT misconfigured or `matchingColumns` wrong |

### Trade-offs (Non-goals — deliberately not done)

- **No idempotency on `customers`.** `client_lookup` / `create_client` use `customers.email` (UNIQUE via `LOWER(email)` functional index) for dedup, but they're not retry targets — Vapi doesn't retry them, and Sophie won't double-create the same client in one turn.
- **No event-id provenance tracking.** We don't record which retry write a given column originated from. If Vapi retries 5 times and field X drifted between retries, we keep only the last write. Acceptable — analysis fields stabilise across retries.
- **No protection against semantic mismatch on retry.** If Vapi sends materially different payloads under the same `vapi_call_id`, the second wins. The `extract_call_data` Code node has a `try/catch` minimal-fallback so the first write always lands; the second-write upgrade is an intentional benefit of UPSERT semantics.

## References

- [`db/migrations/00001_init_voice_agent_schema.sql`](../db/migrations/00001_init_voice_agent_schema.sql) — UNIQUE constraints on `calls.vapi_call_id` and `appointments.gcal_event_id`.
- [`n8n/workflows.md`](../n8n/workflows.md) — `end_of_call` and `book_event` workflows, idempotency notes in "Conventions and shared settings".
- [`tests/scenarios.md`](../tests/scenarios.md) §10 "Double booking attempt (idempotency)" + post-test checklist invariant.
- [`CHANGELOG.md`](../CHANGELOG.md) — "Idempotent booking" (2026-02) and "Idempotency on retries" (2026-05) entries.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
