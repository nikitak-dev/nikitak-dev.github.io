# Constraints — why the agent behaves the way it does

A living register of **standing model and platform limits** discovered empirically while building the GreenScape voice agent. Where an ADR records a *decision at a point in time*, this file records the *facts that keep shaping many decisions* — the quick answer to "why does Sophie do that?"

Each entry: the constraint, the evidence that established it, the impact, and the mitigation (with a link to the ADR that acted on it, where one exists). Add a row when a new limit is confirmed by a trace, not by a hunch.

---

## C-1 · Haiku 4.5 does not stay silent before tool calls

- **Constraint:** The model speaks a stall filler before nearly every tool call, regardless of an explicit `<tool_calling>` instruction to "make each tool call silently."
- **Evidence:** Calls across 3+ sessions; most recently `019efb22-…` (2026-06-24) with the silence-tuned prompt active — still one LLM filler per tool.
- **Impact:** Deterministic Vapi tool `messages` cannot be layered on top without a double filler (collision). The platform-recommended filler mechanism is unusable here.
- **Mitigation:** Make the LLM the single filler source; remove Vapi filler messages. `<voice_and_style>` is tuned so that single filler stays short (one phrase, not "announcement + stall"). → **[ADR-010](adrs/010-llm-fillers-not-vapi-tool-messages.md)**

## C-2 · Haiku ignores a rule even when the fact is in the tool result

- **Constraint:** The model can contradict an explicit prompt rule *and* the data it was just handed.
- **Evidence:** Call `019efb22-…` — for lawn mowing (a **fixed-price** service) Sophie said *"our team can give you specifics when they visit,"* although the `search_knowledge_base` result it received states *"No on-site estimate needed,"* and `<service_matching>` reserves visit language for estimate-priced services.
- **Impact:** Fixed-vs-estimate phrasing slips occasionally; pricing wording is best-effort, not guaranteed.
- **Mitigation:** Prompt reinforcement is low-yield on Haiku. Correctness-critical behaviour is enforced in the backend instead (see C-6), and pricing copy is accepted as best-effort. The conflicting `<core_operating_rules>` ↔ `<service_matching>` pricing instruction was reconciled regardless (clean prompt hygiene).

## C-3 · Vapi's native KB (query) tool builds its own retrieval

- **Constraint:** `search_knowledge_base` (`type: query`) does not accept a caller-defined query string; it retrieves from the named knowledge base on its own.
- **Evidence:** Call `019efb22-…` — invoked with `args = {"knowledgeBaseNames": ["greenscape_kb"]}`, no query field.
- **Impact:** There is no per-call lever to narrow a result, so an answer can lump distinct sub-ranges together (e.g. "fifty to three hundred dollars" merging weekly, bi-weekly, and one-time tiers).
- **Mitigation:** Retrieval quality lives in the **KB file structure**, not the call — each chunk self-identifies (Anthropic Contextual Retrieval pattern) so the returned block is already scoped. No query-parameter approach.

## C-4 · Vapi MCP tool messages are server-level only

- **Constraint:** An MCP tool exposes many operations behind one tool; its `messages` apply to **all** operations, not per-operation.
- **Evidence:** `n8n_orchestrator` exposes 8 operations (`resolve_date`, `client_lookup`, … `delete_event`) under a single MCP tool; Vapi has no per-operation message slot.
- **Impact:** A single filler would fire on fast operations (`resolve_date`) as well as slow ones — monotone if always-on, or (with `request-response-delayed`) only on the slow ones but still uniform wording. Tailoring per operation would require splitting the orchestrator, which [ADR-002](adrs/002-mcp-orchestrator-single-tool.md) rejects.
- **Mitigation:** Moot under [ADR-010](adrs/010-llm-fillers-not-vapi-tool-messages.md) (orchestrator messages removed) — recorded so the option isn't re-litigated.

## C-5 · Instruction-obedient models are priced out on voice

- **Constraint:** The models that would honour "silent" and quote pricing precisely cost too much latency/money for real-time voice.
- **Evidence:** Sonnet 4.6 measured ~2.3s pipeline latency and $0.22/min in this setup; rejected. Haiku 4.5 runs ~0.7s TTFT at a fraction of the cost.
- **Impact:** We operate within Haiku's instruction-following ceiling; C-1 and C-2 are consequences of that trade.
- **Mitigation:** Accept Haiku and push correctness into deterministic layers (C-6). Re-evaluate if a fast, cheap, obedient model appears — that also flips [ADR-010](adrs/010-llm-fillers-not-vapi-tool-messages.md)'s revisit condition.

## C-6 · Durable correctness must be deterministic, not prompt-based

- **Constraint:** Any invariant that *must* hold cannot rely on the prompt; the model will drop it under load.
- **Evidence:** The model omitted the service address from `book_event` until an n8n `validate_input` gate made the address mandatory and returned a re-ask instruction when missing.
- **Impact:** The prompt is a best-effort layer; guarantees come from the backend.
- **Mitigation:** Every must-hold invariant gets a backend gate (the `book_event` address gate; the error-instruction contract). The prompt also lists the address among `book_event` fields so the gate rarely fires. → **[ADR-004](adrs/004-error-instruction-contract.md)**

---

*Maintenance: this is a living document. When a new model/platform limit is confirmed by a trace, add a `C-N` entry; when a constraint is lifted (e.g. a model change), mark it resolved with the date rather than deleting it.*