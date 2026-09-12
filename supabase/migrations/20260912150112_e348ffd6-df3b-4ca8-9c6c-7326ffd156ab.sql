ALTER TABLE public.library_entries DROP CONSTRAINT IF EXISTS library_entries_source_type_check;
ALTER TABLE public.library_entries DROP CONSTRAINT IF EXISTS library_entries_visibility_check;
ALTER TABLE public.library_entries DROP CONSTRAINT IF EXISTS library_entries_kind_check;
ALTER TABLE public.character_entries DROP CONSTRAINT IF EXISTS character_entries_kind_check;