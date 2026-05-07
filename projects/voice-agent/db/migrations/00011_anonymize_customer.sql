-- Migration: 00011_anonymize_customer
-- Apply via: mcp__supabase__apply_migration(project_id, name='anonymize_customer', query=<this file>)
-- Purpose: GDPR Article 17 / CCPA right-to-be-forgotten support. Replaces PII with
-- placeholders / NULL, deletes recording MP3s, records the anonymization on the
-- customer row for audit. Designed to be called from n8n on a verified erasure
-- request (identity-confirmed via callback or signed letter — out of scope here).
--
-- Tension with TCPA: 47 USC §227 + FCC implementing rules require retaining
-- written consent records for "at least four years" from the date consent was
-- collected. consent_log rows are therefore kept intact (including phone_number)
-- even after anonymization — without them an FCC audit cannot be answered. The
-- customer FK on consent_log uses ON DELETE SET NULL (00008) so deletion of the
-- customer row, if ever performed, leaves consent_log standalone. This function
-- does NOT delete the customer row — it only redacts identifying fields and sets
-- anonymized_at, preserving the structural FK chain for analytics.
--
-- Related: GDPR Art. 17(3)(b) explicitly carves out retention obligated by
-- "Union or Member State law" — TCPA is the US analogue of that carve-out.

-- ============================================================================
-- 1. Audit columns on customers
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS anonymized_reason text;

-- ============================================================================
-- 2. The function
-- ============================================================================

CREATE OR REPLACE FUNCTION anonymize_customer(
  p_customer_id uuid,
  p_reason text DEFAULT 'gdpr_erasure_request'
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, storage
AS $$
DECLARE
  v_calls_redacted        int := 0;
  v_recordings_deleted    int := 0;
  v_appointments_redacted int := 0;
  v_already_anonymized    boolean;
  v_paths                 text[];
BEGIN
  -- Existence + idempotency check
  SELECT (anonymized_at IS NOT NULL)
    INTO v_already_anonymized
    FROM customers WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer % not found', p_customer_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_already_anonymized THEN
    RETURN jsonb_build_object(
      'customer_id', p_customer_id,
      'status', 'already_anonymized',
      'calls_redacted', 0,
      'recordings_deleted', 0,
      'appointments_redacted', 0
    );
  END IF;

  -- Collect storage paths before nulling them out (used for storage.objects DELETE)
  SELECT COALESCE(array_agg(recording_storage_path) FILTER (WHERE recording_storage_path IS NOT NULL), '{}')
    INTO v_paths
    FROM calls WHERE customer_id = p_customer_id;

  -- 1. Redact customers row, mark anonymized
  --    vapi_customer_number is UNIQUE NOT NULL — replace with deterministic placeholder
  UPDATE customers
     SET full_name            = '[ANONYMIZED]',
         email                = NULL,
         phone_number         = NULL,
         vapi_customer_number = 'anonymized:' || id::text,
         notes                = NULL,
         consent_recording    = false,
         consent_marketing    = false,
         anonymized_at        = now(),
         anonymized_reason    = p_reason,
         updated_at           = now()
   WHERE id = p_customer_id;

  -- 2. Redact calls owned by this customer
  UPDATE calls
     SET phone_number         = NULL,
         transcript_messages  = '[]'::jsonb,
         transcript_text      = '[ANONYMIZED]',
         summary              = NULL,
         recording_url        = NULL,
         recording_storage_path = NULL,
         recording_archived_at  = NULL,
         vapi_metadata        = '{}'::jsonb,
         updated_at           = now()
   WHERE customer_id = p_customer_id;
  GET DIAGNOSTICS v_calls_redacted = ROW_COUNT;

  -- 3. Delete recording MP3s from Storage (paths collected before step 2)
  IF array_length(v_paths, 1) > 0 THEN
    DELETE FROM storage.objects
     WHERE bucket_id = 'recordings'
       AND name = ANY(v_paths);
    GET DIAGNOSTICS v_recordings_deleted = ROW_COUNT;
  END IF;

  -- 4. Redact appointments owned by this customer
  UPDATE appointments
     SET address    = '[ANONYMIZED]',
         notes      = NULL,
         updated_at = now()
   WHERE customer_id = p_customer_id;
  GET DIAGNOSTICS v_appointments_redacted = ROW_COUNT;

  -- 5. consent_log: intentionally NOT touched.
  --    TCPA retention obligation overrides erasure for this table; see header.

  RETURN jsonb_build_object(
    'customer_id',           p_customer_id,
    'status',                'anonymized',
    'reason',                p_reason,
    'calls_redacted',        v_calls_redacted,
    'recordings_deleted',    v_recordings_deleted,
    'appointments_redacted', v_appointments_redacted,
    'consent_log_retained',  true
  );
END;
$$;

-- Function runs as the migration owner (postgres) via SECURITY DEFINER, but only
-- service_role is allowed to invoke it. anon / authenticated cannot — even if
-- some future owner-dashboard policy granted them other access.
REVOKE ALL ON FUNCTION anonymize_customer(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION anonymize_customer(uuid, text) TO service_role;

COMMENT ON FUNCTION anonymize_customer(uuid, text) IS
  'GDPR Art.17 erasure: redacts PII on customers/calls/appointments, deletes recording MP3s, marks customers.anonymized_at. consent_log retained per TCPA. service_role only.';
