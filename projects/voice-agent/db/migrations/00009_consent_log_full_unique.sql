-- Migration: 00009_consent_log_full_unique
-- Apply via: mcp__supabase__apply_migration(project_id, name='consent_log_full_unique', query=<this file>)
-- Purpose: replace the partial UNIQUE index `consent_log_call_type_unique_idx`
-- (WHERE vapi_call_id IS NOT NULL) with a full UNIQUE index on the same
-- columns. n8n Postgres v2.6 `upsert` operation generates
-- `ON CONFLICT (cols) DO UPDATE` without a WHERE clause — Postgres rejects
-- this against a partial index ("there is no unique or exclusion constraint
-- matching the ON CONFLICT specification"). A full UNIQUE matches normally.
--
-- Effective behaviour stays identical: Postgres' default `NULLS DISTINCT`
-- treats NULL as a distinct value in unique checks, so rows with
-- `vapi_call_id IS NULL` (future email-opt-in / web-form channels) are
-- allowed to repeat — same as before the partial WHERE.

DROP INDEX IF EXISTS public.consent_log_call_type_unique_idx;

CREATE UNIQUE INDEX consent_log_call_type_unique_idx
  ON consent_log(vapi_call_id, consent_type);
