-- Migration: 00004_security_hardening
-- Apply via: mcp__claude_ai_Supabase__apply_migration(project_id, name='security_hardening', query=<this file>)
-- Purpose: устранить security warnings от Supabase advisor:
--   1. function_search_path_mutable — задать пустой search_path для set_updated_at()
--      Защита от schema-injection: триггер не сможет найти function/table в схемах выше
--      по search_path (защита от перехвата через одноимённые объекты в злонамеренной схеме).
--   2. extension_in_public — переместить pg_trgm в schema 'extensions' (создаётся Supabase по
--      умолчанию). pgcrypto уже там был — мой CREATE EXTENSION IF NOT EXISTS был no-op.
-- После: get_advisors security должен пройти без warnings.

ALTER FUNCTION public.set_updated_at() SET search_path = '';

ALTER EXTENSION pg_trgm SET SCHEMA extensions;
