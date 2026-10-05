-- Index every foreign key column that had none, plus the membership and GM
-- lookups the access rules and campaign lists filter on.
--
-- Postgres does not index foreign keys on its own. Without these, reading a
-- campaign's notes or dice history scans the whole table, and deleting a
-- character or campaign scans every child table to cascade. Indexes only:
-- no data or behaviour changes.

-- Campaign lists and access rules
create index if not exists campaign_members_user_idx on public.campaign_members (user_id);
create index if not exists campaigns_gm_idx on public.campaigns (gm_id);

-- Campaign screens (filtered by campaign, newest first)
create index if not exists campaign_notes_campaign_created_idx
  on public.campaign_notes (campaign_id, created_at desc);
create index if not exists roll_history_campaign_created_idx
  on public.roll_history (campaign_id, created_at desc);
create index if not exists roll_history_character_idx on public.roll_history (character_id);
create index if not exists campaign_soundtrack_tracks_campaign_idx
  on public.campaign_soundtrack_tracks (campaign_id);
create index if not exists library_entries_campaign_idx on public.library_entries (campaign_id);
create index if not exists map_objects_campaign_idx on public.map_objects (campaign_id);
create index if not exists map_objects_character_idx on public.map_objects (character_id);
create index if not exists notifications_campaign_idx on public.notifications (campaign_id);
create index if not exists notifications_entity_idx on public.notifications (entity_id);

-- Characters and lore
create index if not exists character_weapon_state_entry_idx
  on public.character_weapon_state (character_entry_id);
create index if not exists character_voice_lines_campaign_idx
  on public.character_voice_lines (campaign_id);
create index if not exists entities_character_idx on public.entities (character_id);
create index if not exists entities_parent_idx on public.entities (parent_id);
create index if not exists entity_revisions_campaign_idx on public.entity_revisions (campaign_id);

-- Live playback state
create index if not exists campaign_sound_fx_state_effect_idx
  on public.campaign_sound_fx_state (effect_id);
create index if not exists campaign_soundtrack_state_album_idx
  on public.campaign_soundtrack_state (album_id);
create index if not exists campaign_soundtrack_state_track_idx
  on public.campaign_soundtrack_state (track_id);
create index if not exists campaign_video_playback_video_idx
  on public.campaign_video_playback (video_id);

-- Session chronicles
create index if not exists session_chronicles_created_by_idx
  on public.session_chronicles (created_by);
create index if not exists session_chronicles_prep_note_idx
  on public.session_chronicles (prep_note_id);
create index if not exists session_chronicles_recap_note_idx
  on public.session_chronicles (recap_note_id);
create index if not exists session_chronicle_items_campaign_idx
  on public.session_chronicle_items (campaign_id);
create index if not exists session_chronicle_items_character_idx
  on public.session_chronicle_items (character_id);
create index if not exists session_chronicle_items_subject_idx
  on public.session_chronicle_items (subject_entity_id);

-- Adaptation studio
create index if not exists adaptation_projects_created_by_idx
  on public.adaptation_projects (created_by);
create index if not exists adaptation_facts_reviewed_by_idx
  on public.adaptation_facts (reviewed_by);
create index if not exists adaptation_facts_subject_entity_idx
  on public.adaptation_facts (subject_entity_id);
create index if not exists adaptation_scenes_location_entity_idx
  on public.adaptation_scenes (location_entity_id);
create index if not exists adaptation_asset_links_canonical_entity_idx
  on public.adaptation_asset_links (canonical_entity_id);
create index if not exists adaptation_change_sets_from_snapshot_idx
  on public.adaptation_change_sets (from_snapshot_id);
create index if not exists adaptation_change_sets_to_snapshot_idx
  on public.adaptation_change_sets (to_snapshot_id);
