-- Migration: 00010_rls_production_owner_read
-- Apply via: mcp__supabase__apply_migration(project_id, name='rls_production_owner_read', query=<this file>)
-- Purpose: layer read-only owner policies on top of the demo service_role policies from 00003.
-- Service_role keeps full write access (n8n unchanged); authenticated users with the custom
-- claim user_role='owner' get SELECT on operational tables. Targeted at a future read-only
-- owner dashboard. Mutations from any UI must still go through n8n / service_role.
--
-- Policies are inert until two pieces are wired:
--   1. Supabase Auth Custom Access Token Hook that injects user_role into the JWT.
--      Reference: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
--   2. An owner-dashboard frontend that authenticates and calls PostgREST / supabase-js.
--
-- Why the claim is named user_role (not role): auth.jwt()->>'role' is reserved by Supabase
-- for the Postgres role (anon / authenticated / service_role). A custom 'role' claim would
-- silently collide, so the convention is user_role / app_role.

-- ============================================================================
-- Owner read on operational tables
-- ============================================================================

CREATE POLICY "owner_authenticated_read" ON customers
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'user_role' = 'owner');

CREATE POLICY "owner_authenticated_read" ON calls
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'user_role' = 'owner');

CREATE POLICY "owner_authenticated_read" ON appointments
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'user_role' = 'owner');

CREATE POLICY "owner_authenticated_read" ON consent_log
  FOR SELECT TO authenticated
  USING (auth.jwt() ->> 'user_role' = 'owner');

-- ============================================================================
-- Owner read on the recordings storage bucket
-- ============================================================================
-- This grants metadata listing on storage.objects rows scoped to the recordings
-- bucket. Actual MP3 download stays behind signed URLs minted by an Edge Function
-- using service_role — owners never receive the bucket key directly. The signed-URL
-- helper is out of scope for this migration; documented as a follow-up.

CREATE POLICY "owner_authenticated_recordings_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recordings'
    AND auth.jwt() ->> 'user_role' = 'owner'
  );
