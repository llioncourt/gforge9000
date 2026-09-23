# Read-only `/auth` validation

## Scope
- Make no code, database, authentication, PWA, or deployment changes.
- Do not publish.

## Evidence to report
1. Record the current Git revision and the exact two-file diff against the relevant merge parent.
2. Compare cache-busted production and hosted-preview responses, including safe cache headers, hashes, assets, Google text, old bundle references, and version responses.
3. Report five independent production resolutions/fetches plus HTTP/1.1 and HTTP/2 timing.
4. Distinguish an actual commit-to-deployment mapping from weaker evidence such as publish history, build ID, and deployed asset contents.
5. Reclassify the prior redirect-loop diagnosis based on the owner’s continued freeze and current reproduction evidence.
6. Summarize all code that runs globally on `/auth`, highlighting any router invalidation or browser cleanup path that could repeat.
7. Present the findings as a concise evidence table, explicitly noting preview-access limitations and that nothing changed or deployed.
