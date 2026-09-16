# Visibility badges on cards

## Goal
Show a consistent, color-coded visibility badge on every card whose record has visibility controls, only when the current viewer is the campaign GM. Players will not see these badges.

## Changes
- Add one shared visibility badge component that normalizes the existing visibility values into clear labels and semantic colors:
  - GM only / private
  - All players / shared
  - Selected players
- Add the GM-only badge to entity cards in World & Lore, Story, and Timeline.
- Add the GM-only badge to campaign Library asset cards, session cards, campaign note cards, and battle-map cards where the existing record exposes visibility.
- Replace visibility text already embedded in card metadata with the shared badge where applicable.
- Keep visibility controls and data behavior unchanged; this is a presentation-only change.

## Validation
- Confirm each affected card shows the correct badge for a GM.
- Confirm the same badges are absent for players.
- Run focused checks and verify the app builds successfully.
