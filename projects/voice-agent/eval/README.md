# eval — regression test suite for Sophie

Vapi Test Suite definition for the `voice_agent` assistant. Five smoke-test scenarios that verify Sophie's prompt-driven behavior survives prompt edits without manual click-through testing.

Mirrors the `eval/` discipline of the [`multimodal-rag`](../../multimodal-rag/eval/) project — same idea (LLM-as-judge against rubrics), different platform (Vapi-native vs. Python runner against the chat webhook).

> **Heads up — Vapi is deprecating Test Suites in favour of Simulations.**
> The Vapi Dashboard surfaces this notice on the Test Suites tab: *"Test Suites is being deprecated. It will be replaced by Simulations, a more powerful way to test your voice agents. You can keep using Test Suites in the meantime, and we'll share a migration guide once Simulations is ready."*
> This suite was built against `/test-suite` because the Simulations API is not yet GA and lacks public docs. When Vapi publishes the migration guide, the scripts here (`create-suite.ps1`, `run-suite.ps1`) will need to be ported to `/eval/simulation/run` + `simulationSuiteId`. The test definitions themselves — scripts and rubrics — should carry over without semantic changes.

## Vapi Evals + backend ownership test (Gate B, 2026-06-01)

A second, newer layer sits alongside the Test Suite above: Vapi **Evals** (`chat.mockConversation`) for the mutating flows, built via the REST API (`POST/PATCH https://api.vapi.ai/eval`) and run from the Dashboard against `voice_agent`. Each scripts a deterministic conversation with **mocked** tool responses, then judges ONE model-generated turn.

| Eval | Eval ID | Asserts (text/negative-tool only) |
|---|---|---|
| cancel happy-path | `9b924173-9a89-4579-874b-31ec22fc6b7d` | asks "Are you sure?" + does NOT call delete_event |
| book happy-path | `8c06e23e-85c6-4a4f-81ab-80079e467993` | after check_availability, offers ONLY the returned windows (no invented/shifted times) |
| reschedule happy-path | `66c79738-0d90-4b4d-807d-dc8d83b2898b` | after event_lookup, reads the appointment back with returned day_of_week + time verbatim |
| phone greet-by-name | `1c469520-3d9d-488d-ab46-0703a280efc8` | with `customer.number` set, greets the looked-up caller by name without re-asking email |

**Limitation (why these assert text, not the mutating call).** In `chat.mockConversation` this assistant (Haiku 4.5 + the "say a filler phrase, then STOP" Tool Calling Rule) emits EITHER filler text with no tool call OR a bare tool call with no text — never both in one turn. The harness only judges turns that produce text, so a generated `book_event` / `update_event` call is never surfaced for judging. Positive mutating-tool-call assertions are therefore **not achievable** here. These evals lock conversational decisions only; the mutating call's args/ownership are covered by the live web tests + the backend test below.

**SQL-invariant check.** [`ownership-regression.sql`](ownership-regression.sql) exercises the same `verify_ownership` predicate the mutating flows use — `gcal_event_id + customer_id` (not the row UUID — the 2026-05-31 bug). Important honesty: it runs a **transcribed copy** of the node's SQL directly against Supabase; it does NOT run the n8n workflow, and is kept in sync with the node by hand. Deterministic, self-seeding + self-cleaning; run via Supabase SQL editor or MCP `execute_sql`. PASS = NOTICE `ownership-regression: ALL CHECKS PASSED`.

**What actually runs n8n.** Neither the Evals (mock tools) nor the SQL check executes the real n8n workflows. Real end-to-end execution (n8n + GCal + Supabase) is proven by the **live test** (2026-05-31: same-call book→cancel and book→reschedule, validated against GCal + Postgres). These automated artifacts are lower-fidelity regression nets — the eval catches prompt-decision drift, the SQL check catches predicate drift — not substitutes for the live run.

## Files

| File | Purpose |
|---|---|
| [`suite-definition.json`](suite-definition.json) | Declarative test cases — name, description, script for the tester AI, AI-scorer rubric. Source of truth. |
| [`create-suite.ps1`](create-suite.ps1) | One-time: registers the suite in Vapi via `POST /test-suite`. Saves the returned suite ID to `.suite-id` (gitignored). |
| [`run-suite.ps1`](run-suite.ps1) | Trigger one evaluation run, poll until terminal status, save the full result JSON to `results/<timestamp>.json`, print pass/fail summary. |
| [`cleanup-test-data.sql`](cleanup-test-data.sql) | Removes residue from Supabase (calls, consent_log, customers, appointments) created by mutating test cases. Runs after each suite execution. |
| [`ownership-regression.sql`](ownership-regression.sql) | Backend regression test (deterministic, self-seeding + self-cleaning) for the gcal_event_id+customer_id ownership invariant that the LLM evals can't cover. See "Vapi Evals + backend ownership test" below. |
| [`results/`](results/) | Per-run JSON outputs from `run-suite.ps1` — full Vapi response with transcripts, scorer reasoning, tool-call payloads. Filenames `YYYY-MM-DD_HHmmss.json` are the run's `createdAt` in UTC. |

## Test scenarios

Each case targets a specific prompt rule. Rubrics are written as bullet checklists with binary PASS/FAIL conditions — keeps the LLM judge stable across runs.

| ID | Asserts | Mode |
|---|---|---|
| **CS-1** | `Always collect email first` — Sophie does not invoke booking tools before email is provided | chat |
| **CS-2** | `ALWAYS call search_knowledge_base before answering pricing` — Sophie hits KB before quoting figures, quoted figures match KB ranges | chat |
| **CS-3** | `For ambiguous service-area queries, offer callback rather than guessing` — Sophie checks KB for Naples FL, answers honestly (outside service area), does not start booking | chat |
| **CS-4** | Emergency routing — Sophie produces the emergency phone (727 555 0173, press 2) and ends the call without entering booking flow | chat |
| **CS-5** | Out-of-scope commercial handoff — Sophie identifies $50K office park request as commercial, mentions commercial team, offers callback | chat |

## Out of scope (deliberate)

These behaviors aren't covered here — each is documented as a future addition, not a forgotten gap.

- **Voice mode tests.** TTS pronunciation of numbers, STT robustness under accents, latency / interruption handling. Voice mode is real-call cost ($0.20-0.50 per case) and tests platform-specific rendering rather than prompt logic. Add when binding a public phone number — see audit follow-ups.
- **Mutating happy-path booking, reschedule, cancel — partially covered now** (see "Vapi Evals + backend ownership test" above): the conversational decisions are locked by the mocked-tool Evals, and the gcal-id ownership invariant by `ownership-regression.sql`. Still NOT covered: a true end-to-end run that actually creates a Google Calendar event + Postgres rows (cleaning up GCal automatically isn't wired). Adding a staging Vapi assistant + isolated n8n project + isolated Supabase project (audit follow-up R-8) makes full mutating tests safe.
- **R-1 caller secondary verification (last-4 of phone).** Chat mode doesn't expose a way to control the caller's pre-matched phone identity from the script side, so we can't reliably set up the "phone-not-pre-matched + email-found" branch the rule guards. Real voice tests with controlled phone fixtures will cover this.
- **Greeting compliance (AI / recording disclosure).** The opening line lives in the Vapi assistant's `First Message` field, not in the LLM's response stream. Chat mode may not replay it the same way voice mode does. Static configuration audit catches drift faster than a runtime eval.
- **CI gating.** No GitHub Actions integration — every run hits production Vapi + n8n + Supabase, and a missing staging environment makes per-PR auto-runs costly and noisy. Manual cadence (one run per major prompt edit) is sufficient at this stage.

## Cost per run

5 chat-mode test cases × ~10-15 turns avg with Haiku 4.5 + Vapi tester AI + LLM judge ≈ **$0.10–0.20 per full suite run**. Acceptable for ad-hoc regression after prompt edits; not for per-commit CI.

## Validation runs

| Started (UTC) | Run ID | Pass / Total | JSON | Notes |
|---|---|---|---|---|
| 2026-05-07T09:53Z | `96b99526-…` | 5 / 5 | [`results/2026-05-07_095346.json`](results/2026-05-07_095346.json) | First validation pass. Surfaced two prompt polish items: (a) Sophie stripped the dot from email local-part (`test.cs1@…` → `testcs1@…`); (b) in CS-5 Sophie agreed to a callback without ensuring any contact method was on file. Plus a CS-4 enhancement: state the emergency phone twice for clarity. |
| 2026-05-07T10:52Z | `e5af1223-…` | 5 / 5 | [`results/2026-05-07_105232.json`](results/2026-05-07_105232.json) | Re-run after the three prompt edits from run 1. All three behaviours verified: dot preserved end-to-end in `client_lookup` payload, emergency phone stated twice with `endCall` immediately after, callback-flow now asks "What's the best phone number or email for them to reach you?" before agreeing. No regressions in CS-2 / CS-3. |

## Workflow — typical regression cycle

1. **Edit `prompts/vapi-system-prompt.md` + sync to Vapi UI.**
2. **One-time setup** — make sure both env vars are reachable when the script runs:
   - `VAPI_PRIVATE_TOKEN` — Vapi private API key. Recommended: Windows User-level env var (System Properties → Environment Variables) so every shell inherits it.
   - `VAPI_ASSISTANT_ID` — target assistant. Lives in **repo-root `.env`** (gitignored; copy `.env.example` and fill in). The scripts auto-load `.env` at startup; existing process / User-level vars take priority.
3. Trigger evaluation:
   ```powershell
   .\run-suite.ps1
   ```
   Polls until `completed` / `ended`. Result JSON appears under `results/`.
4. Review per-case scores. If a case failed:
   - Open the JSON, find the `transcript` for that case, read what Sophie actually did.
   - Compare against the rubric — was the rule violated, or is the rubric too strict?
   - Either fix the prompt and re-run, or refine the rubric and commit it.
5. Clean up test residue from Supabase:
   ```sql
   -- via Supabase Studio SQL Editor or MCP execute_sql
   -- contents of cleanup-test-data.sql
   ```
6. (One-off) When `suite-definition.json` changes structurally, archive the old suite via the Vapi Dashboard and re-run `create-suite.ps1` to register the new one.

## Why chat mode (not voice) for now

The vast majority of failure modes a prompt edit can introduce are flow-logic bugs: tool-calling order, missing identification step, wrong response template, hallucinated facts. Those are LLM-deterministic and reproduce identically in chat mode. Voice-only failure modes (mispronounced numbers, STT misheard names, latency-induced double-greetings) need voice mode but are platform / config issues, not prompt-logic ones, so they're out of scope here.

## References

- Vapi Test Suite — [docs.vapi.ai/test/voice](https://docs.vapi.ai/test/voice), [docs.vapi.ai/test/chat](https://docs.vapi.ai/test/chat).
- Tester AI architecture — Vapi spawns a separate AI that follows the test `script`, talks to the target assistant, transcript is graded by an LLM judge against the `rubric`.
- Sister discipline (different platform) — [`multimodal-rag/eval/`](../../multimodal-rag/eval/): 39-case automated suite with Python runner + OpenRouter LLM-judge + 14 failure-mode classes.
