# ADR-005: Postgres writes via `upsert` operation to avoid n8n's `executeQuery` comma-split bug

- **Date:** 2026-05-01
- **Status:** ✅ Implemented

## Context

Mid-migration from Airtable to Supabase Postgres, the `book_event` sub-workflow started silently truncating addresses. A booking for *123 Main Street, Saint Petersburg, FL* would land in Postgres as just `123 Main Street`. Closer inspection revealed the same pattern in transcripts (cut at the first comma) and in customer names like `Smith, John`.

Root cause: the n8n Postgres node's `executeQuery` operation does a **literal comma-split** on the resolved `queryReplacement` string. When a single parameterised query has multiple values supplied via `queryReplacement: "{{ $json.a }},{{ $json.b }},{{ $json.c }}"`, n8n splits the string on `,` to produce the parameter array — but it does that *after* template resolution, so a comma inside a value (an address, a transcript, `Smith, John`) becomes an extra parameter and the rest of the value is silently dropped.

Three options:

1. **Escape commas before template resolution.** Wrap every value in `replace(/,/g, '\\,')` Code nodes. Pollutes every workflow and is easy to forget.
2. **Use a single `$1`-parameterised query and a single value.** Works for SELECTs with one parameter, fails for INSERTs / UPSERTs with many columns.
3. **Use n8n's Postgres `upsert` operation with explicit per-column expressions.** The node sends each column value as its own bound parameter — no string concatenation, no comma-split.

## Decision

All write paths to Postgres use the n8n Postgres node's **`upsert` operation** with `mappingMode: defineBelow` and explicit per-column expressions. The `executeQuery` operation is reserved for SELECTs that take at most one parameter.

Concretely:

| Workflow | Node | Operation | Why |
|---|---|---|---|
| `create_client` | `upsert_customer` | `upsert` | Customer name / email may contain commas (`Smith, John`, `mailto: a, b`) |
| `book_event` | `upsert_record` | `upsert` | Addresses contain commas |
| `end_of_call` | `create_record` | `upsert` | Transcripts contain commas |
| `client_lookup` | `find_customer` | `executeQuery` | Single-parameter SELECT (email or phone) — safe |
| `update_event` / `delete_event` | various | `executeQuery` | Multi-parameter, but values are GCal IDs / timestamps (no commas) — safe by accident |

The `upsert` operation also subsumes idempotency (see ADR-003) — `matchingColumns` defines the conflict key, ON CONFLICT DO UPDATE refreshes the row.

## Consequences

### What this earns

- **No data loss on commas.** Addresses, transcripts, names with commas are written intact.
- **Idempotency for free.** `matchingColumns` doubles as the dedup key.
- **Per-column type safety.** n8n's `upsert` mapping respects each column's declared type (text, jsonb, timestamptz, boolean, integer); `executeQuery` flattens everything to text.
- **Explicit schema in the node.** The mapping in the `upsert` node lists every column we write — easier to audit than reading SQL.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Workflow audit | Every write to `customers` / `calls` / `appointments` uses `upsert` operation | Inspect each Postgres node; convert `executeQuery` → `upsert` |
| Comma test | Create a customer named `Smith, John` and a booking at an address with two commas | Both must round-trip from Postgres unchanged. If truncated — node config wrong |
| Idempotency overlap | UPSERT `matchingColumns` aligns with the UNIQUE constraint on the table (see ADR-003) | If misaligned — duplicate rows possible despite UPSERT semantics |

### Trade-offs (Non-goals — deliberately not done)

- **`archive_recording.update_calls` still uses `executeQuery` with three parameters via comma-split.** Currently safe (parameters are `vapi_call_id`, file size integer, `vapi_call_id` again — no commas), but the pattern persists. A follow-up should migrate it to `upsert` or `$1`/`$2`/`$3` parameterisation.
- **No `executeQuery` lint rule.** Nothing automatically flags `executeQuery` with multi-parameter `queryReplacement`. Discipline relies on this ADR + code review.
- **Bug is n8n-side, unfixed upstream.** This decision works around it; if n8n fixes the comma-split semantics, the `upsert` choice still stands (it's the better option anyway), but `executeQuery` becomes safer.

## References

- [`n8n/workflows.md`](../n8n/workflows.md) — "Conventions and shared settings" section: Postgres write operations.
- [`CHANGELOG.md`](../CHANGELOG.md) — "Comma-safe Postgres writes via `upsert` operation" entry under the 2026-05 migration.
- ADR-003 (idempotency via UPSERT on vendor IDs) — the `matchingColumns` choice in this ADR.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
