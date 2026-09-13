# Campaign card cover

## Build
- Add a cover-image drop zone inside **House rules**, available only to the GM.
- Convert uploaded images to AVIF and store each replacement at a new private path.
- Save the selected cover with the campaign settings and show an immediate local preview while uploading.
- Display the cover behind each campaign card with a readable overlay; cards without a cover remain unchanged.
- Allow the GM to remove the current cover.

## Validation
- Verify upload, replacement, removal, campaign-card display, mobile layout, tests, and app build.

## Technical details
- Reuse the existing private campaign asset storage and access rules.
- Reuse the shared file drop zone and AVIF conversion pipeline.
