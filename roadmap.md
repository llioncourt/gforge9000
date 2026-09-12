# Roadmap — Lore merge + Battle grid

Source of the lore side: project "Campaign Weaver" (read-only snapshot).
Order agreed with the user: lore first, battle grid after.

## Phase 1 — Lore core (in progress)
- [x] Schema: entities, knowledge_grants, entity_relationships, entity_revisions on our campaigns (private.is_campaign_* helpers, private.can_view_entity, GRANTs, RLS)
- [x] entity-kinds config ported (KINDS, field defs)
- [x] World browser tab inside the campaign page (group/kind filters, search, create)
- [x] Entity detail page: generated fields, GM-only fields, visibility, save on blur, per-player reveals
- [x] Relationships (link/unlink, both directions)
- [ ] Backlinks/mentions in prose, revision history UI (entity_revisions table exists)

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
