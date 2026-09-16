# Flip-and-zoom effect for clickable cards

## Goal
Give every whole-card interaction a consistent tactile transition: a slight 3D flip and zoom when hovered/pressed, followed by a zoom-in entrance for the modal that card opens. Existing navigation, zoom, editing, dragging, and card actions remain unchanged.

## Implementation
- Add one reusable `interactive-card` motion utility to the shared styles, using perspective, subtle rotation, scale, focus-visible feedback, and a pressed state.
- Add a matching entrance animation to shared dialogs so modal content scales and rotates into place when opened.
- Apply the card utility only to surfaces where the entire card is clickable; exclude nested icon buttons, image zoom controls, checkboxes, draggable rows, upload areas, and static panels.
- Preserve the current visual design, colors, sizes, links, and permissions.
- Respect reduced-motion preferences by disabling the 3D movement while keeping all interactions functional.

## Verification
- Check representative campaign, character, World & Lore, Library, Timeline, Media, and Pack cards.
- Confirm clicking nested controls does not trigger the card action.
- Verify desktop and touch behavior, modal stacking, and current build diagnostics.
