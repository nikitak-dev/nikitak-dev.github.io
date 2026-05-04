# ADR-001: Callback offer instead of live call transfer for out-of-scope requests

- **Date:** 2026-03-12
- **Status:** ✅ Implemented

## Context

Sophie regularly hits requests outside the booking-flow scope: large commercial projects (>$25k), billing complaints, on-site project questions, employment / legal queries. The default voice-receptionist instinct is to offer a live transfer — Vapi exposes a `transferCall` tool with multiple destinations.

Three forces pushed against live transfers in this MVP:

1. **No human staffing on the receiving end during voice testing.** GreenScape is a fictional test case; there is no commercial team standing by a phone. A "transfer" would dump the caller to dead air or voicemail — worse than a clear offer to call back.
2. **Vapi `transferCall` adds latency and ambiguity.** SIP / cold-transfer setup costs 2–5 s; warm-transfer requires dual-leg orchestration and per-destination configuration. For a portfolio MVP that hasn't validated the receiving infrastructure, complexity vs benefit is poor.
3. **Caller experience.** "Someone will call you back within X" is a definite, controllable promise; "transferring you now" can fail silently, drop the call, or hand off without context.

## Decision

Sophie does **not** attempt live call transfers. Out-of-scope requests are routed via a callback offer:

> "I can have the right person from our team call you back about that. Would that work?"

Three callback categories are encoded in the system prompt's `[Callback Routing]` section ([`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md), section 8):

- **Commercial team** — projects > $25k, commercial contracts.
- **Operations team** — scheduling conflicts, billing, complaints, employment, legal.
- **Field team** — on-site project questions.

After caller assents:

1. Sophie confirms the phone number on file.
2. Sophie says: "Great, someone will reach out to you shortly."
3. Conversation continues or wraps up naturally.

The intent is captured implicitly via Vapi's `analysisPlan` — the call ends in `calls` with `outcome = 'callback_promised'` and the agreed phone number lives in the transcript. There is no separate callback-queue workflow yet (see Trade-offs).

## Consequences

### What this earns

- No cold-transfer dead-air UX failures.
- No SIP / dual-leg orchestration to maintain.
- Single end-of-call analysis path — `outcome` enum captures the resolution category cleanly.
- Caller leaves with a definite expectation, not an in-progress transfer that may fail.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Prompt deploy | Sophie offers callback (not transfer) on commercial / operations / field requests | Verify `[Callback Routing]` section is present in the live Vapi assistant |
| End-of-call data | `calls.outcome` populated with `callback_promised` for callback flows | Inspect `analysisPlan` Structured Output UUID mapping in `extract_call_data` |

### Trade-offs (Non-goals — deliberately not done)

- **No outbound callback automation.** The callback is a verbal promise; nobody is actually called back automatically. Acceptable for an MVP without a real customer base; for production, a follow-up workflow is needed.
- **No dynamic destination routing.** Three categories are hard-coded in the prompt. A real deployment would source them from CRM / org config.
- **No SLA on callback timing.** "Shortly" is intentionally vague. Production needs a written SLA per category.

## References

- [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — sections `[Callback Routing]` and `[Error Handling]` (callback as fallback on tool failure).
- [`db/migrations/00001_init_voice_agent_schema.sql`](../db/migrations/00001_init_voice_agent_schema.sql) — `calls.outcome` enum includes `callback_promised`.
- [`CHANGELOG.md`](../CHANGELOG.md) — "Callback offers replaced live transfers" entry under the 2026-03 callback flow.
- No `transfer_call` tool is exposed to Sophie; this decision is enforced entirely in the system prompt.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
