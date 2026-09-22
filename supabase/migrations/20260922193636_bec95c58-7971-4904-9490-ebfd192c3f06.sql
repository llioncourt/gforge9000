revoke all on function public.mcp_delete_campaign(uuid, text) from anon;
revoke all on function public.mcp_create_campaign(text, text, jsonb) from anon;
revoke all on function public.mcp_update_campaign(uuid, jsonb, jsonb) from anon;
revoke all on function public.mcp_campaign_settings_patch(jsonb, jsonb) from anon;