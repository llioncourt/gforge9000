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
- [x] Token polish: current NPC photos remain visible, tokens fit hex cells, and map zoom scales tokens with the grid


## Phase 5 — Campaign soundtrack
- [x] Silicon Studios ZIP import with private campaign storage
- [x] GM-synchronized persistent player across campaign-related pages
- [x] Player teardown outside campaign scope and regression tests

## Phase 6 — Campaign media (verification)
- [x] Consolidate Intro and Soundtrack into Media with Videos, Soundtrack and Sound FX tabs
- [x] Expand Videos to typed multi-video uploads while preserving the mandatory Intro gate
- [x] Add GM-triggered synchronized one-shot Sound FX
- [x] Update campaign ZIP import schema and Markdown instructions for Videos, Soundtracks and Sound FX

## UI motion consistency
- [x] Add shared flip-and-zoom feedback to whole-card interactions
- [x] Add matching zoom entrance to dialogs and confirmations
- [x] Verify representative cards and dialogs in the live preview

## Character screen controls
- [x] Replace top text actions with icon-only buttons and accessible hints
- [x] Add a Back button to the character screen
