# Soundtrack album carousel

## Goal
Keep the soundtrack area compact when a campaign has multiple albums.

## Changes
- Show one album at a time in the existing soundtrack panel.
- Add previous and next arrow controls plus an album count.
- Preserve cover zoom, track playback, GM deletion, import, and synchronized playback.
- Keep the selected album valid when albums are imported or removed.
- Verify the carousel at desktop and mobile widths, then run the relevant checks.

## Technical details
- Add local selected-album state and clamp it whenever the album list changes.
- Reuse the existing album presentation rather than changing soundtrack data or playback behavior.
- Use the project Button component and accessible labels for carousel navigation.
