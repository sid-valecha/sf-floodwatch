# SF Flood Watch

**Live map of where San Francisco is flooding, or at risk, during the November 2026 El Niño storms.**
→ **https://sf-floodwatch.vercel.app** (built for phones)

It combines what people are reporting on X, official NWS/NOAA data, and modeled flood-risk zones on one map, keeping the three visually separate.

## How to read the map

| Color | Kind | What it is |
|---|---|---|
| 🔴 Pink pins | **Observed** | Flood photos posted on X in the last ~6h. Grok reads each post *and its photo* (street signs, storefronts, landmarks) to place it. Tap a pin to see the photo, the summary, how it was located, the confidence, and a link to the post. |
| 🟣 Purple pins | **Observed (news)** | Incidents from news reports, with article links. |
| 🟡 Amber | **Official** | NWS alerts (banner and dashed polygons), the hourly rain chance, SF tide now and the next high tide (NOAA 9414290), live rain radar, and CHP roadway flooding incidents (amber rings, from the public CHP incident feed). |
| 🔵 Blue fills | **Modeled** | SFPUC 100-year storm flood-risk zone (where runoff collects), FEMA coastal flood zones, coastal hotspots, and storm drains (zoom in). |

- **Pins fade with age:** full color under 2h old, faded at 2–6h, hidden after 12h (24h for news). Use **Last 30m · 1h · 3h · 6h · All** to show only fresh reports.
- **Sandbag sites, report-to-311 and alerts:** tap **?** for the Help sheet, or an amber sandbag pin for its hours.
- **Tap any neighborhood** (or 🔍 search) for a **Low / Moderate / High risk** card that shows every factor behind the score: flood-zone coverage, forecast rain, tide (coastal areas only), and recent reports.
- **The "snapshot" badge** means the live feed is loading or unavailable, and you're seeing the most recent saved results.

> Informational, not an official safety tool. Follow NWS / AlertSF / 511. No reports ≠ no flooding.

## How it works

- **Reports:** X API v2 recent search → **Grok vision** (xAI Responses API) extracts the neighborhood, cross street, severity and confidence from the text + photo → Nominatim geocodes the cross street, or the pin goes near the neighborhood center (marked approximate). Cached for 10 min, with a spend guard and a failure backoff. It falls back to a committed snapshot, so the app works with no API keys.
- **Conditions:** api.weather.gov alerts and hourly forecast, NOAA CO-OPS tides, RainViewer radar.
- **Risk score:** simple and explainable, with points for SFPUC/FEMA zone coverage, forecast rain, the tide (coastal only), active NWS flood alerts and recency-weighted reports. A fresh high-severity report raises an area to at least Moderate.
- **Stack:** Next.js (App Router) + TypeScript + Tailwind + MapLibre GL, deployed on Vercel. No database (yet).

Data: DataSF (SFPUC 100-yr storm flood risk zone, FEMA flood hazards, Analysis Neighborhoods, catch basins), NWS, NOAA, RainViewer, OpenStreetMap/CARTO.

## Changelog

See **[CHANGELOG.md](CHANGELOG.md)**. Every shipped improvement is logged there with a date and time.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: X_BEARER_TOKEN, XAI_API_KEY (without them, the app serves the snapshot)
npm run dev
```
