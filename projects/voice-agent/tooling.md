# voice-agent — local tooling

How to pull full Vapi context from the terminal without writing throwaway scripts.

## Official Vapi CLI

The Vapi **MCP server** truncates payloads (no transcript, no system prompt — see [`constraints.md`](constraints.md) and the auto-memory note). The official **CLI** returns the full JSON instead.

- Binary: `~/.vapi/bin/vapi.exe` (on User PATH; `vapi` from any new shell).
- Auth: User env `VAPI_API_KEY` (mirrored from `VAPI_PRIVATE_TOKEN`). No `vapi login` needed.
- Install was manual — see note below.

### Commands that return full JSON

| Command | Returns |
|---|---|
| `vapi call get <id>` | Full call: transcript, messages, tool timeline, artifact, costs (~120 KB). |
| `vapi assistant get <id>` | Full assistant config incl. `model.messages` (system prompt), `toolIds`, voice, server. |
| `vapi tool get <id>` | Full tool / function schema. |
| `vapi logs calls <id>` | Call log events. |

Output is JSON preceded by **one** human line (`Getting call with ID: …`). Strip it before `jq`:

```bash
vapi call get <id> | tail -n +2 | jq '.messages | length'
vapi assistant get d018e545-263d-4683-a162-115e15f716f1 | tail -n +2 | jq '.model.messages[0].content' -r
```

The voice_agent assistant id is `d018e545-263d-4683-a162-115e15f716f1`.

### Gotchas (CLI v0.2.1)

- **`vapi call list` is broken** (`json: cannot unmarshal string into .embed.assistant`). Get a call id from Supabase `calls.vapi_call_id` or the Dashboard, then `vapi call get <id>`.
- **npm install is broken on Windows** (`No binary found for platform: Windows_x86_64`) — and so is the bundled `install.ps1` (its `tar` mangles the `C:` drive path). Installed manually: download `cli_Windows_x86_64.tar.gz` from the [GitHub release](https://github.com/VapiAI/cli/releases), extract with System32 `tar.exe` (bsdtar), not GNU/git tar.
- `analysisPlan` / structured outputs still can't be set from the CLI — Dashboard only.

## Transcripts already in the database

Completed calls are mirrored to Supabase (project `rhacvzgrirbpncwggdwv`), table `calls`: `transcript_text` (full-text searchable), `tool_calls_summary`, `vapi_metadata` (raw end_of_call payload). Reach these via the Supabase MCP — no CLI needed for historical analysis.
