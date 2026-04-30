# voice-agent — architecture

Voice AI receptionist (Sophie) on Vapi for a home-service business. MVP handles inbound calls: caller identification, knowledge-base lookups, appointment booking, reschedule/cancel, error escalation. Test case is **GreenScape Landscaping** (Saint Petersburg, FL).

## Stack

| Component | Role |
|---|---|
| **Vapi** | Voice AI platform — STT, TTS, LLM, system prompt, tool calling. |
| **n8n** | Backend — MCP server (orchestrator) + tool sub-workflows + end-of-call webhook + error handlers. |
| **Airtable** | CRM — `customers`, `appointment_logs`, `call_logs`. |
| **Google Calendar** | Schedule — slot availability checks, event create/update/delete. |
| **Discord** | Alerts — tool failures and external trigger failures route here. |

## High-level flow

```
Caller → Vapi (Sophie, n8n_fixr tool) → orchestrator (MCP trigger)
                                          │
              ┌────────────┬──────────────┼──────────────┬────────────┐
              │            │              │              │            │
        client_lookup  create_client  check_avail   book_event  event_lookup
        (Airtable)     (Airtable)    (GCal)         (GCal+AT)   (GCal)
              │            │              │
        update_event  delete_event   end_of_call (separate webhook)
        (GCal+AT)     (GCal+AT)      (Airtable — call log)
              │
        tools_error_handler / external_error_handler → Discord
```

`n8n_fixr` is the single Vapi-side tool that fans out into 7 sub-workflows via the orchestrator's MCP routing. `search_knowledge_base` is a separate Vapi-native KB tool backed by Vapi Files.

## Vapi configuration

| Field | Value |
|---|---|
| Assistant ID | `<assistant-id>` |
| Tool ID — `n8n_fixr` (CRM + calendar router) | `<n8n-tool-id>` |
| Tool ID — `search_knowledge_base` (Vapi Query Tool, provider: google) | `<kb-tool-id>` |
| KB File ID (`greenscape-company-info.txt`) | `<kb-file-id>` |
| n8n base URL | `<n8n-host>` |

The system prompt lives in [`prompts/vapi-system-prompt.md`](prompts/vapi-system-prompt.md). The knowledge base lives in [`knowledge-base/greenscape-company-info.txt`](knowledge-base/greenscape-company-info.txt).

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
   - Booking Rules (open-day check via KB → calendar availability via n8n_fixr → book)
   - Appointment Changes (reschedule / cancel)
   - Lead Saving
   - Wrap Up
7. **Error Handling** — fallback phrases, retry-then-callback, no invented data on tool failure.
8. **Callback Routing** — three callback categories: commercial team (large/commercial), operations team (scheduling/billing/complaints), field team (on-site).
9. **Important Information** — runtime variables: today's date/time (Eastern), caller phone.

## Operational notes

Rules learned during build-out — preserved here so they survive the source-directory deletion.

### Vapi API quirks

- **PATCH tool** — must include **all** fields, not just the changed ones (including `server`). Vapi nulls out anything omitted from the payload.
- **PATCH assistant** — system prompt must be uploaded via `curl`. Python `urllib` is blocked by Cloudflare.
- **Tool description vs system prompt** — tool description says **what** the tool does (short, generic). The system prompt says **when** and **how** to use it (specific scenarios).

### Editing rules

- All numeric values in the system prompt and knowledge base are written as words (TTS-friendly).
- All customer-facing data sent to the CRM (emails, names) is normalized: emails lowercase with spaces removed, names in Title Case.
- KB updates: edit `knowledge-base/greenscape-company-info.txt`, then re-upload the file in the Vapi dashboard.
- n8n workflows: edit through the n8n UI/API directly. They are not exported as JSON in this directory.
