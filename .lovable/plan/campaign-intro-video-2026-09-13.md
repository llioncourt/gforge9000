# Campaign intro video

## Goal
Add an Intro tab before Roster and require every campaign member, including the GM, to finish the campaign intro before using the campaign for the first time.

## Experience
- The Intro tab displays the current campaign video.
- The GM can upload or replace one MP4 through the standard drag-and-drop area and remove it with confirmation.
- When a campaign has an intro, anyone who has not opted out sees it in a full-screen blocking player upon entering the campaign.
- The blocking view cannot be dismissed, skipped, or navigated around before playback reaches the end.
- After the video ends, show a square “Don’t show this intro again” checkbox and a Continue button.
- If checked, store that choice per user and campaign. If unchecked, the intro appears again on the next campaign entry.
- Replacing the video creates a new intro version, so everyone sees the new intro once and can make a new choice.

## Data and access
- Store the current intro’s private video path and version in a campaign-scoped table.
- Store completion preferences per campaign, user, and intro version.
- Campaign members may read the intro; only the GM may upload, replace, or remove it.
- Each user may only read and update their own completion preference.
- Keep videos in a private campaign media bucket with campaign membership policies.

## Verification
- Add automated checks for MP4 validation and versioned viewing behavior.
- Verify GM upload/tab behavior and first-entry blocking playback at desktop and mobile sizes.
- Run type checks, unit tests, build checks, and a campaign smoke test.
