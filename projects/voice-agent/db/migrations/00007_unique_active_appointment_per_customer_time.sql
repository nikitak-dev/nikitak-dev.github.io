-- Migration: 00007_unique_active_appointment_per_customer_time
-- Apply via: mcp__supabase__apply_migration(project_id, name='unique_active_appointment_per_customer_time', query=<this file>)
-- Purpose: prevent double-booking the same customer at the same start_time. Defence-in-depth
-- on top of book_event's GCal idempotency check (ADR-003) — protects when GCal lookup fails
-- or returns stale data, and surfaces as a Postgres UNIQUE violation that the n8n upsert can
-- gracefully turn into the standard error-instruction contract (ADR-004).
--
-- Partial index — applies only when status is one of the "live" values. Once an appointment
-- is canceled / completed / no-show, the same (customer_id, start_time) pair becomes available
-- for a fresh booking. Without the WHERE clause we would block legitimate re-bookings after
-- cancellation.

CREATE UNIQUE INDEX appointments_active_customer_time_unique_idx
  ON appointments (customer_id, start_time)
  WHERE status IN ('scheduled', 'rescheduled');
