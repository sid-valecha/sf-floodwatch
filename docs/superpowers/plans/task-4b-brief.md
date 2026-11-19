### Task 4b: Risk card + report feed + neighborhood search + mobile polish

North Star: someone in SF opens the link on their phone during the storm. Within 10 seconds they know what people are reporting near them right now (with proof), and how much risk their area faces and why.

Files you own: `src/components/MapApp.tsx`, `src/components/FloodMap.tsx`, `src/components/ConditionsBanner.tsx` (light layout tweaks only),
new `src/components/RiskCard.tsx`, new `src/components/ReportFeed.tsx`, and `src/app/globals.css`.
DO NOT edit `src/components/ReportSheet.tsx`, `src/lib/reports/**`, `src/app/api/reports/**`, `data/**` (a parallel task owns them).
Use what exists: `src/lib/risk.ts` (`scoreNeighborhood`, `RiskResult`, `RiskConditions`, `NeighborhoodStats`), `public/data/neighborhood-stats.json`,
`/api/conditions` (see `src/lib/conditions/**` for its response type), `/api/reports` (`ReportsPayload`), `src/lib/freshness.ts`.

1. **Risk card.** Tapping a neighborhood polygon (already wired: `onSelectNeighborhood`) opens a bottom sheet:
   - Header: the neighborhood name, plus a big "Low / Moderate / High **risk**" pill (Low: slate/sky, Moderate: amber, High: rose). Never the word "safe".
   - One factor row per `RiskFactor`: a kind dot (modeled = sky, official = amber, observed = rose), the label, the detail, and "+N". Sort by points, highest first. Show the total.
   - The observed reports for that neighborhood, as links (summary · age · source ↗). Tapping one opens the existing `ReportSheet` and flies to its pin.
   - Footer: "Risk estimate from modeled zones + forecast + reports. Not a prediction. No reports ≠ no flooding."
   - Lift the `/api/conditions` fetch into MapApp (or share it with the banner) so one fetch feeds both the banner and the risk card. Map it to `RiskConditions`:
     `rainPeakChance`, `rainWindow` (e.g. "7–9pm"), `rainInchesNext6h` (null if the API doesn't provide it), `nextHighTide` ({time ISO, ft}).
   - Highlight the selected neighborhood on the map (a new `nhoods-selected` line layer with a filter on `nhood`; white, 2px). Clear it when the card closes.
   - Compute "now" only in event handlers or effects (because of `cacheComponents`).
2. **Report feed.** A collapsible feed of the latest reports, newest first:
   - Collapsed: one pill, e.g. "● 7 reports · latest 12m ago", in rose. Expanded: a list with a 48px thumbnail (when `imageUrl` exists), summary, neighborhood, age, and an X/news chip.
   - Tapping a row flies to the pin and opens `ReportSheet`.
   - Freshness fade on the rows too: opacity 1 / .55 / .3 (reuse `freshnessOpacity`).
   - Empty state: "No flood reports in the last 6h. That doesn't mean streets are dry."
3. **Neighborhood search** (cut it if you're past 6:15pm PT): a small search input (datalist of the 41 names from neighborhood-stats.json) that flies to the centroid and opens the risk card.
4. **Mobile layout** at 390×844 (iPhone):
   - Top: the title, then the banner (one line, collapsible).
   - Top-right: Layers.
   - Bottom: the feed pill and legend, then the disclaimer.
   - Sheets (risk card / ReportSheet) slide up from the bottom, max 70vh, scroll inside. Only one sheet is open at a time.
   - Nothing overlaps, and the map stays at 85–90% of the screen when the sheets are closed.
   - Respect safe-area insets. Tap targets ≥ 40px.
   - Check it: take a screenshot at 390×844 of the dev server if you can do it in under 3 minutes (e.g. `npx -y playwright@1.49.1 screenshot --viewport-size=390,844 --wait-for-timeout=4000 http://localhost:3000 shot.png` after `npx -y playwright@1.49.1 install chromium`). Read the image and fix any overlaps. If that's too slow, skip it and say so.

Verify: `npm run build` passes; no hydration warnings in the dev console; the screenshot (if taken) shows no overlaps.
