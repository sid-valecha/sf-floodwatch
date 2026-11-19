### Task 9: Act on it: sandbag sites, report-to-311, Help sheet (source: sf.gov/urban-flooding)

North Star: the user knows the risk *and what to do*. Every item here is OFFICIAL (amber), sourced from sf.gov / sfpuc.gov, and shows its source link.

1. **`src/lib/resources.ts`** (new): typed constants, with the values verbatim:
   - Sandbag sites. Up to 10 per address, while supplies last, with proof of SF residence or business required. Source: https://www.sf.gov/urban-flooding
     - "Public Works Operations Yard": enter at Kansas & Marin St. Mon–Sat 8am–2pm, year-round, self-loading. `schedule: {days:[1,2,3,4,5,6], from:"08:00", to:"14:00"}`
     - "Marina Green Triangle": Marina Blvd at Marina Green Dr. Sat Nov 21, 2026, 8am–2pm.
     - "Ocean Beach Parking Lot": Great Highway at Balboa St (Stairwells 4–7). Sat Nov 21, 2026, 8am–2pm.
     - "Sherman St": between Folsom & Harrison. Sat Dec 5, 2026, 8am–2pm.
     - "SF Fire Training Center": 19th & Folsom. Sat Dec 5, 2026, 8am–2pm.
     Geocode each one with Nominatim (1 req/s, descriptive User-Agent) and HARDCODE the resulting lng/lat. Sanity-check each against the expected area (e.g. Kansas & Marin ≈ -122.4036, 37.7486). Note the method in a comment.
   - Report flooding: phone "311" (or 415-701-2311 from outside SF); web https://sf311.org; flooding page https://www.sf.gov/report-flooding-water-leaks-sewer-backup-or-odor-issues ("Report flooding, water leaks, sewer backup, or odor issues"; it includes clogged catch basins). Emergencies: 911.
   - AlertSF: "Text your ZIP code to 888-777" (use an `sms:888777` link where the body is the ZIP, if supported) or https://www.alertsf.org/
   - Adopt a Drain: https://adoptadrain.sfwater.org/
   - The official SFPUC 100-Year Storm Flood Risk Map: https://gis.sfpuc.org/portal/apps/instant/basic/index.html?appid=5dbe439cb71f42c89de0e2af110ae1f0
   - The SF Storm and Flood Hazard dashboard: https://www.arcgis.com/apps/dashboards/9b14420bdefc427981b1c244f0113328
   - Floodwater Grant (up to $100k): https://www.sfpuc.gov/programs/grants/floodwater-grant-program
   - NOAA high tides expected Nov 23–27 (source: SFPUC flood maps page)
2. **Map layer `sandbags`** (FloodMap.tsx + a MapApp toggle "Sandbag pickup", kind official, default ON): amber pins with a distinct shape from the alert polygons. Use a symbol or a square-ish circle with a dark stroke, and add a "SB" text label at zoom ≥13 if the basemap glyphs allow it, otherwise just the circle.
   Status is computed client-side in an effect, not in render: "Open now" / "Opens Sat 8am" / "Closed today" / an event date. Tap → a popup or small sheet with the name, the location text, the hours, the rules (10 bags, proof of residency) and the source link.
   Upcoming one-day sites show; past ones hide.
3. **"Report flooding here" button** in `RiskCard` and `ReportSheet` (amber outline): `tel:311` on mobile, plus a secondary link to the sf.gov flooding page. Small text under it: "Emergency? Call 911."
4. **Help sheet**: a "?" button on the top row (next to 🔍 and Layers) that opens a bottom sheet (max 70dvh, one sheet at a time, like the others). It contains:
   - **What the colors mean** (three rows: Observed / Official / Modeled, the same copy as the README table, kept short)
   - **What to do:** Get alerts (AlertSF), Report flooding (311), Sandbags (the nearest open site, plus "see map"), Adopt a Drain
   - **Official maps:** the two links above
   - the footer disclaimer
5. The banner's expanded view: add one line, "King tides expected Nov 23–27 (NOAA via SFPUC)".

Files you may touch: new `src/lib/resources.ts`, new `src/components/HelpSheet.tsx`, `FloodMap.tsx`, `MapApp.tsx`, `RiskCard.tsx`, `ReportSheet.tsx`, `ConditionsBanner.tsx`.
Don't touch `src/lib/reports/**`, `src/app/api/**` or `data/**`. No new dependencies. No Date.now() in render.
Verify: `npm run build`; a 390px iframe screenshot with the Help sheet open (headless needs `--use-angle=metal --enable-gpu` for the map to draw); the Kansas & Marin site reads "Open now" during Mon–Sat 8am–2pm PT and otherwise "Opens …".
