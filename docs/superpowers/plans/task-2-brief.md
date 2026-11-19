### Task 2: Reports pipeline (X → Grok vision → pins) + snapshot fallback

The one demo moment that must land: tap a pin and see a real flood photo, Grok's summary, how the location was determined, the confidence, the age, and a link to the post.

Files you own: `src/lib/reports/**` (new), `src/app/api/reports/route.ts`, `data/reports.snapshot.json`, `data/geocode-cache.json`, `scripts/*.ts` (run with `npx tsx`). Do NOT edit `src/components/**` except `ReportSheet.tsx` if a field is missing. `data/news.seed.json` is written by a parallel task: read it, don't write it.

1. `ReportSource` interface: `fetchPosts(): Promise<RawPost[]>`. RawPost = {id, text, createdAt, author, url, imageUrls[]}.
   - `XApiSource` (default): X API v2 `GET https://api.x.com/2/tweets/search/recent`, `max_results=50`, `start_time` = now-6h, query exactly:
     `(flood OR flooding OR flooded OR "under water" OR "knee deep" OR ponding OR "storm drain") ("San Francisco" OR SF OR SoMa OR Mission OR Embarcadero OR Dogpatch OR Marina OR Sunset OR Richmond) has:images -is:retweet lang:en`
     with `expansions=attachments.media_keys,author_id`, `media.fields=url,preview_image_url,type`, `tweet.fields=created_at,author_id,attachments`, `user.fields=username`. Photos use `url`; videos/gifs use `preview_image_url`.
   - `GrokXSearchSource` (fallback, used when there's no X token or X errors): xAI Responses API with the X search tool, returning the same RawPost shape. Check docs.x.ai for the current tool name and params. Keep it minimal.
   - BUDGET GUARD: a module-level daily counter of posts read (resets at the PT date change). Stop calling X at 1,500/day and return the cached or snapshot data.
2. Extraction: xAI `POST https://api.x.ai/v1/responses`. Check docs.x.ai for the current vision-capable Grok model id and the structured-output (JSON schema) param. Send one batch: the post texts + image URLs (as image inputs) + the fixed list of 41 neighborhoods (the `nhood` values in `public/data/neighborhoods.geojson`). Ask for a JSON array:
   `[{post_id, neighborhood (from the list or null), cross_street (or null), location_evidence ("text" | "image: street sign/landmark/business" | "both"), severity: low|med|high, summary (≤15 words), is_firsthand: bool, is_flooding: bool, confidence: 0-1}]`.
   The prompt must tell Grok to read street signs, business names, and landmarks in the photos, and to return null rather than guess. Drop items where `!is_flooding` or `neighborhood == null`.
3. Placement: if `cross_street` is set, geocode `"<cross_street>, San Francisco, CA"` with Nominatim (`https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=-122.52,37.83,-122.35,37.70&bounded=1`, with a descriptive User-Agent, ≤1 req/sec, in-memory cache seeded from `data/geocode-cache.json`). Otherwise, or if geocoding fails: the neighborhood centroid (compute it from the geojson) plus a random offset of about 150 m, with `approximate: true`. Map to the `Report` type (`locationEvidence`: "text" | "image" | "both" | "neighborhood"; `locationDetail` = Grok's raw evidence string).
4. `/api/reports` (dynamic, never prerendered): in-memory cache 10 min; stale-while-revalidate (serve the cached data immediately, refresh in the background); hard 8 s timeout on a cold refresh → serve the snapshot with `mode: "snapshot"`; no keys → snapshot. Always merge in `data/news.seed.json` (Report[]; source "news"). Response is `ReportsPayload`.
5. `scripts/snapshot.ts`: runs the live pipeline once with `.env.local` keys and writes `data/reports.snapshot.json` (plus `data/geocode-cache.json`). RUN IT for real once it works and commit the output. If the live run returns 0 flooding posts, say so in your report (don't fabricate posts) and commit whatever is real.
6. Never log key values. Log counts and timings.

Verify: `npm run build`; `npm run dev` then `curl localhost:3000/api/reports` returns live reports with imageUrls; with the env vars unset it returns the snapshot.

