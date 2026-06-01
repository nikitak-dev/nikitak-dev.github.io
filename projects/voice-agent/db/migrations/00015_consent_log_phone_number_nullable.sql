-- 00015_consent_log_phone_number_nullable.sql
-- Drop NOT NULL on consent_log.phone_number to accept web-channel calls.
--
-- Why this change:
-- The end_of_call workflow's record_consent node writes one consent_log
-- row per completed Vapi call. On phone-channel calls, Vapi sends
-- customer.number (E.164) — populated as expected. On web-channel calls
-- (Dashboard Talk button, embed widget) Vapi sends no customer.number at
-- all; the value reaches the workflow as null. record_consent then fails:
--   "null value in column 'phone_number' of relation 'consent_log'
--    violates not-null constraint"
-- — even though the row is otherwise valid (vapi_call_id, disclosure_text,
-- consent_action, consent_type, recorded_at all present).
--
-- The TCPA / wiretap audit semantics of consent_log are about
-- disclosure_text (what the caller actually heard, fetched live from
-- Vapi's firstMessage) and consent_action (the implicit-continued-call
-- evidence). phone_number is a useful join key when present, but its
-- absence on web calls doesn't undermine the audit purpose. Allowing
-- NULL is the safe, semantically-correct relaxation.

ALTER TABLE consent_log
  ALTER COLUMN phone_number DROP NOT NULL;
