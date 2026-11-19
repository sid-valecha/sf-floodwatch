# Task 14 — Transit status (BART now; 511 Muni/Caltrain/ferries later behind a token)

Context: SF Flood Watch (Next.js 16 App Router + TS + Tailwind + MapLibre), live at https://sf-floodwatch.vercel.app, mostly iPhone Safari.
Read `AGENTS.md` first (`cacheComponents: true`: no `Date.now()`/`new Date()` during render; API routes `await connection()`).
Rules: say "risk", never "will flood"; never "safe"; TypeScript only; must degrade gracefully if a feed is down.
Future: the app will add Los Angeles; keep transit agencies in a small per-source list, not hard-coded across UI.

## Data (verified live, no signup)
- BART service advisories: `https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=MW9S-E7SL-26DU-VV8V&json=y`
  → `root.bsa` is an array (may be a single object or contain a "No delays reported" item — handle both) of
  `{ "@id", station, type ("DELAY"|"EMERGENCY"|...), description: {"#cdata-section": text}, sms_text: {...}, posted?, expires? }`;
  `root.date`/`root.time` e.g. "11/19/2026", "11:05:01 AM PST". The key is BART's public shared key (documented by BART) — keep it in code as a constant.
- BART elevator status: `https://api.bart.gov/api/bsa.aspx?cmd=elev&key=MW9S-E7SL-26DU-VV8V&json=y` (same shape). Include as a secondary list.
- 511.org (Muni `SF`, Caltrain `CT`, Golden Gate Ferry `GF`, SF Bay Ferry `SB`) needs `API_511_TOKEN` (not available yet). Implement only the
  plumbing: a `sources` array where 511 sources are skipped when `process.env.API_511_TOKEN` is unset, and the UI shows
  "Muni, Caltrain and ferry alerts coming soon" in that case. Do NOT guess the 511 response parser.

## Build
1. `src/lib/transit/bart.ts` + `bart.test.ts` (fixture from the live response; test single-object vs array and the no-delays item).
   Normalized type: `TransitAlert = { id, agency: "BART", kind: "advisory" | "elevator", title, text, postedAt?: string, url, weatherRelated: boolean }`
   where `weatherRelated` = text matches `/flood|water|storm|weather|rain|wind|tree|power|slide|mud/i`; url = `https://www.bart.gov/schedules/advisories`.
2. `/api/transit` route: dynamic, in-memory cache 2 min with stale-while-revalidate (pattern: `src/app/api/conditions/route.ts` CHP handling), 6s timeout,
   never throws → `{ alerts: TransitAlert[], fetchedAt, failed: string[], pending: string[] /* e.g. ["Muni","Caltrain","Ferries"] */ }`.
3. UI: a **Transit** sheet (same one-sheet-at-a-time system), opened from a "Transit" row in the Layers popover (next to "Tide outlook").
   Sections: weather-related alerts first (amber "Weather-related" chip), then other BART advisories, then elevators collapsed under a
   `<details>`; each item shows agency badge, text, age if postedAt, and "Source: BART ↗". If no advisories: "No BART advisories posted."
   Footer: pending agencies line. Label the section **Official**.
4. If any `weatherRelated` alert exists, add a short chip to `ConditionsBanner` ("BART: weather delay" style, tap opens the Transit sheet).
5. README "How to read the map" + Help sheet: one line about Transit.

## Verify
`npx tsc --noEmit`, `npm run lint` (no new errors), all tests (`node --experimental-strip-types --no-warnings --test $(git ls-files 'src/**/*.test.ts') src/lib/transit/bart.test.ts`), `npm run build`.
Commit on your branch. Do not push, deploy, touch `.env*`, or dispatch subagents.
