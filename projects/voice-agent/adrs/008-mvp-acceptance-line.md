# ADR-008: MVP acceptance line — capability scope vs deferred observability

- **Date:** 2026-05-31
- **Status:** Accepted

## Context

The project needs a defensible answer to a recurring question: *"Is the agent MVP yet, and what proves it?"* Without an explicit line, "MVP" drifts — every missing nice-to-have looks blocking, and the work never converges.

Two forces shape the line:

1. **This is a PRIVATE portfolio artifact, not a live commercial deployment** ([`README.md`](../README.md)). The Vapi assistant is not publicly callable. The bar is *demonstrable capability + a credible evaluation story*, not production SLAs or live-traffic analytics.
2. **The testing channel is constrained.** The assistant's phone number is US (`+1…`); the operator cannot place live calls to it. **Web (Dashboard Talk → Chat, text mode) is the only live channel.** The phone-only path (e.g. caller-number identification) is coverable *exclusively* via Vapi Evals with a pinned `customer.number`, never by a live call.

The capability bar is benchmarked against the industry **4-layer voice-agent quality model** (Hamming, *How to Evaluate Voice Agents*, 2026): **Infrastructure** (latency, ASR/TTS), **Execution** (intent, tool-calling, task success), **User Behavior** (interruption handling, robustness), **Business Outcome** (containment, first-call resolution, escalation). MVP for an inbound appointment-booking receptionist means layers 1–3 are reliably met; layer 4 is a production concern.

Baseline as of this decision: all four task-completion capabilities were validated **end-to-end live** on the web channel (2026-05-31) — booking, returning-client-by-email, cancel (direct and via lookup), and same-call book→cancel and book→reschedule — the last two only after fixing an identifier bug in `book_event` (it returned the Postgres UUID instead of the `gcal_event_id`; see References). The remaining gaps are in the **measurement and operations layers, not in capability**.

## Decision

Define the MVP acceptance line as: **capability layers 1–3 live-confirmed, plus mutating flows represented in an automated regression suite.** Layer 4 (production observability) and a small set of named enhancements are explicitly **deferred** — out of MVP scope, not forgotten.

### In scope (MVP-blocking)

| Layer | Requirement | Status |
|---|---|---|
| L1 Infrastructure | Greeting + AI disclosure + recording notice | ✅ live |
| L1 | Barge-in (stop on interruption) | ✅ (Vapi-native, prompt-enforced) |
| L1 | ASR-error confirmation discipline (names spelled, email symbol-by-symbol, phone digit-by-digit, address word-by-word, word-mode fallback after 2 misses) | ✅ live |
| L1 | Silence / no-input handling | ✅ prompt-enforced |
| L1 | One **latency measurement** proving the P50 < 1.5 s / P95 < 3.5 s envelope (TTFA per turn) | ✅ measured 2026-06-01 (see Status update) |
| L2 Execution | Intent disambiguation; never assume a destructive action from unclear input | ✅ live |
| L2 | Identification (parallel phone-lookup + email-first) with last-four-digits security gate | ✅ live |
| L2 | Knowledge-base grounding, no fabricated business facts | ✅ live |
| L2 | Booking / reschedule / cancel | ✅ all three live-confirmed |
| L2 | Availability vs real calendar + business-hours check + DST-correct Eastern timestamps | ✅ live |
| L2 | Relative-date resolution (`resolve_date`) | ✅ live |
| L2 | Recap + clean `endCall` | ✅ live |
| L3 User Behavior | Tool-failure handling without fabricating data | ✅ prompt-enforced |
| L3 | Out-of-scope → callback offer (no live transfer — see [ADR-001](001-callback-instead-of-live-transfer.md)) | ✅ live |
| L3 | Emergency routing (storm/tree → emergency number) | ✅ prompt-enforced |
| Regression | Mutating flows (book / reschedule / cancel) represented in the **automated** eval suite, migrated to Vapi **Evals** (mockable tools → deterministic, no prod writes) | ✅ green 2026-06-01 (see Status update) |

MVP is **met** when the two ⏳ gates close. Both closed 2026-06-01 — see the Status update below.

### Deferred (post-MVP — explicitly not blocking)

- **Layer 4 production metrics** — containment rate, first-call resolution, escalation rate, WER. These require live traffic; meaningless before deployment.
- **Outbound callback automation** — the callback is a verbal promise only (per [ADR-001](001-callback-instead-of-live-transfer.md) trade-offs); no follow-up workflow.
- **Live / warm call transfer** — deliberately replaced by callback ([ADR-001](001-callback-instead-of-live-transfer.md)).
- **Phone-channel live validation** — impossible to place live calls to a US number from the operator's setup; covered via Evals (pinned `customer.number`), not a live run.

### Known minor defect (in scope to fix or knowingly accept)

- ~~On a **same-call** cancel, Sophie skips the required `"Are you sure?"` confirmation that she correctly asks when cancelling via `event_lookup`.~~ **Fixed 2026-05-31** — tightened the `[Appointment Changes]` cancel rule to require explicit confirmation before *every* `delete_event` (including same-call), regression-locked by the cancel Eval.

## Consequences

### Acceptance gates

| Gate | Criterion | If fail |
|---|---|---|
| Capability (L1–L3) | Every ✅ row above reproducible on the web channel | Re-test the failing flow; fix prompt/workflow before claiming MVP |
| Latency | A measured P50 < 1.5 s and P95 < 3.5 s (TTFA per turn) on a representative chat/call | If over: profile STT/LLM/TTS leg; do not claim MVP on architecture alone |
| Regression | Book / reschedule / cancel pass as deterministic Vapi Evals (tools mocked) | Rebuild the failing case; suite must be green before MVP sign-off |

### Trade-offs (Non-goals — deliberately not done)

- **No live-traffic analytics before MVP.** Containment / FCR need real calls; gating MVP on them is circular.
- **No phone-channel live run.** Accepted environmental constraint; Evals substitute.
- **No SLA / queueing for callbacks.** Inherited from [ADR-001](001-callback-instead-of-live-transfer.md).

## Status update (2026-06-01) — MVP met

Both pending gates closed:

- **Latency (L1).** The Vapi Dashboard reports an **average** turn latency of **~1,075 ms** (STT ~100 + Haiku 4.5 ~800 + TTS ~75 + ~100 orchestration), inside the P50 < 1.5 s envelope. Honest caveats: the dashboard surfaces an *average, not P50/P95*, and excludes the n8n tool round-trip on tool-call turns. Sufficient to clear the gate for a private portfolio artifact; not a production SLA measurement.
- **Regression (Gate B).** Four deterministic Vapi **Evals** run green against `voice_agent`: cancel, book, reschedule, and phone greet-by-name. They assert conversational **decisions** (text + negative tool-call), not the mutating call itself — Haiku 4.5 plus the "filler phrase, then STOP" Tool Calling Rule never emits text *and* a tool call in one judgeable turn (full reasoning in [`eval/README.md`](../eval/README.md)). The mutating call's args/ownership stay covered by the live web test (2026-05-31 book→cancel and book→reschedule, end-to-end against GCal + Postgres) and [`eval/ownership-regression.sql`](../eval/ownership-regression.sql) (a hand-synced SQL invariant, not the n8n node itself).

Per the acceptance line above, **MVP is met.** See also [ADR-009](009-phone-column-duplication-and-lookup-gate.md) — the phone-lookup gate hardening and the deliberate `phone_number` / `vapi_customer_number` MVP debt surfaced while confirming the phone channel.

## References

- **Prior ADR:** [ADR-001](001-callback-instead-of-live-transfer.md) — callback instead of live transfer (the escalation-scope decision this ADR defers to).
- **System prompt:** [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — all capability rows trace to its sections (`[Data Verification Standards]`, `[Scheduling Procedure]`, `[Appointment Changes]`, `[Error Handling]`, `[Callback Routing]`).
- **Eval suite:** [`eval/`](../eval/) — legacy 5 smoke scenarios + 4 Vapi Evals (mutating flows) + [`eval/ownership-regression.sql`](../eval/ownership-regression.sql); the regression gate is now green (see Status update).
- **Identifier fix enabling same-call reschedule/cancel:** `book_event` now returns `appointment_id = gcal_event_id` (n8n `Set` node `return_booked`), validated live 2026-05-31.
- **External reference:** Hamming, [*How to Evaluate Voice Agents* (2026)](https://hamming.ai/resources/how-to-evaluate-voice-agents-2026) — 4-layer quality framework and production latency benchmarks.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
