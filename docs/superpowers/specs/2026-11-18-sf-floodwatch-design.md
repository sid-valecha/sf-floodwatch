# SF Flood Watch — MVP design (2026-11-18)

The full product spec is the brief pasted at session start (layers, rules, stack, "Next").
This doc records only the decisions made on top of it and the clock plan.

## Why / success
Live demo from a phone at an event tonight. The one moment that must land:
**tap an X photo pin → real flood photo, Grok's location reasoning, link to the post.**
Everything else is supporting cast.

## Decisions (user)
- TypeScript only. Next.js App Router + Tailwind + MapLibre GL, Vercel via CLI (`vercel --prod`).
- Both keys (X_BEARER_TOKEN, XAI_API_KEY) available → do a real live run early and commit the snapshot.
- Cut order if behind: storm drains → search → risk score.

## Decisions (Claude's calls — flag if wrong)
1. **Build order: step 3 (reports) moved ahead of step 2 (conditions).** It protects the demo moment.
   Order: 1 Map+zones → 3 Reports → 2 Conditions/radar/alerts → 4 Risk card/feed/polish.
2. **Budget counter is per-serverless-instance** (no DB). A cold start resets it. Mitigation: a hard per-request cap
   of 50 posts, a 10-min cache, and the snapshot is served when the cap is hit. Worst case is a few extra instances × 1,500, which is acceptable for one night.
3. **News pins use the real article timestamps and hide after 24h instead of 12h**, so this morning's
   incidents are still visible at the evening demo. X pins follow the 2h/6h/12h rule exactly.
4. Grok model: the latest vision-capable Grok model on /v1/responses, picked after checking xAI's docs. Structured JSON output, batch of ≤50 posts per call.
5. Geocoding (Nominatim) runs server-side during the /api/reports refresh, with an in-memory cache plus a committed
   `data/geocode-cache.json` seeded from the snapshot run.
6. Static layers: download → `npx mapshaper -simplify` → `public/data/*.geojson`, each under ~1.5 MB.

## Clock (PT)
| Time | Step | Done when |
|------|------|-----------|
| 4:35–5:05 | 1 Map + SFPUC/FEMA zones + hotspots + neighborhoods | prod URL loads on phone |
| 5:05–5:50 | 3 X → Grok → pins w/ photos, news pins, snapshot fallback | live run succeeds, snapshot committed, deployed |
| 5:50–6:15 | 2 Banner (NWS/NOAA) + RainViewer radar + alert polygons | deployed |
| 6:15–6:30 | 4 Risk card + feed + mobile polish | **final deploy 6:30** |
| after | storm drains, search, then the "Next" list | — |

## North Star
**Someone in SF opens the link on their phone during a storm. Within 10 seconds they know what people are reporting
near them right now, with proof, and how much risk their area faces, and why.**

How to pick the next slice when nobody is around: choose the one that does the most for
**(a) trustworthy, well-located, fresh observed reports** or **(b) a fast, reliable phone experience**.
Anything that does neither waits.

## After 6:30: ranked backlog (one slice = build → verify on prod → commit → deploy)
1. **Hardening:** no-key and slow-API paths verified on prod; refresh the snapshot from a good live run; Lighthouse mobile pass, first paint under 3s.
2. **Pin quality:** cross-street geocode hit rate, de-duplicating the same incident, tuning the Grok prompt on real misses, dropping Grok's low-confidence locations into a "neighborhood-level" style.
3. **Cut items:** storm drains (zoom 15+), neighborhood search.
4. **Time slider** (30m/1h/3h/6h/24h) over the reports we already have.
5. **Road closures** from 511/CHP, if a free API needs no signup.
6. **Needs Sid:** Supabase/PostGIS history plus a community report form (needs an account). 311 back-check.
7. **Parked:** Mapillary/DINOv2 photo-to-street matching. ML-heavy, and not TypeScript-friendly tonight.

## Autonomous guardrails
- Never add a paid service, an account, or a new key without asking. Keep X spend inside the 1,500-posts/day guard.
- Every slice ends in a verified prod deploy. If prod breaks, revert first and debug second.
- **Deploy freeze during the live demo window** (no `vercel --prod`).
- Commit small, on main, with clear messages so Sid can follow the history.

## Non-negotiables
OBSERVED / OFFICIAL / MODELED visually distinct; "risk" never "will flood"; never "safe";
source link + age + freshness fade on every report; footer disclaimer; works with zero API keys.
