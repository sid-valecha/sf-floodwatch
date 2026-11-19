# Task 11 — "Reports from the last…" time filter

Context: SF Flood Watch (Next.js 16 App Router + TS + Tailwind + MapLibre), live at https://sf-floodwatch.vercel.app, mostly viewed on iPhone Safari.
Read `AGENTS.md` first (`cacheComponents: true`: no `Date.now()`/`new Date()` during render; `MapApp.tsx` already keeps a `now` state that ticks every 60s).
Rules: say "risk", never "will flood"; never label anything "safe"; TypeScript only.

## What to build
1. A compact segmented control with options **30m · 1h · 3h · 6h · All**, default **All**. Place it so it does not
   overlap the header, the conditions banner, layer toggles or the bottom sheet at 390px width. Match existing
   dark UI styling (look at the layer toggles / header controls in `MapApp.tsx`).
2. It filters which **reports** (X and news pins + the report feed) are shown: keep reports with
   `ageMs(createdAt, now) <= window`. "All" keeps today's behavior (the existing per-source max age: 12h X / 24h news).
   Apply in the same `reports` memo in `MapApp.tsx` so the map, feed and counts stay consistent.
3. It must NOT change the risk score input — `scoreNeighborhood` should keep receiving the unfiltered recent reports
   (risk shouldn't drop because someone narrowed the view). Check what is passed to `RiskCard`/`scoreNeighborhood` and
   keep that on the all-reports list.
4. When the window hides every report, show a small inline note near the control or in the feed:
   "No reports in the last 1h. That doesn't mean no flooding." (use the selected label). Never say "safe".
5. Remember the choice per viewer in `localStorage` key `fw-window`, wrapped in try/catch (Safari private mode throws);
   read it inside an effect, not during render.

## Verify
`npx tsc --noEmit`, `npm run lint` (no new errors), existing tests (`node --experimental-strip-types --no-warnings --test src/lib/risk.test.ts src/lib/reports/group.test.ts`), and `npm run build` must pass.
Commit on your branch. Do not push, deploy, or touch `.env*`. Do not dispatch subagents.
