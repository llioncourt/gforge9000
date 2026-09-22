CREATE TABLE public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Claude',
  token_hash text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mcp_tokens_user_idx ON public.mcp_tokens (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_tokens TO authenticated;
GRANT ALL ON public.mcp_tokens TO service_role;

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY mcp_tokens_select ON public.mcp_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY mcp_tokens_insert ON public.mcp_tokens FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY mcp_tokens_update ON public.mcp_tokens FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY mcp_tokens_delete ON public.mcp_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_mcp_tokens_updated_at BEFORE UPDATE ON public.mcp_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();