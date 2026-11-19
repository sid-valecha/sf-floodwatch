# Task 12 — CHP roadway flooding incidents (official layer)

Context: SF Flood Watch (Next.js 16 App Router + TS + Tailwind + MapLibre), live at https://sf-floodwatch.vercel.app, mostly iPhone Safari.
Read `AGENTS.md` first (`cacheComponents: true`: no `Date.now()`/`new Date()` during render; API routes call `await connection()`).
Rules: say "risk", never "will flood"; never "safe"; TypeScript only; no API keys or signups; app must keep working if this feed is down.

## Source
CHP public CAD feed (free, no key): `https://media.chp.ca.gov/sa_xml/sa.xml` (~180 KB XML, statewide).
Structure: `<State><Center ID="..."><Dispatch ID="GGCC">` (Golden Gate = Bay Area) `<Log ID="261118GG2607">` with children
`<LogTime>"Nov 18 2026 11:23PM"</LogTime>`, `<LogType>"FLOOD-Roadway Flooding"</LogType>`, `<Location>"..."</Location>`,
`<LocationDesc>`, `<Area>"San Francisco"</Area>`, `<LATLON>"37774123:122419876"</LATLON>` (lat×1e6 : |lng|×1e6, lng is
west so negate; `"0:0"` = unknown → skip), and `<LogDetails><details><DetailTime/><IncidentDetail>"[3] ..."</IncidentDetail></details>...`.
Values are wrapped in literal double quotes inside the tags — strip them. Times are Pacific local time ("Nov 18 2026  4:08PM",
note possible double space) — convert to ISO correctly for America/Los_Angeles (PST −08:00 / PDT −07:00; Nov 2026 is PST,
but compute the offset properly with Intl rather than hard-coding). Parse with simple regex/string ops (no new dependency).

## Build
1. `src/lib/conditions/chp.ts`: `fetchChpFlooding(): Promise<RoadIncident[]>` — fetch with 6s timeout and a
   `User-Agent: sf-floodwatch (https://sf-floodwatch.vercel.app)` header; keep logs in the **GGCC** dispatch whose coordinates fall in
   SF bbox lat 37.70–37.84, lng −122.53…−122.35, AND that are flood-related: `LogType` starts with `FLOOD`, OR LogType/Location/any
   IncidentDetail matches `/flood|ponding|standing water|water on (the )?(road|rdwy|roadway)|hydroplan/i`.
   `RoadIncident = { id, type, location, area, createdAt (ISO), lng, lat, latestDetail?: string, url: "https://cad.chp.ca.gov/" }`
   (latestDetail = newest IncidentDetail text with the leading "[n] " stripped). Unit tests in `chp.test.ts` with a small inline XML
   fixture (include a non-SF log, a non-flood SF log, a 0:0 log, and a flood SF log; test time conversion).
2. Serve it via `/api/conditions` as a new optional field `roadIncidents` (cache ≥2 min; on failure return `[]` and do not fail the
   rest of the conditions payload). Update the client type.
3. Map: a new **official** (amber family, distinct from sandbag pins — e.g. amber ring/triangle-ish styling using circle layers)
   layer `chp` drawn below report pins (beforeId the reports halo layer, like sandbags). Fade by age with the existing freshness
   helpers (treat like X: hide >12h). Add a layer toggle "Road flooding (CHP)" next to existing toggles, on by default. Tap → small
   sheet: "CHP: Roadway flooding", location, area, age ("12 min ago"), latest detail, "Source: CHP incident feed ↗" linking the url.
   Click priority: reports, then CHP, then sandbags, then hotspots, then neighborhoods.
4. Risk: in `scoreNeighborhood`, a CHP flood incident < 2h old inside the neighborhood polygon/bbox counts as an observed signal of
   +1 (cap +2 total for CHP), with reason "CHP roadway flooding report nearby". Use whatever point-in-neighborhood helper exists, or the
   bbox from `neighborhood-stats.json` if no polygon test exists. Add tests.
5. README "How to read the map" Official row and Help sheet "what the colors mean": mention CHP roadway flooding incidents.

## Verify
`npx tsc --noEmit`, `npm run lint` (no new errors), all tests (`node --experimental-strip-types --no-warnings --test src/lib/**/*.test.ts` or list them), `npm run build`.
Commit on your branch. Do not push, deploy, touch `.env*`, or dispatch subagents.
