-- 00013_unique_customers_email_plain.sql
-- Replace the functional UNIQUE (LOWER(email)) index with a plain UNIQUE
-- constraint on customers.email.
--
-- Why this change:
-- n8n's Postgres `upsert` operation supports ON CONFLICT (column) only,
-- not ON CONFLICT (expression). The functional index from migration 00001
-- (customers_email_lower_unique_idx on LOWER(email)) is not recognized as
-- a conflict target by `upsert`, causing the create_client workflow's
-- upsert_customer node to throw:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification" (NodeOperationError).
--
-- Why this is safe:
-- The create_client and end_of_call workflows both normalize email to
-- lowercase upstream before the upsert (see KEY PATTERNS / CRM hygiene
-- in VoiceAgentDocs and ADR-005). The lowercase invariant therefore
-- holds at the application layer, and a plain UNIQUE on the raw column
-- gives the same collision semantics that the functional UNIQUE on
-- LOWER(email) gave.
--
-- Defensive check: if any post-LOWER duplicate emails are present,
-- abort the migration rather than silently corrupting data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM customers
    WHERE email IS NOT NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'cannot add UNIQUE (email): duplicate lowercased emails exist in customers table; run cleanup before retrying this migration';
  END IF;
END $$;

DROP INDEX IF EXISTS customers_email_lower_unique_idx;

ALTER TABLE customers
  ADD CONSTRAINT customers_email_key UNIQUE (email);
