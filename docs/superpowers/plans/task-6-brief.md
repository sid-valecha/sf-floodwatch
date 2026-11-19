### Task 6: Hardening — instant first paint for reports + fresh snapshot

Observed on prod: a cold serverless instance makes the first visitor wait 8.4 s for /api/reports, then serves the snapshot anyway.
North Star: useful in 10 s on a phone. Pins should appear in under about 1 s.

Files you own: `src/app/api/reports/route.ts`, `src/components/MapApp.tsx` (the snapshot badge only), new `scripts/pull-snapshot.ts`, `data/reports.snapshot.json`.

1. Cold start: when there's no cache, serve the snapshot IMMEDIATELY (mode "snapshot") and start the refresh through `after()`.
   The client already polls every 5 min. Make it re-poll once 20 s after a "snapshot" response, so the live data shows up quickly.
   Respect the existing failure backoff, the inflight de-duplication, and the 50 s deadline. Don't change `src/lib/reports/**`.
2. `scripts/pull-snapshot.ts` (run it with `node --experimental-strip-types`): GET https://sf-floodwatch.vercel.app/api/reports.
   Only when `mode === "live"`, write the X reports (NOT the news; news is merged at runtime from data/news.seed.json)
   to `data/reports.snapshot.json` in the same shape as now. This refreshes the snapshot WITHOUT spending X credits. Run it once, and commit the result.
   If it returns "snapshot", retry up to 3 times, 25 s apart.
3. Snapshot badge in the header: show "snapshot · <age>" using the payload's fetchedAt (compute the age client-side in an effect or state, not in render), so viewers know how old it is.
4. Verify:
   - `npm run build`
   - with no keys, a dev-server curl returns a snapshot in under 100 ms
   - with keys, the first curl returns a snapshot fast, and a curl about 15 s later returns live (this costs one X fetch, which is acceptable: 1 run max).
