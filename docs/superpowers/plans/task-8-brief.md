### Task 8: Pin quality: same-incident merging + curated high-signal pins

Why: the final review saw 3 pins of ONE story (a Waymo stalled in flood water) reposted by different accounts, all at the Haight Ashbury centroid.
That hurts credibility in a demo. Sid also shared high-engagement posts that pin down real locations.

1. **Same-incident merging** (`src/lib/reports/extract.ts`, `pipeline.ts`):
   - Add `incident_key` to the Grok JSON schema: a short lowercase slug for the physical event (e.g. "waymo-stalled-oak-st", "moscone-ceiling-leak"). Tell Grok that reposts or commentary about the same event MUST share a key.
   - In the pipeline, group by `neighborhood + incident_key`. Keep one report per group: prefer firsthand, then one with an image, then highest confidence, then newest.
   - On the kept Report, add `alsoReportedBy: number` (the group size − 1) and `relatedUrls: string[]` (up to 3).
   - Add those two OPTIONAL fields to `Report` in `src/lib/types.ts`.
   - In `ReportSheet.tsx`, show "+N similar posts" with the links when N > 0.
   - Don't make a live X call to test. Unit-test the grouping function with node:test, using fixtures (`node --experimental-strip-types --test`).
2. **Curated pins** in a new `data/curated.seed.json` (Report[]), merged in `src/app/api/reports/route.ts` exactly the way news.seed.json is.
   After merging, de-duplicate by `id` AND by `url`: if a live X report has the same post URL as a curated one, keep the curated one, because it has the precise location.
   Use these real posts, with the facts verbatim:
   - X post https://x.com/julia_n_daniel/status/2123119690549715431. Author julia_n_daniel, createdAt 2026-11-18T18:22:34Z.
     Text: "@Waymo your car is blocking the shallowest out of all the flooded lanes on Oak in SF and creating a hazard". Video, so there's no imageUrl
     (use `https://pbs.twimg.com/amplify_video_thumb/2123116837080793089/img/4OpKYFdgkQH170nW.jpg` as imageUrl).
     Neighborhood "Haight Ashbury" or "Lone Mountain/USF", whichever polygon contains the point. Oak St along the Panhandle: lng -122.4445, lat 37.7726, approximate true (the block isn't stated).
     crossStreet "Oak St (Panhandle)", locationEvidence "text", locationDetail "post text: 'flooded lanes on Oak'", severity "high", summary "Waymo stalled in flooded lanes on Oak St, creating a hazard", confidence 0.85, source "x", id "x-2123119690549715431".
   - X post https://x.com/socialchanger/status/2123146033622380984. Author socialchanger, createdAt 2026-11-18T20:07:15Z.
     Text: "Happening now at Moscone Center in SF during the massive Microsoft Ignite show". Video thumb `https://pbs.twimg.com/amplify_video_thumb/2123145808908369920/img/ZrAZubtsqyjNgzsd.jpg`.
     Neighborhood "South of Market". Moscone Center: lng -122.4013, lat 37.7842, approximate false, crossStreet "Moscone Center (Howard St)", severity "med",
     summary "Water pouring into Moscone Center during Microsoft Ignite (indoor leak)", locationEvidence "text", confidence 0.9, source "x", id "x-2123146033622380984".
   - News (an official statement) https://x.com/bilalmahmood/status/2123139664504828140. Author "Sup. Bilal Mahmood", createdAt 2026-11-18T19:41:56Z.
     Summary "Waymo service paused after cars stalled in flood zones (Panhandle)". Neighborhood: the same polygon as the Oak St pin. lng -122.4470, lat 37.7724, approximate true,
     crossStreet "Panhandle", source "news", severity "med", confidence 0.9, locationEvidence "text", locationDetail "statement: 'stalled Waymos in the Panhandle'", id "news-waymo-pause-panhandle".
   Verify that every point falls inside its stated neighborhood polygon (`public/data/neighborhoods.geojson`), and fix the neighborhood name if it doesn't.
3. Files you may touch: `src/lib/reports/{extract,pipeline}.ts` (+ a test file next to them), `src/lib/types.ts` (the optional fields only), `src/components/ReportSheet.tsx`,
   `src/app/api/reports/route.ts` (the curated merge plus de-dup only; keep the backoff, inflight and after() logic unchanged), `data/curated.seed.json`.
Verify: the unit tests pass; `npm run build` passes; a dev-server curl of /api/reports with NO keys (`XAI_API_KEY=` and `X_BEARER_TOKEN=` set empty) returns the snapshot plus 5 news plus 3 curated pins, with no duplicate ids or urls.
