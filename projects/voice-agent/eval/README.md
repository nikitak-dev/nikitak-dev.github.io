# vapi-evals — regression test suite for Sophie

Vapi Test Suite definition for the `voice_agent` assistant. Five smoke-test scenarios that verify Sophie's prompt-driven behavior survives prompt edits without manual click-through testing.

Mirrors the `eval/` discipline of the [`multimodal-rag`](../../multimodal-rag/eval/) project — same idea (LLM-as-judge against rubrics), different platform (Vapi-native vs. Python runner against the chat webhook).

> **Heads up — Vapi is deprecating Test Suites in favour of Simulations.**
> The Vapi Dashboard surfaces this notice on the Test Suites tab: *"Test Suites is being deprecated. It will be replaced by Simulations, a more powerful way to test your voice agents. You can keep using Test Suites in the meantime, and we'll share a migration guide once Simulations is ready."*
> This suite was built against `/test-suite` because the Simulations API is not yet GA and lacks public docs. When Vapi publishes the migration guide, the scripts here (`create-suite.ps1`, `run-suite.ps1`) will need to be ported to `/eval/simulation/run` + `simulationSuiteId`. The test definitions themselves — scripts and rubrics — should carry over without semantic changes.

## Files

| File | Purpose |
|---|---|
| [`suite-definition.json`](suite-definition.json) | Declarative test cases — name, description, script for the tester AI, AI-scorer rubric. Source of truth. |
| [`create-suite.ps1`](create-suite.ps1) | One-time: registers the suite in Vapi via `POST /test-suite`. Saves the returned suite ID to `.suite-id` (gitignored). |
| [`run-suite.ps1`](run-suite.ps1) | Trigger one evaluation run, poll until terminal status, save the full result JSON to `results/<timestamp>.json`, print pass/fail summary. |
| [`cleanup-test-data.sql`](cleanup-test-data.sql) | Removes residue from Supabase (calls, consent_log, customers, appointments) created by mutating test cases. Runs after each suite execution. |
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
- **Mutating happy-path booking, reschedule, cancel.** A booking-success test would create a real Google Calendar event + Postgres rows; cleaning up GCal automatically isn't wired yet. Adding a staging Vapi assistant + isolated n8n project + isolated Supabase project (audit follow-up R-8) makes mutating tests safe.
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
