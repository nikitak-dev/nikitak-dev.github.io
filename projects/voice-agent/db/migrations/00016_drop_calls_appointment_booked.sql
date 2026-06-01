-- 00016_drop_calls_appointment_booked.sql
-- Drop calls.appointment_booked.
--
-- Why this change:
-- appointment_booked was an LLM-generated structured output (Vapi
-- analysisPlan) reconstructing whether a booking happened during the
-- call. It is redundant with the appointments table — the actual source
-- of truth for bookings — and the LLM reconstruction proved unreliable
-- (call 019e2c4b booked an appointment yet appointment_booked came back
-- false). The n8n end_of_call workflow (extract_call_data + create_record)
-- no longer references this column as of this migration; the Vapi
-- analysisPlan structured output is removed separately in the dashboard.
--
-- Migration 00006 previously renamed success_evaluation -> appointment_booked;
-- this drop retires that field entirely. Booking facts are queried from
-- the appointments table going forward.

ALTER TABLE calls DROP COLUMN IF EXISTS appointment_booked;
