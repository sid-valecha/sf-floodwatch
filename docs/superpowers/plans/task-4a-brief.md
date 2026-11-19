### Task 4a: Neighborhood risk score (pure logic + precomputed coverage)

Files you own (all new): `scripts/neighborhood-stats.ts`, `src/lib/risk.ts`, `src/lib/risk.test.ts`, `public/data/neighborhood-stats.json`.
Edit nothing else. NO new npm dependencies (other tasks are editing package.json in parallel). Run TS scripts with
`node --experimental-strip-types scripts/neighborhood-stats.ts` (Node 26 runs TS natively; use only erasable syntax, so no enums and no parameter properties).

The North Star asks for a risk card that is simple and explainable: Low / Moderate / High, with the breakdown of reasons shown.
Wording rules: say "risk", never "will flood"; never output "safe". A zero score is still "Low risk", never "no risk".

1. `scripts/neighborhood-stats.ts` reads `public/data/neighborhoods.geojson` (41 features, prop `nhood`, MultiPolygon),
   `public/data/sfpuc-100yr.geojson` (1 MultiPolygon), and `public/data/fema-flood.geojson` (prop `risk`: "high" | "moderate").
   For each neighborhood, estimate by grid sampling (~40 m spacing, with a plain ray-casting point-in-polygon that handles holes):
   `sfpucPct` (0–100), `femaHighPct`, `femaModPct`, `centroid: [lng, lat]` (the mean of the inside sample points, which is guaranteed to fall inside),
   `bbox`, and `coastal: boolean` (true if femaHighPct > 0.5 or the neighborhood contains one of the hotspots in `src/lib/hotspots.ts`;
   copy those 5 coordinates into the script so it doesn't import from src). Write `public/data/neighborhood-stats.json` as `Record<nhood, Stats>`, rounding to 1 decimal.
   Print a table so the numbers can be sanity-checked (e.g. Mission and SoMa should show nonzero SFPUC coverage, and Marina / Financial District should show FEMA coverage).

2. `src/lib/risk.ts`, a pure function with no fetches and no Date.now (the caller passes `now`):
   ```ts
   export interface NeighborhoodStats { sfpucPct: number; femaHighPct: number; femaModPct: number; centroid: [number, number]; bbox: [number, number, number, number]; coastal: boolean }
   export interface RiskConditions { rainPeakChance: number | null; rainWindow: string | null; rainInchesNext6h: number | null; nextHighTide: { time: string; ft: number } | null }
   export interface RiskFactor { kind: "modeled" | "official" | "observed"; label: string; points: number; detail: string }
   export interface RiskResult { level: "Low" | "Moderate" | "High"; score: number; factors: RiskFactor[]; reportIds: string[] }
   export function scoreNeighborhood(name: string, stats: NeighborhoodStats, cond: RiskConditions, reports: Report[], now: number): RiskResult
   ```
   Points (keep every factor, including 0-point ones, so the card can explain itself):
   - Storm flood zone (modeled): sfpucPct ≥15 → 3, ≥5 → 2, ≥1 → 1, else 0. detail e.g. "12% of area in SFPUC 100-yr storm risk zone"
   - Coastal flood zone (modeled): femaHighPct ≥10 → 2, >0.5 → 1. detail "x% in FEMA high-risk coastal zone"
   - Rain (official): rainInchesNext6h ≥0.5 or rainPeakChance ≥80 → 2; ≥0.2 or ≥50 → 1. detail e.g. `0.3" next 6h · 80% peak 7–9pm`, or "Rain forecast unavailable"
   - Tide (official, ONLY if coastal): high tide within the next 4h and ft ≥ 6.0 → 2; within 4h → 1. detail "High tide 6.4 ft at 9:40pm"
   - Reports (observed): reports whose neighborhood === name: Σ severityWeight(low .5, med 1, high 2) × recency(<2h: 1, 2–6h: .5, 6–12h: .25), capped at 4, rounded to .5. detail "3 reports in last 2h". Return their ids in `reportIds`.
   - level: score ≥6 → High, ≥3 → Moderate, else Low.
   - Format tide times in America/Los_Angeles with `Intl.DateTimeFormat` (e.g. "9:40pm").
   Import `Report` from `./types` (`src/lib/types.ts`).

3. `src/lib/risk.test.ts`: a few `node:test` + `node:assert` cases (zero inputs → Low with all factors present; a coastal neighborhood with an imminent 6.5 ft tide gets 2 tide points, while a non-coastal one gets 0; recency weighting; level thresholds).
   Run them with `node --experimental-strip-types --test src/lib/risk.test.ts`. Use relative imports with `.ts` extensions inside these two files so Node can run them
   (if that breaks the `next build` typecheck, set `allowImportingTsExtensions` only if it's already allowed; otherwise put the test's import of risk.ts behind a relative path that works for both and explain what you did).

Verify: tests pass; `npm run build` passes; the stats JSON has 41 entries.
