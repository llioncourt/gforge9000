CREATE TABLE public.user_voice_keys (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL CHECK (char_length(api_key) BETWEEN 10 AND 200),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_voice_keys TO authenticated;
GRANT ALL ON public.user_voice_keys TO service_role;
ALTER TABLE public.user_voice_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own voice key only" ON public.user_voice_keys FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.characters ADD COLUMN voice_id text, ADD COLUMN voice_name text;