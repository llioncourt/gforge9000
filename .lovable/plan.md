# Make “Refresh to update” reliable

## What will change
- Keep the existing release-ID check, but add a second check against the published page’s main application file.
- Detect a new release when either signal changes, avoiding missed updates caused by an old server instance answering the version request.
- Make **Refresh now** navigate with a one-time cache-busting URL instead of performing a normal reload.
- Preserve the current behavior: no automatic reload, no interruption on network failures, and no checks in the embedded preview.

## Verification
- Add regression tests for extracting and comparing application file identifiers.
- Verify the update banner appears when either release signal differs.
- Run the relevant tests and confirm the app builds successfully.
