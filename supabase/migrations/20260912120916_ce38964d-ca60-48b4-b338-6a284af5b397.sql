ALTER TABLE public.library_entries ADD COLUMN IF NOT EXISTS pack text;
CREATE INDEX IF NOT EXISTS library_entries_pack_idx ON public.library_entries (pack);