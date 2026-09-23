ALTER TABLE public.adaptation_projects
  ADD COLUMN IF NOT EXISTS target_book_narrative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS target_adventure_module boolean NOT NULL DEFAULT false;