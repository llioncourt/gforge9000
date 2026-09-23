# Destructive account wipe — re-authentication status

## Current state (this release)

`public.wipe_all_my_data()` is `SECURITY DEFINER` and authorises the call with
`auth.uid() IS NOT NULL` only. Any valid session — of any age — can invoke the
RPC directly. The "confirm again" step in the profile menu is a client-side
speed bump, not a server-enforced boundary.

What changed in this pass (no database change):

- The final confirmation is no longer unlocked by a `sessionStorage`
  timestamp, which any script could write. It is unlocked by the `amr` /
  `auth_time` / `iat` claims of the **signed access token** (see
  `src/lib/reauth.ts`), which a client cannot forge.
- `sessionStorage` now only remembers that the dialog should reopen after the
  full-page OAuth redirect. It grants nothing.
- The dialog copy no longer implies the confirmation secures the deletion.
- Fail closed: a token with no usable authentication timestamp does not
  unlock the action.

## Proposed migration (NOT APPLIED — awaiting explicit approval)

To make recent re-authentication a real boundary, the database function must
check the same claims server-side. Exact proposed change:

```sql
create or replace function public.wipe_all_my_data(max_auth_age_seconds integer default 300)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  claims jsonb := coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb;
  newest bigint := 0;
  m jsonb;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Newest authentication timestamp from the signed token.
  for m in select * from jsonb_array_elements(coalesce(claims->'amr', '[]'::jsonb)) loop
    newest := greatest(newest, coalesce((m->>'timestamp')::bigint, 0));
  end loop;
  newest := greatest(newest, coalesce((claims->>'auth_time')::bigint, 0));

  if newest = 0
     or extract(epoch from now())::bigint - newest > max_auth_age_seconds then
    raise exception 'Recent re-authentication required';
  end if;

  -- ... existing deletion body unchanged ...
end;
$$;
```

Why this proves recent re-authentication: `request.jwt.claims` is populated by
PostgREST from the **verified** access token. `amr[].timestamp` is written by
GoTrue at each authentication event (password, OAuth, MFA), so a token issued
long ago — or refreshed without re-authenticating — cannot satisfy the window.
The client cannot influence these values without a valid signing key.

Deployment notes for whoever approves it:

- The existing deletion body must be copied verbatim into the new definition.
- The default window (300 s) should match `REAUTH_MAX_AGE_SECONDS` in
  `src/lib/reauth.ts`.
- `grant execute on function public.wipe_all_my_data(integer) to authenticated;`
  and revoke/drop the old zero-argument overload in the same migration so no
  unguarded path remains.
- The UI error path must surface "Recent re-authentication required" as a
  prompt to confirm again rather than a generic failure.
