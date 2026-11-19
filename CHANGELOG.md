# Changelog

Newest first. Times are PT. Each entry is something that shipped to https://sf-floodwatch.vercel.app.
The **Tweet angle** line is a one-liner for posting about the update.

## 2026-11-18

### 5:20pm: Map renders on every phone (Safari included)
- Fixed a blank map on production. MapLibre's background worker wasn't being served, and its CSS collapsed the map container.
- **Tweet angle:** (internal fix; not tweet-worthy on its own)

### 5:15pm: Reports load instantly
- On a cold start, the last snapshot now shows immediately (0.1s instead of 8s), and live reports swap in about 20s later. The header badge shows how old the snapshot is.
- **Tweet angle:** "Opens instantly now, even on bad wifi."

### 5:05pm: Live X flood reports, located by Grok vision
- Searches X for flood posts with photos from the last 6h. Grok reads the post and the photo (street signs, storefronts, landmarks) to place each one. Every pin shows the photo, the summary, how it was located, the confidence, its age, and a link to the post.
- 5 news-reported incidents with article links: I-280 SB at Geneva, Embarcadero waves over the barriers, the Outer Sunset sewage geyser, Folsom St in the Mission, and the 101/Alemany off-ramp.
- **Tweet angle:** "Grok reads street signs in flood photos to figure out where they were taken."

### 5:00pm: Risk card, report feed, search, storm drains
- Tap any neighborhood for an explained Low / Moderate / High risk score.
- A feed of the latest reports, newest first.
- Neighborhood search.
- 23k storm drains and catch basins, shown when you zoom in.
- **Tweet angle:** "Tap your neighborhood and it tells you *why* it's at risk."

### 4:53pm: Official conditions
- NWS alerts banner and polygons, rain chance for the next 6h, current tide and next high tide (NOAA), and live rain radar.

### 4:48pm: First deploy
- Dark map with the SFPUC 100-year storm flood-risk zone, FEMA coastal flood zones, and coastal hotspots (Embarcadero, Fisherman's Wharf, Marina Green, Crissy Field, Islais Creek).
