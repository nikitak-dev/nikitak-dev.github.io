-- Migration: 00008_consent_log
-- Apply via: mcp__supabase__apply_migration(project_id, name='consent_log', query=<this file>)
-- Purpose: TCPA / wiretap-law audit trail for caller consent (recording, marketing,
-- data processing). One row per (vapi_call_id, consent_type). Written by end_of_call
-- workflow AFTER the greeting was delivered and the caller continued the call —
-- which constitutes implied consent under CIPA and most two-party-consent state laws.
-- The disclosure_text is fetched from Vapi assistant.firstMessage at consent time so
-- the audit row reflects exactly what was spoken to this caller, independent of any
-- later prompt edits.

CREATE TABLE consent_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id        uuid REFERENCES customers(id) ON DELETE SET NULL,
  call_id            uuid REFERENCES calls(id) ON DELETE SET NULL,
  vapi_call_id       text,
  phone_number       text NOT NULL,
  consent_type       text NOT NULL CHECK (consent_type IN
                       ('recording', 'marketing', 'data_processing')),
  disclosure_text    text NOT NULL,
  disclosure_channel text NOT NULL CHECK (disclosure_channel IN
                       ('voice_greeting', 'email_optin', 'web_form')),
  consent_action     text NOT NULL CHECK (consent_action IN
                       ('implicit_continued_call', 'explicit_yes', 'explicit_no')),
  recorded_at        timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  metadata           jsonb DEFAULT '{}'::jsonb
);

-- Lookup by customer (audit trail per person)
CREATE INDEX consent_log_customer_idx
  ON consent_log(customer_id) WHERE customer_id IS NOT NULL;

-- Lookup by phone (caller might not have a customer row yet)
CREATE INDEX consent_log_phone_idx
  ON consent_log(phone_number);

-- Recent-first scans for retention sweep and audit queries
CREATE INDEX consent_log_recorded_at_idx
  ON consent_log(recorded_at DESC);

-- Idempotency: same (call, type) only once. Vapi retries become safe — partial because
-- email-opt-in / web-form rows have NULL vapi_call_id and shouldn't be deduped this way.
CREATE UNIQUE INDEX consent_log_call_type_unique_idx
  ON consent_log(vapi_call_id, consent_type)
  WHERE vapi_call_id IS NOT NULL;

-- RLS — service_role only (n8n writes; future owner-dashboard would add another policy)
ALTER TABLE consent_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consent_log_service_role_all" ON consent_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
