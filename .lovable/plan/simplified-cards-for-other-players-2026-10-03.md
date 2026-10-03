# Simplified cards for other players

## Goal
In the campaign roster, keep the signed-in player's existing character card exactly as it is. Show each other player's character in a simplified card containing only:
- character name
- player name
- character portrait as the card background

GM and NPC roster behavior will remain unchanged.

## Implementation
- Detect other players' characters by character ownership, excluding NPCs.
- Render the simplified card only for non-GM viewers looking at another player's character.
- Preserve the full existing card for the viewer's own character.
- Add focused regression coverage for the card-selection behavior.
- Verify the roster at desktop and mobile sizes and check the existing test/build signals.
