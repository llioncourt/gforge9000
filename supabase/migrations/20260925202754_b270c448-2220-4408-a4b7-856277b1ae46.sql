ALTER TABLE public.campaign_sound_fx_state
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];