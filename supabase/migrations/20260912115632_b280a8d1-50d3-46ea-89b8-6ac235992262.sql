CREATE TABLE public.character_weapon_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  character_entry_id UUID NOT NULL REFERENCES public.character_entries(id) ON DELETE CASCADE,
  mode_key TEXT NOT NULL,
  current_shots INTEGER NOT NULL DEFAULT 0 CHECK (current_shots >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (character_id, character_entry_id, mode_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.character_weapon_state TO authenticated;
GRANT ALL ON public.character_weapon_state TO service_role;

ALTER TABLE public.character_weapon_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY weapon_state_select ON public.character_weapon_state
  FOR SELECT TO authenticated
  USING (private.can_view_character(character_id, auth.uid()));

CREATE POLICY weapon_state_insert ON public.character_weapon_state
  FOR INSERT TO authenticated
  WITH CHECK (private.owns_character(character_id, auth.uid()));

CREATE POLICY weapon_state_update ON public.character_weapon_state
  FOR UPDATE TO authenticated
  USING (private.owns_character(character_id, auth.uid()))
  WITH CHECK (private.owns_character(character_id, auth.uid()));

CREATE POLICY weapon_state_delete ON public.character_weapon_state
  FOR DELETE TO authenticated
  USING (private.owns_character(character_id, auth.uid()));

CREATE TRIGGER character_weapon_state_updated
  BEFORE UPDATE ON public.character_weapon_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();