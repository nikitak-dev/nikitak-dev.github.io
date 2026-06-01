-- eval/ownership-regression.sql
--
-- SQL-INVARIANT check for the appointment-ownership rule that the Vapi Evals
-- (chat.mockConversation) cannot cover: mutating flows (update_event /
-- delete_event) must verify ownership by the Google Calendar gcal_event_id +
-- customer_id — NOT by the Postgres row UUID.
--
-- SCOPE / HONEST LIMITS
--   This runs the SAME predicate as the n8n verify_ownership node, but it is a
--   COPY transcribed from that node and run directly against Supabase — it does
--   NOT execute the n8n workflow. It is kept in sync with the node BY HAND; if
--   the node SQL changes and this file isn't updated, this test won't catch it.
--   Real end-to-end n8n execution (n8n + GCal + Supabase) is proven by the LIVE
--   test (2026-05-31: same-call book->cancel and book->reschedule). This file is
--   a cheap regression net for the SQL predicate, not a replacement for that.
--
-- WHY THIS EXISTS
--   Bug found 2026-05-31: book_event returned the appointments.id UUID as
--   `appointment_id` instead of the gcal_event_id. Sophie then reused that UUID,
--   so same-call cancel/reschedule failed verify_ownership (UUID != gcal_event_id
--   column) and returned "I couldn't find that appointment under your account."
--   Fixed by a `return_booked` Set node handing back the gcal id. The mock-tool
--   Vapi evals assert only conversational decisions (they mock tool output and
--   never run the backend), so this invariant needs a backend-level lock.
--
-- WHAT IT LOCKS — mirrors the EXACT verify_ownership predicate used by both
-- update_event (ybMQK7v1AjfkUvQL) and delete_event (8RhZABAIt5UpR9ck):
--   SELECT id FROM appointments
--   WHERE gcal_event_id = $1 AND customer_id = $2
--     AND status IN ('scheduled','rescheduled') LIMIT 1
--
-- HOW TO RUN
--   Supabase SQL editor, or MCP execute_sql (project rhacvzgrirbpncwggdwv).
--   Self-seeding + self-cleaning: on success it deletes its rows and raises a
--   NOTICE; on any failed assertion it RAISEs EXCEPTION (which rolls back the
--   seed, leaving no residue). Re-runnable; pre-cleans its own fixture rows.
--
-- PASS = completes with NOTICE 'ownership-regression: ALL CHECKS PASSED'.
-- FAIL = raises 'FAIL <n>: ...' naming the broken invariant.

DO $$
DECLARE
  cust_a uuid; cust_b uuid; appt uuid;
  gcal text := 'test_gcal_ownership_001';
  found uuid;
BEGIN
  -- idempotent pre-clean (appointments first: FK to customers)
  DELETE FROM appointments WHERE gcal_event_id = gcal;
  DELETE FROM customers WHERE email IN ('test.owner-a@example.com','test.owner-b@example.com');

  INSERT INTO customers(email, full_name) VALUES('test.owner-a@example.com','Owner A') RETURNING id INTO cust_a;
  INSERT INTO customers(email, full_name) VALUES('test.owner-b@example.com','Owner B') RETURNING id INTO cust_b;
  INSERT INTO appointments(customer_id, gcal_event_id, service_type, address, start_time, end_time, status)
    VALUES(cust_a, gcal, 'Lawn Mowing', '1 Test St', now()+interval '2 days', now()+interval '2 days 2 hours', 'scheduled')
    RETURNING id INTO appt;

  -- 1. GRANT: correct gcal_event_id + correct customer_id -> ownership matches
  SELECT id INTO found FROM appointments
    WHERE gcal_event_id = gcal AND customer_id = cust_a AND status IN ('scheduled','rescheduled') LIMIT 1;
  IF found IS NULL THEN RAISE EXCEPTION 'FAIL 1: owner + gcal_event_id should match'; END IF;

  -- 2. BUG-GUARD (the 2026-05-31 bug): the appointment UUID must NOT satisfy the gcal_event_id predicate
  found := NULL;
  SELECT id INTO found FROM appointments
    WHERE gcal_event_id = appt::text AND customer_id = cust_a AND status IN ('scheduled','rescheduled') LIMIT 1;
  IF found IS NOT NULL THEN RAISE EXCEPTION 'FAIL 2: appointment UUID must NOT satisfy gcal_event_id ownership'; END IF;

  -- 3. CROSS-CUSTOMER DENY: right gcal event, wrong customer -> no match
  found := NULL;
  SELECT id INTO found FROM appointments
    WHERE gcal_event_id = gcal AND customer_id = cust_b AND status IN ('scheduled','rescheduled') LIMIT 1;
  IF found IS NOT NULL THEN RAISE EXCEPTION 'FAIL 3: another customer must not own this gcal event'; END IF;

  -- 4. STATUS GUARD: a canceled appointment is not ownable for mutation
  UPDATE appointments SET status = 'canceled' WHERE id = appt;
  found := NULL;
  SELECT id INTO found FROM appointments
    WHERE gcal_event_id = gcal AND customer_id = cust_a AND status IN ('scheduled','rescheduled') LIMIT 1;
  IF found IS NOT NULL THEN RAISE EXCEPTION 'FAIL 4: canceled appointment must not be ownable'; END IF;

  -- 5. CONVENTION: the identifier handed back (event_lookup selects gcal_event_id AS id)
  --    is the gcal id, and is distinct from the row UUID.
  IF (SELECT gcal_event_id FROM appointments WHERE id = appt) <> gcal THEN RAISE EXCEPTION 'FAIL 5: gcal_event_id mismatch'; END IF;
  IF gcal = appt::text THEN RAISE EXCEPTION 'FAIL 5b: gcal id must differ from the row UUID'; END IF;

  -- cleanup on success
  DELETE FROM appointments WHERE id = appt;
  DELETE FROM customers WHERE id IN (cust_a, cust_b);
  RAISE NOTICE 'ownership-regression: ALL CHECKS PASSED';
END $$;
