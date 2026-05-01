-- Migration: 00003_rls_demo_service_role_only
-- Apply via: mcp__claude_ai_Supabase__apply_migration(project_id, name='rls_demo_service_role_only', query=<this file>)
-- Purpose: включить RLS на трёх таблицах + дать полный доступ только service_role.
-- DEMO MODE: anon и authenticated не имеют политик → автоматический отказ (RLS закрытый по умолчанию).

-- ============================================================================
-- ENABLE Row Level Security
-- ============================================================================

ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls        ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Demo policies: service_role only
-- n8n работает через service_role_key (через Supabase node) — у него полный доступ.
-- ============================================================================

CREATE POLICY "service_role full access" ON customers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON calls
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role full access" ON appointments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Storage policy для bucket 'recordings' — service_role полный доступ для n8n upload
CREATE POLICY "service_role recordings rw" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'recordings') WITH CHECK (bucket_id = 'recordings');

-- ============================================================================
-- PRODUCTION HOOK (commented, enable когда будет dashboard auth — sub-project C):
-- ============================================================================

-- CREATE POLICY "owner authenticated read" ON calls
--   FOR SELECT TO authenticated USING (auth.jwt()->>'role' = 'owner');
-- CREATE POLICY "owner authenticated read" ON customers
--   FOR SELECT TO authenticated USING (auth.jwt()->>'role' = 'owner');
-- CREATE POLICY "owner authenticated read" ON appointments
--   FOR SELECT TO authenticated USING (auth.jwt()->>'role' = 'owner');
-- + signed URL стратегия для recordings playback (через service_role в Edge Function)
