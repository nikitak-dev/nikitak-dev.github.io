# ADR-002: Single MCP-routed orchestrator instead of N Vapi-side tools

- **Date:** 2026-02-19
- **Status:** ✅ Implemented

## Context

Sophie needs seven distinct backend operations: `client_lookup`, `create_client`, `check_availability`, `book_event`, `event_lookup`, `update_event`, `delete_event`. The naïve approach is to register each as a separate Vapi tool (function-calling style). For this project that approach has three problems:

1. **Vapi tool config sprawl.** Each tool needs its own JSON schema, server URL, headers, error handling, and Vapi management-API record. PATCH semantics in Vapi (must include all fields, otherwise omitted ones are nulled) make per-tool churn risky.
2. **Token leakage surface.** Each tool's `server.headers` is returned verbatim by Vapi management API (`get_tool` / `list_tools`). Inlining the n8n bearer token across seven tool records multiplies the leak surface by seven. Vapi Custom Credentials (`credentialId`) close this — but seven separate tool records still mean seven PATCH calls on rotation.
3. **Tool description vs prompt drift.** With seven tools, each carries its own description. Sophie's LLM sees them all in every turn — context-window cost and chance to misroute increase. Centralising routing into the prompt is cleaner.

## Decision

A **single Vapi tool** of `type: mcp` named `n8n_orchestrator` is registered. It points at one MCP endpoint hosted by the n8n `orchestrator` workflow:

```
n8n MCP endpoint: <n8n-host>/mcp/<webhook-path>
```

The `orchestrator` workflow exposes the seven tool sub-workflows as MCP-discoverable operations via `toolWorkflow` nodes connected to an `MCP_server_trigger` node. Each `toolWorkflow` carries its own description and `$fromAI`-driven input schema:

| Sub-workflow | Inputs | Vapi sees this as |
|---|---|---|
| `client_lookup` | email, phone_number | "Look up a client profile in the CRM by phone number or email address." |
| `create_client` | full_name, email, phone_number | "Create a new client profile in the CRM. Only for first-time callers." |
| `check_availability` | after_time, before_time | "Check available time slots on the calendar for a given date range." |
| `book_event` | start_time, end_time, email, client_name, service_type, address | "Create a NEW appointment. Only for first-time bookings. NEVER use for rescheduling." |
| `event_lookup` | after_time, before_time, customer_id | "Look up appointments for the current caller. Requires customer_id from client_lookup." |
| `update_event` | start_time, end_time, appointment_id | "Reschedule an EXISTING appointment to a new time. Requires appointment_id from event_lookup." |
| `delete_event` | appointment_id | "Cancel and delete an existing appointment. Requires appointment_id from event_lookup." |

Sophie's LLM receives the seven sub-tool descriptions through MCP discovery on connect — they are advertised by the n8n orchestrator, not stored Vapi-side. Routing rules ("never use `book_event` for rescheduling") live in the tool descriptions; the system prompt only references the umbrella tool name `n8n_orchestrator`.

## Consequences

### What this earns

- **One Vapi tool record** to manage credentials, server URL, and headers for. Bearer token sits behind a single Vapi Custom Credential (`credentialId`); rotating means updating one credential, not seven.
- **Sub-workflow discovery is dynamic.** Adding an eighth sub-workflow = `toolWorkflow` node + connect to `MCP_server_trigger` in n8n. No Vapi-side change.
- **Routing logic is colocated with implementation.** Each sub-workflow's description and input schema live next to the workflow that handles it — no Vapi-side schema duplication.
- **MCP protocol auth.** Bearer token + path-as-secret combine; Vapi sends `Authorization: Bearer <token>` per request, validated by the n8n MCP trigger.

### Per-phase verification gates

| Gate | Criterion | If fail |
|---|---|---|
| Vapi tool registered | `mcp__vapi__list_tools` shows `n8n_orchestrator` of `type: mcp` | Re-create tool with `type: mcp` and correct server URL |
| MCP discovery | Sophie's LLM sees all seven sub-tools (verify in chat: ask about each operation) | Check `availableInMCP: true` on every sub-workflow |
| Auth path | Removing bearer credential causes 401 from Vapi → n8n | Verify `credentialId` references valid Vapi Bearer Token Credential |

### Trade-offs (Non-goals — deliberately not done)

- **No per-sub-tool Vapi metrics.** Vapi-side analytics aggregates everything under `n8n_orchestrator`. To break down which sub-tool failed and how often, you query n8n executions or `calls.tool_calls_summary` JSONB. Acceptable for current scale.
- **MCP auth is bearer-only.** No HMAC-signed payload. If the token leaks, attacker has unrestricted MCP access — see the "known limitations" section in [`n8n/workflows.md`](../n8n/workflows.md).
- **Discovery latency on cold start.** First MCP handshake adds ~200 ms. Acceptable for inbound voice flows.

## References

- [`architecture.md`](../architecture.md) — Vapi configuration table and "n8n_orchestrator tool description" section.
- [`n8n/workflows.md`](../n8n/workflows.md) — full workflow inventory and per-sub-tool descriptions.
- [`prompts/vapi-system-prompt.md`](../prompts/vapi-system-prompt.md) — `[Tool Calling Rule]` and `[Call Flow Logic]` reference `n8n_orchestrator` only, never the sub-tools.
- [`CHANGELOG.md`](../CHANGELOG.md) — "n8n token migration to Vapi Custom Credential" entry under the 2026-02 build-out.
- **Format:** Michael Nygard, [Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
