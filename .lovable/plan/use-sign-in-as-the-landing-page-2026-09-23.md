# Use sign-in as the landing page

## Changes
- Replace the current `/` page with an immediate redirect to `/auth`.
- Keep `src/routes/auth.tsx` and all authentication behavior unchanged.
- Replace the obsolete landing-link regression test with a redirect regression test.

## Validation
- Confirm `/` reaches `/auth` without rendering the removed landing page.
- Confirm `/auth` remains unchanged and interactive.
- Check the affected test and current preview build.
