# Roadmap — Lore merge + Battle grid

Source of the lore side: project "Campaign Weaver" (read-only snapshot).
Order agreed with the user: lore first, battle grid after.

## Phase 1 — Lore core (in progress)
- [ ] Schema: entities, knowledge_grants, entity_relationships, entity_revisions on our campaigns (private.is_campaign_* helpers, GRANTs, RLS)
- [ ] entity-kinds config ported (KINDS, field defs)
- [ ] World browser tab inside the campaign page (list by kind, search, create)
- [ ] Entity detail page: generated fields, GM-only fields, visibility, autosave, revisions
- [ ] Relationships + backlinks + mentions

## Phase 2 — Story & play
- [ ] Story tab (arcs/adventures/chapters/scenes/quests/mysteries)
- [ ] Sessions prep/recap merged with existing campaign notes
- [ ] Timeline + in-world calendar
- [ ] Relationship graph
- [ ] Player portal / knowledge grants UI

## Phase 3 — Assets, import/export, AI
- [ ] Assets library (private storage) + AssetImage
- [ ] Import/export of campaign lore
- [ ] AI generation helpers (Lovable AI Gateway)

## Phase 4 — Battle grid
- [ ] maps + map_objects schema, fog of war
- [ ] Image map + square/hex grid, snap, zoom/pan
- [ ] Draggable tokens, distance measurement
- [ ] Realtime sync GM/players
- [ ] Token visual: 3D .glb model if the character has one, else portrait, else simple 2D name token
