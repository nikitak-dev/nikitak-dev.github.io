# ADR-010: Tool-call fillers come from the LLM, not Vapi tool messages (Haiku cannot be reliably silenced)

- **Date:** 2026-06-24
- **Status:** ✅ Implemented

## Context

Tool calls take real time on voice: the n8n orchestrator round-trips to Postgres / Google Calendar (~1.5–2.5s for `book_event` / `update_event` / `delete_event` / `check_availability`), and native knowledge-base retrieval adds its own latency. Unfilled, that gap reads to the caller as a frozen call. The industry-standard cover is a short bridging filler ("One moment…") spoken into the gap.

That filler can come from one of two sources:

- **The LLM** — instructed by the prompt to speak before/around a tool call.
- **Vapi tool `messages`** — `request-start` / `request-response-delayed`, configured per tool. Deterministic, guaranteed to play, and they spare the LLM-generation latency/cost. The [Vapi prompting guide](https://docs.vapi.ai/prompting-guide) explicitly prefers these over prompting the model: *"This is more reliable than prompting the LLM to acknowledge."*

The governing rule is **single-source**: the filler must come from exactly one of those, or the caller hears it twice (a collision).

Model in production: **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`), chosen for latency (~0.7s TTFT) and cost, with the prompt tuned to Anthropic practice.

We attempted the platform-canonical path: suppress the LLM filler via the prompt (`<tool_calling>`: "Make each tool call silently"; `<voice_and_style>`: open each turn on its substance) **and** cover dead air with Vapi deterministic messages — `request-start` + `request-response-delayed` on `search_knowledge_base`, server-level `request-response-delayed` on the orchestrator.

The empirical result (call `019efb22-44ae-7447-bd2a-dc29d267e57f`, 2026-06-24, Haiku 4.5, **with the updated prompt pasted in**): the LLM **still emits a stall filler before every tool call**, regardless of the "silent" instruction. With Vapi messages also active, every slow tool produced a **double** filler:

- `book_event` → LLM *"Give me a moment."* + Vapi *"Just one moment, please."*
- `search_knowledge_base` → LLM *"Let me get that for you."* + Vapi *"Let me check that for you."*
- `update_event`, `delete_event`, `client_lookup` → same LLM-then-Vapi collision.

This is the third-plus live test confirming Haiku ignores "make each tool call silently." Per systematic-debugging discipline, 3+ failed attempts at the same fix means the **architectural assumption is wrong** (a silent LLM), not the wording. The single-source principle still holds — but the suppressible side is Vapi, not the LLM.

One thing did work: reframing `<voice_and_style>` from *"reach for a fresh acknowledgement each turn"* (which yielded an **announcement + a stall** = two LLM phrases) to *"open each turn on its substance"* collapsed the LLM to **one short filler** per tool. So the LLM, on its own, is now a well-behaved single source.

## Decision

Make the **LLM the single filler source**; remove the Vapi filler messages.

### Live tool config (via REST PATCH, read-modify-write to preserve `server`)

- **`search_knowledge_base`** (`4198fa40-b458-4545-9266-18b23def0bfb`, `type: query`): `messages` = `[request-failed]` only (*"I am having trouble pulling that up right now."*). `request-start` + `request-response-delayed` removed. `request-failed` fires only on error, so it never collides.
- **`n8n_orchestrator`** (`ede5d872-a2ef-45de-9de8-1794616b2cc0`, `type: mcp`): `messages` cleared to `[]`. The `server` block (`url`, `timeoutSeconds`, `headers`, `credentialId`, `staticIpAddressesEnabled`) was re-sent in the PATCH and preserved — auth rides on `credentialId` (a reference, not a plaintext secret), so the round-trip is safe.

### Prompt support ([`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md))

- `<voice_and_style>`: *"Open each turn on its substance — the answer, the question, or the next step…"* (replaced the per-turn acknowledgement obligation). This is what reduces the LLM to one filler.
- `<tool_calling>`: kept *"Make each tool call silently and go straight to it — let the result be the next thing you say."* as a restraining force (it keeps the filler short). Removed the now-false line *"A spoken acknowledgement for a slow step is handled automatically outside your turn"* — nothing handles it externally anymore.

## Consequences

### Verification gate

| Gate | Criterion | If fail |
|---|---|---|
| Tool config | `search_knowledge_base.messages` = `[request-failed]`; `n8n_orchestrator.messages` = `[]` with `server` intact (`credentialId` present) | Re-PATCH from the saved tool JSON |
| Next live call | Each tool shows **one** filler (LLM), no LLM+Vapi pair; no dead air | Re-open the filler architecture |

Tool config verified live (GET after PATCH): search_KB carries only `request-failed`; orchestrator `messages` empty, `server` present with all five keys. Behavioural gate confirmed at the source on call `019efb22…`, where the fast tools (no Vapi message) already showed a single clean LLM filler.

### Trade-offs (Non-goals — deliberately not done)

- **Not keeping Vapi deterministic messages.** They are the platform-recommended, guaranteed, cheaper filler — but only when the LLM is silent. Haiku is not, so they are pure redundancy that re-creates the collision.
- **Not investing more prompt effort to silence Haiku.** 3+ live tests show "make each tool call silently" is ignored. Further wording is low-yield, and an earlier `<tool_calling>` rewrite with filler-plus-stage-direction examples caused a worse regression (the model *narrated* tool calls instead of invoking them).
- **Not switching to a more instruction-obedient model.** Sonnet 4.6 would honour "silent" and quote pricing more precisely, but was rejected on latency (~2.3s pipeline) and cost ($0.22/min). See [`constraints.md`](../constraints.md).

### Revisit condition

If we adopt a model that reliably honours "make each tool call silently" (Sonnet-class), the Vapi deterministic messages become preferable again (guaranteed play, no LLM-gen cost): re-add `request-start` / `request-response-delayed` and keep the LLM silent. Until then, LLM-single-source stands.

## References

- **Vapi tools:** `search_knowledge_base` (`4198fa40-…`, query), `n8n_orchestrator` (`ede5d872-…`, mcp, protocol `shttp`).
- **Call trace:** `019efb22-44ae-7447-bd2a-dc29d267e57f` (2026-06-24, Haiku 4.5) — LLM+Vapi double filler on every slow tool.
- **Prompt:** [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — `<voice_and_style>`, `<tool_calling>`.
- **Standing constraints:** [`constraints.md`](../constraints.md) (entries on Haiku silence, KB self-retrieval, model latency/cost).
- **Related:** [ADR-002](002-mcp-orchestrator-single-tool.md) (single MCP orchestrator — why per-operation fillers weren't an option).
- **External:** [Vapi Prompting Guide](https://docs.vapi.ai/prompting-guide); [Daily.co — Benchmarking LLMs for Voice Agents](https://www.daily.co/blog/benchmarking-llms-for-voice-agent-use-cases/) (deterministic frameworks supplement, not replace, model behaviour).
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).