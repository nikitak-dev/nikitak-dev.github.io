-- Migration: 00012_anonymize_customer_revoke_grants
-- Apply via: mcp__supabase__apply_migration(project_id, name='anonymize_customer_revoke_public_grants', query=<this file>)
-- Purpose: close two security advisor warnings raised after 00011
-- (anon_security_definer_function_executable, authenticated_security_definer_function_executable).
--
-- Background: Postgres default privileges grant EXECUTE on any function in the
-- public schema to PUBLIC. Supabase additionally pre-grants EXECUTE to anon and
-- authenticated roles so PostgREST can expose RPCs. 00011 did `REVOKE ALL ... FROM PUBLIC`,
-- which removes the PUBLIC grant but leaves the explicit anon / authenticated grants
-- intact — both roles could still call the function via /rest/v1/rpc/anonymize_customer.
-- Revoking from each role explicitly closes the surface; only service_role retains EXECUTE.

REVOKE EXECUTE ON FUNCTION anonymize_customer(uuid, text) FROM anon, authenticated;
