# Task 13 — King tide outlook (NOAA tide predictions vs. NWS flood threshold)

Context: SF Flood Watch (Next.js 16 App Router + TS + Tailwind + MapLibre), live at https://sf-floodwatch.vercel.app, mostly iPhone Safari.
Read `AGENTS.md` first (`cacheComponents: true`: no `Date.now()`/`new Date()` during render; API routes `await connection()`).
Rules: say "risk", never "will flood"; never "safe"; TypeScript only; no keys; must degrade gracefully if NOAA is down.

## Data (verified, no key)
- High/low predictions, SF station 9414290, MLLW, feet, local time:
  `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=9414290&begin_date=YYYYMMDD&end_date=YYYYMMDD&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json`
  → `{ predictions: [{ t: "2026-11-25 10:49", v: "7.029", type: "H" | "L" }] }` (t is SF local time).
- Flood thresholds: `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9414290/floodlevels.json?units=english`
  → `nws_minor: 13.02` (and nos_minor 13.69, nos_moderate 14.62, nos_major 15.89) — these are in **station datum (STND)**.
- Datums: `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9414290/datums.json?units=english` → `datums[]` with
  `{name:"MLLW", value:5.98}` (STND). Convert: threshold_MLLW = nws_minor − MLLW = 13.02 − 5.98 = **7.04 ft MLLW**.
  Fetch both and compute (fallback constant 7.04 if either fails). Use nws_minor as "NWS minor coastal flood threshold".

## Build
1. `src/lib/conditions/tides.ts`: `fetchTideOutlook(today: string /* YYYYMMDD, PT */)` → next 10 days of hi/lo predictions plus
   `{ minorFloodFt }`. Server route `/api/tides` (dynamic, cache 6h in memory, 6s timeout, never throws: on failure `{ days: [], failed: true }`).
   Pure helper `buildOutlook(predictions, minorFloodFt)` → per day: date, highs `[{time, ft}]`, `peakFt`, and `level`:
   `"above"` if peak ≥ threshold, `"near"` if ≥ threshold − 0.5, else `"normal"`. Unit-test the helper and the STND→MLLW conversion.
   Compute "today" in America/Los_Angeles via Intl inside the route handler (not during render).
2. UI: a **Tide outlook** sheet (same sheet system as Help/RiskCard; one sheet at a time), opened from (a) a "Tides" button
   (header row or Layers popover, whichever fits at 390px without overlap) and (b) tapping the existing king-tide line in
   `ConditionsBanner`. Content:
   - A compact bar chart (plain divs or inline SVG, no chart lib): one bar per day = peak high tide ft, a dashed horizontal line
     at the threshold labeled "NWS minor flood level 7.0 ft", bars `near` amber, `above` red-ish, `normal` muted. Days Nov 23–27
     labeled "King tides" (the window is already in ConditionsBanner — reuse that constant; don't duplicate dates).
   - A list: each day's high tides with times ("Wed Nov 25 · 10:49am · 7.0 ft"), marked "Near flood level" / "At/above flood level".
   - Copy: "Low-lying shoreline areas (Embarcadero, Mission Creek, Islais Creek, Marina, Ocean Beach parking) face the most risk
     around these high tides, especially with rain or storm surge. Predictions are astronomical only; wind and rain can push water higher."
   - Source line: "NOAA tide predictions, San Francisco (9414290) ↗" linking https://tidesandcurrents.noaa.gov/stationhome.html?id=9414290
     and the threshold source. Never say "safe"; "normal" days are labeled only by their height.
3. The coastal risk factor in `risk.ts` is unchanged.
4. README "How to read the map" + Help sheet: one line on the Tide outlook.

## Verify
`npx tsc --noEmit`, `npm run lint` (no new errors), all tests (`node --experimental-strip-types --no-warnings --test $(git ls-files 'src/**/*.test.ts')` plus your new ones), `npm run build`.
Commit on your branch. Do not push, deploy, touch `.env*`, or dispatch subagents.
