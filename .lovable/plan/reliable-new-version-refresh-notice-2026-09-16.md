# Reliable new-version refresh notice

## What will change
- Give every published build a unique build identifier.
- Add a tiny public version check that always returns the currently deployed identifier without browser caching.
- While the app is open, check on startup, when the tab becomes active again, and periodically in the background.
- When the deployed identifier differs from the one loaded in the browser, show a persistent notice directly above the app header with a **Refresh now** action.
- Refreshing will load the newest published files; failed checks will stay silent and never interrupt play.

## Reliability safeguards
- Disable the notice in local development so ordinary code updates do not trigger false warnings.
- Use cache-busting and `no-store` responses so a CDN or browser cannot return an old version result.
- Compare the loaded build against the deployed build instead of relying on service-worker lifecycle events; this project does not currently use a service worker.
- Avoid automatic reloads and reload loops: the user chooses when to refresh, and a newly loaded build sees matching identifiers.
- Keep the notice usable on mobile and compatible with the existing light/dark theme.

## Technical details
- Add the build identifier through the existing Vite configuration.
- Add a read-only `/api/public/version` endpoint with explicit no-cache headers.
- Add a focused update-notice component and mount it in the authenticated app shell above the header.
- Add tests for version comparison/check behavior, then verify type safety, tests, build output, and the visible banner behavior.
