# ADR-009: Keep `phone_number` / `vapi_customer_number` duplication (defer consolidation); harden the phone-lookup gate

- **Date:** 2026-06-01
- **Status:** ✅ Implemented (gate fix) + Accepted (deferral)

## Context

The `customers` table has two phone columns that, in practice, always hold the **same value**:

- `vapi_customer_number` — the telephony caller-ID (`customer.number` from Vapi).
- `phone_number` — the CRM contact number.

They are *semantically* distinct (the number a call arrives from vs. a number to call back on, which can differ — or be absent on the web channel). But the only writer, `create_client` (n8n `APWKFHOa9CTCAuhy`), sets **both columns to the same `normalized_phone || null`**, collapsing the distinction. This raised a fair question: *why two fields with identical data — should the DB be "cleaned up"?*

Running the **full** `client_lookup` workflow (n8n `vi1hXUE81kUG2CIw`) against a row matched by `vapi_customer_number` with a NULL `phone_number` surfaced a **latent bug** (exec `5603`): the `phone_exists?` gate tested `{{ $json.phone_number }}` notEmpty — the wrong signal — so a *found* client routed to `no_number_message` ("There is no such phone number in the CRM").

Audit established the bug was **unreachable in production**:

- `create_client` writes `phone_number` and `vapi_customer_number` together (both equal, or both null) — never divergent.
- `end_of_call` (n8n `dt1SSmnHAb5IOTKz`) only **reads** `customers` (`SELECT id ... WHERE vapi_customer_number = $1`) and writes to `calls` / `consent_log` — never to `customers`.

So no path produces the divergent state; the row that exposed the bug was a hand-seeded mock (`test.phone@example.com`, only `vapi_customer_number`), impossible via the real flow. For real callers, lookup already worked.

## Decision

### Phase 1 — Harden the lookup gate (Implemented)

`client_lookup` → node `phone_exists?`: change the IF condition `leftValue` from `={{ $json.phone_number }}` to `={{ $json.id }}` — gate on *"a row was found"* (the always-present PK), matching the node's intent and mirroring how `email_exists?` works (email is always populated when found). Applied via `update_workflow` + `publish_workflow`.

This removes the latent trap: lookup no longer depends on *which* column carried the match, so any future divergence of the two columns is safe.

### Phase 2 — Keep the duplication; defer consolidation (Accepted)

Do **not** consolidate the two columns for MVP. Two consolidation directions were considered and deliberately deferred (see Non-goals):

- **Collapse** to a single phone column.
- **Develop** the split so the columns can legitimately diverge — either (A) thread `customer.number` through prompt + orchestrator + `create_client`, or (B) backfill the caller-ID in `end_of_call`.

Rationale: the distinction is not needed for MVP (caller-ID *is* the contact in the common case); building it is premature. With the Phase-1 gate fix, the redundancy is harmless. Revisit collapse-vs-develop post-MVP.

## Consequences

### Verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Phase 1 | Re-run `client_lookup` with a `vapi_customer_number`-only match → routes to `client_found` | Revert the `phone_exists?` condition |

Verified: exec `5605` (same pinned input as the failing `5603`) now routes `phone_exists?` → `client_found` ("Client found. Name: Jordan Phillips … customer_id: e0f316f5…"). Active version `7acdc4ac-c857-431a-924c-a5fb8426f588` carries the change (`versionId === activeVersionId`).

### Trade-offs (Non-goals — deliberately not done)

- **Not "developing" the caller-ID vs CRM-contact distinction (options A/B).** Premature for MVP — a distinction with no current consumer; option B also has a chicken-and-egg in `find_customer` (it matches by `vapi_customer_number`, still null on a first call).
- **Not collapsing to one column.** A migration touching read/write paths for purely cosmetic gain mid-MVP; defer.
- **No schema reshape for "readability."** DB readability is a *presentation* concern (a SQL `VIEW` or a dashboard — Supabase Studio / Metabase / Retool), not a reason to alter storage, primary keys (UUIDs stay), or timestamp storage (`timestamptz` UTC; format to Eastern at read time). Also deferred.

## References

- **n8n workflows:** `client_lookup` (`vi1hXUE81kUG2CIw`, node `phone_exists?`), `create_client` (`APWKFHOa9CTCAuhy`, node `upsert_customer` — writes both columns equal), `end_of_call` (`dt1SSmnHAb5IOTKz`, node `find_customer` — reads only).
- **Execution traces:** `5603` (latent bug: `no_number_message`), `5605` (post-fix: `client_found`); `shared_phone_normalize` exec `5602` (`(202) 555-0147` → `+12025550147`).
- **Related:** [ADR-008](008-mvp-acceptance-line.md) (MVP acceptance line — phone path is Evals-only); [ADR-006](006-customer-id-chain-via-prompt.md) (customer_id threading). Phone greet-by-name is covered by the prompt-level Vapi Eval; see [`eval/README.md`](../eval/README.md).
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
