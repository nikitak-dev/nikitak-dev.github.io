-- Migration: 00006_rename_success_evaluation_to_appointment_booked
-- Apply via: mcp__supabase__apply_migration(project_id, name='rename_success_evaluation_to_appointment_booked', query=<this file>)
-- Purpose: align Postgres column name with the actual Vapi Structured Output that writes into it.
--
-- Background: the column was originally named `success_evaluation` to match a planned Vapi
-- analysisPlan output of the same name. In practice the Vapi-side Structured Output was created
-- as `appointment_booked` (boolean: did this call book a new appointment?). The column type was
-- always boolean and the data flowing in always meant "appointment_booked", so this is a pure
-- rename — no type change, no data backfill.
--
-- After this migration:
--   * n8n end_of_call workflow upsert mapping must use `appointment_booked` (updated in same PR)
--   * db/types/database.ts must be regenerated (Field Row/Insert/Update + indexes)
--   * Index `calls_success_eval_idx` is renamed accordingly to keep the convention.

ALTER TABLE calls
  RENAME COLUMN success_evaluation TO appointment_booked;

ALTER INDEX calls_success_eval_idx
  RENAME TO calls_appointment_booked_idx;
