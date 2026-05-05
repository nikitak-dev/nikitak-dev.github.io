# ADR-007: `end_of_call` webhook authenticates via Header Auth Bearer credential, not URL-as-secret

- **Date:** 2026-05-05
- **Status:** ✅ Implemented

## Context

The `end_of_call` n8n webhook receives Vapi's end-of-call report — the only path that writes new rows into the `calls` table, with full transcript, customer sentiment, cost breakdown, and a fire-and-forget trigger into `archive_recording`. Originally protected only by an unguessable UUID path (`/webhook/<uuid>`). The path acted as a shared secret on the assumption that an attacker can't discover a 36-character random string.

The audit (composed-spinning-stonebraker) flagged this as the highest-priority security finding (S-1, V-3): a path that anyone with read-only access to the n8n executions UI, browser DevTools, or a copy of the assistant config can extract — and once known, can be hit by anyone, with any payload.

Three paths considered:

1. **Keep URL-as-secret + rotate periodically.** Lowest setup, no code change. Doesn't fix the leak surface — the URL still appears in n8n executions, Vapi assistant config, n8n audit log, network captures, and any future Discord error alert URL. Once leaked, rotation is full retag of the path everywhere.
2. **HMAC signature verification (`X-Vapi-Signature` header).** Industry standard for webhooks (Stripe, GitHub model). Adds replay protection (timestamp in digest), non-extractable secret (only the signature crosses the wire). But: Vapi does not publicly document the exact `X-Vapi-Signature` format — header name, payload-to-sign, separator, hex vs base64. Implementing it without the format means guessing; community threads confirm intermittent missing-header bugs. Production HMAC has to wait until Vapi publishes the spec or until empirical reverse-engineering becomes feasible (currently blocked by a Vapi Dashboard "Talk to Assistant" bug — see project follow-ups).
3. **Bearer token in `Authorization` header, validated by the webhook node's built-in `Header Auth`.** Setup ~5 minutes; protection rejected at the HTTP layer (no workflow execution recorded, no Discord alert noise, no compute cost on rejected requests); secret stored in n8n's encrypted credential store and in Vapi's encrypted server header config; never crosses the wire as plaintext outside the request itself.

## Decision

The `end_of_call` webhook node is configured with `authentication: "headerAuth"`, bound to a `Header Auth` credential named `Vapi Webhook Auth` storing `Authorization: Bearer <secret>`. Vapi's assistant `server.headers` carries the matching `Authorization: Bearer <secret>` value. The secret is a 32-byte random value, base64-encoded, generated via Windows CSPRNG.

Rejection happens at n8n's HTTP layer before the workflow runs:

- No `Authorization` header → `403 Forbidden`
- Wrong Bearer value → `403 Forbidden`
- Correct Bearer → workflow proceeds normally

Smoke test confirmed all three branches.

The earlier short-lived approach using a `verify_auth` Code node inside the workflow (constant-time compare via `crypto.timingSafeEqual`) was abandoned mid-implementation: n8n's task runner sandbox blocks `require('crypto')` (`Module 'crypto' is disallowed`), and even where it wouldn't, every rejected request would still spin up an execution and fan out to the error-handler Discord alert — turning brute-force noise into a Discord-spam vector.

## Consequences

### What this earns

- **HTTP-layer rejection.** Unauthorised requests don't create executions, don't hit Postgres, don't fire Discord alerts. Compute cost stays at the TLS handshake.
- **Secret stays out of code and out of the URL.** Rotation is two clicks (n8n credential value + Vapi assistant header value) — no path retag, no n8n redeploy, no `.env` change.
- **Webhook URL becomes non-sensitive.** It can appear in execution metadata, error alerts, and chat logs — without the Bearer it's just an endpoint that returns 403.
- **Symmetric on both sides.** Vapi config field name and n8n credential field name match (`Authorization`), the value is the same string — the contract is the simplest possible.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Smoke: missing header | `POST` without `Authorization` returns `403` | n8n webhook authentication is `none` or credential is unbound |
| Smoke: wrong header | `POST` with random Bearer value returns `403` | Constant-time compare not engaged or credential value mismatch |
| Smoke: correct header | `POST` with the expected Bearer continues into the workflow (200/422/500 from downstream, but not 403) | Credential value desynced between Vapi side and n8n credential |
| Vapi end-to-end | Real call produces a single n8n execution, Postgres `calls` row appears, Discord stays quiet | Vapi assistant `server.headers` not saved or wrong env binding on n8n |

### Trade-offs (Non-goals — deliberately not done)

- **No replay protection.** Bearer is a static long-lived value; an intercepted request can be replayed. HMAC with timestamp would close this. Mitigated by HTTPS-only transport and Cloudflare proxy in front of n8n; not eliminated. Revisit when Vapi publishes the `X-Vapi-Signature` format.
- **Plaintext compare.** n8n's built-in `Header Auth` is `===` not `crypto.timingSafeEqual`. For an opaque random 32-byte secret with no structure, the timing-leak risk is academic — an attacker has no symbol-by-symbol oracle to exploit, network jitter swamps the nanosecond differential, and brute-forcing a 256³² space is infeasible.
- **No header redaction in saved execution data.** Bearer value is captured into `body.headers.authorization` of every saved execution. Visible to anyone with n8n access (single user — owner — in current setup). n8n's enterprise-tier "Redact production execution data" toggle would solve this; community edition cannot. Revisit on production-deploy phase via `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` env var (workflow-scoped) or selective per-workflow `Save successful production executions: Do not save`.
- **Single secret across all assistants.** If a second Vapi assistant is bound to the same n8n endpoint later, both will share the same Bearer. Splitting per-assistant means a credential per assistant and a small router upstream of `end_of_call`. Out of scope for the current single-assistant setup.
- **Orchestrator (MCP) endpoint not retouched.** The `n8n_orchestrator` MCP webhook also lives on this n8n instance and was already protected by the MCP protocol-level Bearer credential (configured per-tool on the Vapi side via Custom Credentials, see ADR-002 + `architecture.md`). This ADR specifically closes the `end_of_call` REST webhook gap, not the MCP one.

## References

- [`n8n/workflows.md`](../n8n/workflows.md) — `end_of_call` row in inventory; Conventions section names the credential and the convention.
- [`architecture.md`](../architecture.md) — Vapi configuration block names `server.headers` Bearer.
- [`CHANGELOG.md`](../CHANGELOG.md) — "`end_of_call` webhook now requires Header Auth Bearer" entry under 2026-05.
- ADR-002 — orchestrator MCP endpoint already used Bearer Credential at the Vapi side.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
