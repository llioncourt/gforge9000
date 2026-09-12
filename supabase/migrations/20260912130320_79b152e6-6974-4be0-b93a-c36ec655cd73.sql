ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS portrait_path text;

CREATE TABLE IF NOT EXISTS public.content_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  description text,
  source_label text NOT NULL DEFAULT 'User content',
  source_edition text,
  source_type text NOT NULL DEFAULT 'user',
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_packs_owner_name_idx
  ON public.content_packs (owner_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_packs TO authenticated;
GRANT ALL ON public.content_packs TO service_role;

ALTER TABLE public.content_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY packs_select ON public.content_packs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR visibility = 'public');
CREATE POLICY packs_insert ON public.content_packs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY packs_update ON public.content_packs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY packs_delete ON public.content_packs FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER content_packs_updated BEFORE UPDATE ON public.content_packs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();