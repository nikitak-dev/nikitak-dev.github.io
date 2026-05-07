-- vapi-evals/cleanup-test-data.sql
--
-- Removes residue created by Vapi Test Suite runs from the voice_agent
-- Supabase database. Run AFTER each suite execution.
--
-- Test rows are identified by:
--   1. Customer email pattern — test scripts use 'test.cs<N>@example.com'.
--      All matching customers + their downstream rows are removed.
--   2. Short call duration (< 30s) on the calls table — useful for catching
--      test calls where the tester AI did not produce a complete identity
--      (e.g., fall-through abort scenarios).
--
-- Order matters: child tables first, then parents. consent_log and
-- appointments both have FKs to calls and customers; calls has FK to
-- customers. We delete leaves up.
--
-- Run via:
--   - Supabase Studio → SQL Editor → paste + run
--   - Or via MCP: mcp__claude_ai_Supabase__execute_sql with this query

BEGIN;

-- 1. consent_log rows tied to test calls or test customers
DELETE FROM consent_log
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE email LIKE 'test.%@example.com'
     OR email = 'test@example.com'
)
   OR vapi_call_id IN (
  SELECT vapi_call_id FROM calls
  WHERE phone_number LIKE '+1000%'
     OR (duration_sec IS NOT NULL AND duration_sec < 30)
);

-- 2. appointments owned by test customers (cascades correctly because
-- gcal_event_id is the unique key — Google Calendar events created by the
-- test suite need to be deleted manually from the calendar UI).
DELETE FROM appointments
WHERE customer_id IN (
  SELECT id FROM customers
  WHERE email LIKE 'test.%@example.com'
     OR email = 'test@example.com'
);

-- 3. calls — short-duration test calls and ones tied to test customers
DELETE FROM calls
WHERE phone_number LIKE '+1000%'
   OR (duration_sec IS NOT NULL AND duration_sec < 30)
   OR customer_id IN (
  SELECT id FROM customers
  WHERE email LIKE 'test.%@example.com'
     OR email = 'test@example.com'
);

-- 4. customers — test entries
DELETE FROM customers
WHERE email LIKE 'test.%@example.com'
   OR email = 'test@example.com';

COMMIT;

-- Verification — should each return 0 rows after cleanup
-- SELECT count(*) FROM customers WHERE email LIKE 'test.%@example.com';
-- SELECT count(*) FROM calls WHERE phone_number LIKE '+1000%' OR duration_sec < 30;
-- SELECT count(*) FROM consent_log WHERE phone_number LIKE '+1000%';

-- NOTE: Google Calendar events created by booking-related test cases
-- (CS-1 currently aborts before booking, but future happy-path tests
-- would create real GCal events) must be removed manually from the
-- calendar — there is no automated path for that yet.
