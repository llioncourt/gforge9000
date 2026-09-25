ALTER TABLE public.campaign_members DROP CONSTRAINT IF EXISTS campaign_members_role_check;
ALTER TABLE public.campaign_members ADD CONSTRAINT campaign_members_role_check CHECK (role IN ('gm','player','producer'));

CREATE OR REPLACE FUNCTION private.is_campaign_producer(_campaign uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.campaign_members WHERE campaign_id = _campaign AND user_id = _user AND role = 'producer')
$$;

CREATE OR REPLACE FUNCTION public.set_campaign_member_role(_campaign uuid, _user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_campaign_gm(_campaign, auth.uid()) THEN RAISE EXCEPTION 'Only the Game Master can change roles.'; END IF;
  IF _role NOT IN ('player','producer') THEN RAISE EXCEPTION 'Invalid role.'; END IF;
  IF _user = (SELECT gm_id FROM public.campaigns WHERE id = _campaign) THEN RAISE EXCEPTION 'Transfer Game Master first.'; END IF;
  UPDATE public.campaign_members SET role = _role WHERE campaign_id = _campaign AND user_id = _user;
  IF NOT FOUND THEN RAISE EXCEPTION 'That user is not a member of this campaign.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_campaign_member_role(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_campaign_member_role(uuid, uuid, text) TO authenticated;

CREATE TABLE public.campaign_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  submitted_by uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('video','sound_fx','image','soundtrack')),
  title text NOT NULL,
  video_type text,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.campaign_submissions TO authenticated;
GRANT ALL ON public.campaign_submissions TO service_role;
ALTER TABLE public.campaign_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY submissions_select ON public.campaign_submissions FOR SELECT TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()) OR private.is_campaign_producer(campaign_id, auth.uid()));
CREATE POLICY submissions_insert ON public.campaign_submissions FOR INSERT TO authenticated
  WITH CHECK (submitted_by = auth.uid() AND private.is_campaign_producer(campaign_id, auth.uid())
    AND split_part(storage_path, '/', 1) = campaign_id::text AND split_part(storage_path, '/', 2) = auth.uid()::text);
CREATE POLICY submissions_delete ON public.campaign_submissions FOR DELETE TO authenticated
  USING (private.is_campaign_gm(campaign_id, auth.uid()) OR submitted_by = auth.uid());
CREATE TRIGGER update_campaign_submissions_updated_at BEFORE UPDATE ON public.campaign_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX campaign_submissions_campaign_idx ON public.campaign_submissions(campaign_id, created_at);

CREATE POLICY campaign_submissions_storage_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'campaign-submissions' AND (
    private.is_campaign_gm(((storage.foldername(name))[1])::uuid, auth.uid())
    OR private.is_campaign_producer(((storage.foldername(name))[1])::uuid, auth.uid())));
CREATE POLICY campaign_submissions_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'campaign-submissions' AND (storage.foldername(name))[2] = auth.uid()::text
  AND private.is_campaign_producer(((storage.foldername(name))[1])::uuid, auth.uid()));
CREATE POLICY campaign_submissions_storage_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'campaign-submissions' AND (
    (storage.foldername(name))[2] = auth.uid()::text
    OR private.is_campaign_gm(((storage.foldername(name))[1])::uuid, auth.uid())));