CREATE OR REPLACE FUNCTION private.pack_shared_with(_pack text, _owner uuid, _viewer uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campaigns c
    JOIN public.campaign_members mv ON mv.campaign_id = c.id AND mv.user_id = _viewer
    WHERE _pack IS NOT NULL
      AND btrim(_pack) <> ''
      AND _owner IS NOT NULL
      AND (
        c.gm_id = _owner
        OR EXISTS (SELECT 1 FROM public.campaign_members mo WHERE mo.campaign_id = c.id AND mo.user_id = _owner)
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(c.settings->'allowed_packs') = 'array'
               THEN c.settings->'allowed_packs' ELSE '[]'::jsonb END
        ) ap
        WHERE lower(btrim(ap)) = lower(btrim(_pack))
      )
  );
$$;

DROP POLICY IF EXISTS library_select ON public.library_entries;
CREATE POLICY library_select ON public.library_entries
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR visibility = 'public'
  OR (visibility = 'campaign' AND campaign_id IS NOT NULL AND private.is_campaign_member(campaign_id, auth.uid()))
  OR private.pack_shared_with(pack, owner_id, auth.uid())
);

DROP POLICY IF EXISTS packs_select ON public.content_packs;
CREATE POLICY packs_select ON public.content_packs
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR visibility = 'public'
  OR private.pack_shared_with(name, owner_id, auth.uid())
);