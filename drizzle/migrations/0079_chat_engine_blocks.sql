-- Motor do chat programado: a fala em blocos classificados fica na versão da transcrição,
-- e cada comentário sabe de que bloco nasceu, se vem antes ou depois dele, e se foi editado à mão.
ALTER TABLE public.webinar_transcript_versions
  ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.scheduled_comments
  ADD COLUMN IF NOT EXISTS slot_id text,
  ADD COLUMN IF NOT EXISTS block_id text,
  ADD COLUMN IF NOT EXISTS block_type text,
  ADD COLUMN IF NOT EXISTS dependency text,
  ADD COLUMN IF NOT EXISTS interaction_type text,
  ADD COLUMN IF NOT EXISTS window_start_ms integer,
  ADD COLUMN IF NOT EXISTS window_end_ms integer,
  ADD COLUMN IF NOT EXISTS profile_id text,
  ADD COLUMN IF NOT EXISTS manually_edited boolean NOT NULL DEFAULT false;
