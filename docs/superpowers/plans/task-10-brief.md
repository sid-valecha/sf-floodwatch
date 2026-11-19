# Task 10 — Pin quality + risk polish (post-launch slice)

Context: SF Flood Watch (Next.js 16 App Router + TS + Tailwind + MapLibre), live at https://sf-floodwatch.vercel.app.
Read `AGENTS.md` first (this Next.js has breaking changes; `cacheComponents: true` means no `Date.now()`/`new Date()` during render).
Global rules: say "risk", never "will flood"; never label anything "safe"; TypeScript only; the app must work with no API keys.

## Changes (all required)

1. **Merged pins keep a photo** — `src/lib/reports/group.ts` `mergeIncidents`: when the winning report has no `imageUrl`
   but another report in the same group has one, set the merged report's `imageUrl` to the image of the newest
   group member that has one. Never overwrite the winner's own image. Add cases to `group.test.ts`
   (winner without image gets one; winner with image keeps its own; solo reports untouched).

2. **Pins fade on time, not only on refresh** — in the client (`MapApp.tsx` / `FloodMap.tsx` / `ReportFeed.tsx`, wherever
   freshness opacity and the >12h/24h hide are computed), re-evaluate every 60s via a `setInterval` tick in state
   (no `Date.now()` during render; get the time inside the effect/interval callback and store it in state).

3. **Official flood alert counts in the risk score** — `src/lib/risk.ts` `scoreNeighborhood`: if the conditions include an
   active NWS alert whose event contains "Flood" (case-insensitive), add points: "Warning" → +2, otherwise
   (Advisory/Watch/Statement) → +1. Add a reason line naming the alert event, e.g. "NWS Flood Advisory in effect".
   Apply to all neighborhoods (alerts are county-wide for SF); keep it in the reasons list shown by `RiskCard`.
   Add tests to `risk.test.ts`. Do not change other thresholds.

4. **Sandbag sheet never goes blank** — if the selected sandbag site's event has ended (or it is otherwise no longer
   in the list) while its sheet is open, keep showing the site with status "Event ended" instead of an empty sheet.
   See `src/lib/resources.ts` and the sandbag sheet component.

5. **Help sheet sandbag row has a source link** to https://www.sf.gov/urban-flooding (same style as other source links).

6. **Pointer cursor** over sandbag pins (mirror whatever reports/hotspots do on mouseenter/mouseleave in `FloodMap.tsx`).

## Verify
- `npx tsc --noEmit`, `npm run lint` (no new errors), `node --experimental-strip-types --test src/lib/**/*.test.ts` (or the
  existing test command in package.json), and `npm run build` must all pass.
- Commit on your branch with clear messages. Do not deploy, do not push, do not touch `.env*`.
