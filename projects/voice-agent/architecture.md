# voice-agent — architecture

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation. Test case is **GreenScape Landscaping** (Saint Petersburg, FL).

## Stack

| Component | Provider / model | Role |
|---|---|---|
| **LLM** | Anthropic — `claude-sonnet-4-20250514` | Reasoning, tool calling, response generation. |
| **TTS** | ElevenLabs — `eleven_flash_v2_5`, voice id `g6xIsTj2HwM6VR4iXFCw` | Direct ElevenLabs integration (not via Vapi voice provider). Flash chosen for low latency. |
| **STT** | Deepgram — `nova-3` | Speech-to-text. |
| **Voice platform** | Vapi | Hosts assistant, system prompt, tool routing, end-of-call analysis pipeline, KB Files. |
| **Backend** | n8n (self-hosted) | MCP server (orchestrator) + 7 tool sub-workflows + end-of-call webhook + 2 error handlers. |
| **CRM** | Supabase (Postgres + Storage) | `customers`, `calls`, `appointments` tables + `recordings` bucket for audio archival. See [`db/`](db/). |
| **Schedule** | Google Calendar | Slot availability checks, event create/update/delete. |
| **Alerts** | Discord | Tool failures and external trigger failures route here via webhook. |

## High-level flow

```
Caller → Vapi (Sophie, n8n_orchestrator tool) → orchestrator (MCP trigger)
                                                    │
              ┌────────────┬──────────────┬─────────┴────┬────────────┐
              │            │              │              │            │
        client_lookup  create_client  check_avail   book_event  event_lookup
        (Supabase)     (Supabase)    (GCal)         (GCal+SB)   (GCal)
              │            │              │
        update_event  delete_event   end_of_call (separate webhook)
        (GCal+SB)     (GCal+SB)      (Supabase — calls + recording archival)
              │
        tools_error_handler / external_error_handler → Discord
```

`n8n_orchestrator` is the single Vapi-side tool that fans out into 7 sub-workflows via the orchestrator's MCP routing. `search_knowledge_base` is a separate Vapi-native Query Tool backed by Vapi Files.

## Vapi configuration

| Field | Value |
|---|---|
| Assistant ID | `<assistant-id>` |
| Tool — `n8n_orchestrator` (CRM + calendar router) | type `mcp`, id `<n8n-tool-id>` |
| Tool — `search_knowledge_base` | type `query` (Vapi-native), id `<kb-tool-id>` |
| KB File (`greenscape-company-info.txt`) | `<kb-file-id>` |
| n8n MCP endpoint | `<n8n-host>/mcp/<webhook-path>` |
| n8n auth | **Vapi Custom Credential** (Bearer Token type, Encryption disabled) — referenced by `credentialId`, never inlined into `server.headers` |
| Phone number | not bound at the moment (Sophie is not publicly callable) |

The system prompt lives in [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md). The knowledge base lives in [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt).

### Why the n8n token is a Vapi Credential, not an inline header

Vapi management API (`get_tool`, `list_tools`) returns `server.headers` verbatim — any token inlined there is exposed to anyone with read access to Vapi. Vapi Bearer Token Credentials live in a separate object: tools reference them by `credentialId`, the management API returns only the id, and the Bearer header is materialised at runtime by Vapi when calling the n8n endpoint. Result: rotating the n8n token only requires updating the credential, and management-API surface no longer leaks the secret.

## n8n_orchestrator tool description (what Sophie's LLM actually sees)

> "Backend tool for client and appointment management. Use ONLY for: looking up clients by email, creating new client profiles, checking calendar availability, booking/updating/deleting appointments, and saving leads."

The Vapi-side tool is just an MCP shell — its `parameters` schema is empty. The seven concrete operations (`client_lookup`, `create_client`, `check_availability`, `book_event`, `event_lookup`, `update_event`, `delete_event`), their input schemas and per-tool descriptions are advertised by the n8n orchestrator over the MCP protocol on connection. See [`n8n/workflows.md`](n8n/workflows.md) for the full inventory.

## System prompt structure

Sophie's prompt is split into nine sections. Order matters — each section assumes the rules above it.

1. **Identity** — Sophie's role and tone.
2. **Voice & Style Rules** — single-question turns, no markdown, TTS-friendly numbers, interrupt handling, empathy on upset callers.
3. **Tool Calling Rule** — short filler phrase before each tool, then strict silence until the result returns. Single exception: the initial phone lookup runs in parallel with the greeting.
4. **Data Verification Standards** — spelling confirmation for names, emails, phone numbers, addresses. CRM-side normalization (lowercase emails, Title Case names).
5. **Core Operating Rules** — never invent business facts; always use `search_knowledge_base` for hours/services/pricing/FAQs; never derive a name from an email.
6. **Call Flow Logic** — main flow:
   - Immediate Phone Lookup (auto-runs during greeting)
   - Determine Intent
   - Identification for Action (email → CRM lookup → create if new)
   - Service Matching (KB)
   - Booking Rules (open-day check via KB → calendar availability via `n8n_orchestrator` → book)
   - Appointment Changes (reschedule / cancel)
   - Lead Saving
   - Wrap Up
7. **Error Handling** — fallback phrases, retry-then-callback, no invented data on tool failure.
8. **Callback Routing** — three callback categories: commercial team (large/commercial), operations team (scheduling/billing/complaints), field team (on-site).
9. **Important Information** — runtime variables: today's date/time (Eastern), caller phone.

## Operational notes

Rules learned during build-out — preserved here so they survive the source-directory deletion.

### Vapi quirks

- **PATCH tool** — must include **all** fields (including `server`), otherwise Vapi nulls out anything omitted from the payload.
- **System prompt edits** — done in the Vapi Dashboard UI directly; [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md) is a snapshot, not the live source. Keep them in sync manually after any prompt change.
- **Tool description vs system prompt** — tool description says **what** the tool does (short, generic). The system prompt says **when** and **how** to use it (specific scenarios).
- **Secrets in tool config** — never put credentials into `server.headers`. Always use a Vapi Custom Credential and reference by `credentialId`. Vapi management API returns headers verbatim; credentials are returned only by id.

### Editing rules

- All numeric values in the system prompt and knowledge base are written as words (TTS-friendly).
- All customer-facing data sent to the CRM (emails, names) is normalized: emails lowercase with spaces removed, names in Title Case.
- KB updates: edit `knowledge-base/greenscape-company-info.txt`, then re-upload the file in the Vapi dashboard.
- n8n workflows: edit through the n8n UI/API directly. They are not exported as JSON in this directory.
