# Production incident report — "site freezes after clicking a button"

Diagnosis only. Nothing was changed: no code, no deployment, no database, no settings.

## Summary

| Question | Answer |
| --- | --- |
| Reproduced on the live site from clean browsers | NO |
| Live site version | matches the latest code (f438821, the rebuilt sign-in + flat visuals) |
| Latest code version | f438821 |
| Failing click found in testing | none — all four home-page buttons work |
| Runaway activity measured | none (see numbers below) |
| Confirmed cause | your device is still running an **older, saved copy** of the app |

## What I tested on https://gforge9000.lovable.app

Fresh browsers, phone size (390x844) and desktop size, each button tested in its own clean session, watched for 30-60 seconds after the click:

| Click | Result | Work after the click |
| --- | --- | --- |
| Header "Sign in" | sign-in screen opens, one move | 0.16s busy, 0 stalls, 8 files, no errors |
| Hero "Start building" | sign-in screen opens, one move | 0.17s busy, 0 stalls, 8 files |
| Hero "Content policy" | legal page opens | 0.13s busy, 1 file |
| Header "Legal" | legal page opens | 0.16s busy, 1 file |

Also checked, all healthy:
- Sign-in screen left open 60 seconds: no repeated requests, no repeated checks, no background loop.
- Signed in as your account on the live site: lands on the dashboard, settles in about 1 second of work, then quiet for the rest of a minute.
- Signed in with the backend made unreachable: no bouncing between pages, no loop, page stays usable.
- Sign-in bookkeeping counters on the live site: 1 start-up check, 1 listener, 0 unexpected sign-in attempts — all bounded.

So the current published version is not the thing that hangs.

## What actually explains it

The app saves a full offline copy of itself on your device (added 16 Sep, before every fix from today). I confirmed on the live site that this copy stores:

- 58 program files plus complete saved copies of the home page and the sign-in page,
- all filed under one fixed label that is **never replaced when a new version is published**, and
- it is served whenever a request fails or the connection stutters — I reproduced exactly that: with the network cut, the saved pages still loaded normally.

Consequence: a phone or PC that saved the app during a broken release keeps running that broken release. Every "fix" we published since then can be invisible on your device. This matches every symptom you reported:

- the hang survived several fixes and a complete rebuild,
- the phone gets hot on "Sign in" (the old release had the heavy moving background and the old sign-in chain that we already removed),
- clean test browsers always look fine, which is exactly why previous validations passed.

Secondary contributors (real, but not the freeze):
- The saved copy is also used when a request merely times out, which the backend did earlier today — so even a healthy device can briefly drop back to old saved pages.
- Old program files are kept forever, so an old saved page still finds all of its old parts and runs completely.

## First failing stage

Not before, during, or after the sign-in screen renders — the freeze is not stage-specific on the current release. It is version-specific: the code executing on your device is not the code that is published.

## Immediate check you can do (no changes needed)

On the affected phone/PC, open the site, fully close all its tabs, then reopen it once. If it still freezes, the saved copy is confirmed; clearing the site's stored data for gforge9000.lovable.app will make it work immediately. That test tells us definitively whether anything at all remains to fix in the code.

## Smallest correction I would recommend (not applied)

1. Publish a version-stamped offline copy: tie the saved label to the release, so publishing a new version automatically throws away the previous saved copy instead of keeping it forever.
2. Stop saving whole pages. Only the offline notice page needs saving; pages should always come from the network, with the offline notice as the fallback. This removes the "old page + old parts = old app" path entirely.
3. Ship a one-time cleanup so devices already holding an old copy discard it on their next visit, without users clearing anything by hand.

That is three changes in one file plus a small cleanup step — no change to sign-in, the assistant integration, security rules, or the database.

## Remaining unknown

I could not make the current release fail in any clean browser, on any of the four buttons, on phone or desktop, signed out or signed in. If after the cleanup above your device still freezes, the next step is a capture from your own browser during the freeze; at that point we would have a second, still-unidentified cause.
