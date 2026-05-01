-- Migration: 00002_storage_recordings
-- Apply via: mcp__claude_ai_Supabase__apply_migration(project_id, name='storage_recordings', query=<this file>)
-- Purpose: создать private bucket 'recordings' для аудио-записей звонков.
-- Naming convention: {vapi_call_id}.mp3

-- Применяется через apply_migration (он выполняется с superuser-уровнем — anon/authenticated
-- роли в storage.buckets писать не могут).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  false,                                   -- private bucket: доступ только через signed URLs
  52428800,                                -- 50 MB на файл — звонок 3 мин ≈ 3-6 MB, запас x10
  ARRAY['audio/mpeg','audio/mp4','audio/wav','audio/x-m4a']
);
