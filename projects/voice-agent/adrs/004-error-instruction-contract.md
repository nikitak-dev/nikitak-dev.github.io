# ADR-004: Tool sub-workflows return instructions, not exceptions

- **Date:** 2026-02-23
- **Status:** ✅ Implemented

## Context

Sub-workflows fail in two semantically different ways:

1. **Validation failure** — caller didn't provide a usable email, the LLM sent a malformed phone number, the date was in the past. Predictable, recoverable; the right response is for Sophie to ask again.
2. **Runtime failure** — Postgres timeout, Google Calendar 5xx, OAuth token expired, n8n queue overload. Unpredictable; Sophie can't recover by retrying mid-call.

Three obvious-but-bad approaches:

- **Throw exceptions to Vapi.** Vapi surfaces the exception text to the LLM. Sophie now reasons over a stack trace and may invent a plausible-sounding response or leak internal details ("I see we have a connection error to Postgres on port 5432").
- **Return raw error JSON.** Sophie sees `{ "code": "ECONNREFUSED" }` and again has to invent natural-language. Same risk.
- **Silently retry.** Hides the failure from the caller until it succeeds — but in a real-time voice call, hiding nothing is preferable to long silence.

## Decision

Every sub-workflow returns the same shape on failure:

```json
{ "error": true, "instruction": "<exact phrase Sophie should say>" }
```

Sophie's prompt (in `[Error Handling]`) instructs her to **speak the `instruction` field verbatim** when `error: true`. The actual error (workflow name, execution URL, message) is posted to a Discord channel by the `tools_error_handler` error workflow — Sophie never sees the underlying exception.

The instructions are tailored to the failed step:

| Failure | Instruction |
|---|---|
| `client_lookup` validation (no email or phone) | "Ask the customer to provide either their email address or phone number so you can look them up." |
| `book_event` validation | "Ask the customer to provide their name, email address, and preferred appointment time." |
| `book_event` runtime | "Apologize for the difficulty booking the appointment. Offer to have someone call the customer back." |
| `create_client` validation | "Ask the customer to spell their full name and provide a valid email address." |
| `create_client` runtime | "Apologize for the difficulty creating the account. Offer to have someone call the customer back." |
| `check_availability` runtime | "Apologize for the difficulty checking the schedule. Offer to have someone call the customer back." |
| `event_lookup` runtime | "Apologize for the difficulty looking up appointments. Offer to have someone call the customer back." |
| `update_event` runtime | "Apologize for the difficulty updating the appointment. Offer to have someone call the customer back." |
| `delete_event` runtime | "Apologize for the difficulty canceling the appointment. Offer to have someone call the customer back." |

Validation instructions are constructive ("ask for X"); runtime instructions are graceful-fallback ("apologize + offer callback"). The split intentionally maps "recoverable in this call" vs "needs human follow-up".

## Consequences

### What this earns

- **Sophie never speaks technical jargon.** The boundary between system and conversation is enforced at the data shape, not at the prompt — the prompt cannot leak what the workflow doesn't return.
- **Single retry semantics.** Validation errors → retry by re-asking the caller. Runtime errors → no in-call retry, escalate via callback. Sophie doesn't decide whether to retry; the workflow author decides by choosing which instruction string to return.
- **Operator visibility decoupled from caller experience.** Discord receives the technical error (workflow name, execution URL, raw message) for diagnosis. Caller experience stays clean.
- **Easy to audit.** All instructions live in one place per workflow (the workflow's error-message Set node). Changing a phrase = one Set node edit, not a prompt rewrite.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Workflow contract | Every sub-workflow's error path produces `{ error: true, instruction: "..." }` | Inspect the `error_message` Set node in each sub-workflow |
| Discord forwarding | `tools_error_handler` posts to Discord on workflow failure | Trigger a deliberate failure (e.g. invalid Postgres credential) and check Discord |
| Prompt obeys | Sophie speaks the `instruction` string verbatim, not paraphrased | Manual test: trigger validation error, confirm exact phrase |

### Trade-offs (Non-goals — deliberately not done)

- **No structured error codes.** The contract is `{ error, instruction }` — no `code` / `category` for downstream automation. If a future client needs programmatic error analytics, add a `code` field. Sophie still ignores it.
- **No localisation of instruction strings.** Strings are English-only. Multi-language support requires a per-language map keyed by failure type — not in scope.
- **`tools_error_handler` Discord post may itself contain caller PII** (e.g. email in failed `book_event` payload). Acceptable for current single-operator setup; for production, the alert pipeline needs payload redaction.
- **Recovery is per-call, not per-conversation-state.** If three runtime errors happen back-to-back, Sophie offers callback three times. Future work could track repeat failures and end the call after N.

## References

- [`n8n/workflows.md`](../n8n/workflows.md) — "Error contract — Sophie reads instructions, not stack traces" section with the full failure → instruction table.
- [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — `[Error Handling]` and `[Tool Calling Rule]` sections that wire Sophie to obey the instruction field.
- [`CHANGELOG.md`](../CHANGELOG.md) — "Error contract: instructions, not exceptions" entry under the 2026-02 build-out.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
