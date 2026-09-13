# Roadmap — Lore merge + Battle grid

Source of the lore side: project "Campaign Weaver" (read-only snapshot).
Order agreed with the user: lore first, battle grid after.

## Phase 1 — Lore core (in progress)
- [x] Schema: entities, knowledge_grants, entity_relationships, entity_revisions on our campaigns (private.is_campaign_* helpers, private.can_view_entity, GRANTs, RLS)
- [x] entity-kinds config ported (KINDS, field defs)
- [x] World browser tab inside the campaign page (group/kind filters, search, create)
- [x] Entity detail page: generated fields, GM-only fields, visibility, save on blur, per-player reveals
- [x] Relationships (link/unlink, both directions)
- [x] Backlinks/mentions in prose, revision history UI with restore

## Phase 2 — Story & play
- [x] Story tab (arcs/adventures/chapters/scenes/quests/mysteries)
- [x] Sessions prep/recap merged with existing campaign notes
- [x] Timeline + in-world calendar
- [x] Relationship graph
- [x] Player portal / knowledge grants UI

## Phase 3 — Assets, import/export, AI
- [x] Assets library (private storage, GM share toggle) + AssetImage
- [x] Import/export of campaign lore (UCF-LORE v1 JSON)
- [x] AI generation helpers (Lovable AI Gateway) — lore draft dialog, GM-only, review before save

## Phase 4 — Battle grid (done)
- [x] maps + map_objects schema, RLS, fog of war
- [x] Image map + square/hex grid, snap, zoom/pan
- [x] Draggable tokens, distance measurement
- [x] Realtime sync GM/players
- [x] Token visual: 3D .glb model if the character has one, else portrait, else simple 2D name token

