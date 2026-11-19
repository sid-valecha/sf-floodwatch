# Changelog

Newest first. Times are PT. Each entry is something that shipped to https://sf-floodwatch.vercel.app.
The **Tweet angle** line is a one-liner for posting about the update.

## 2026-11-19

### 12:31am: "Show me just the last hour"
- A new **Last 30m · 1h · 3h · 6h · All** filter under the alerts banner trims the map pins and the report feed to what's fresh. Your choice is remembered on your phone.
- The filter only changes what you see. Risk scores still count every recent report, so narrowing the view never makes a neighborhood look lower risk.
- When a window is empty, the map says "No reports in the last 1h. That doesn't mean no flooding."
- **Tweet angle:** "Storm's moving fast? SF Flood Watch now has a 'last 30 min' filter, so you see only fresh flood photos. Risk scores still count everything, because no recent posts ≠ no flooding."

### 12:28am: Official flood alerts now count toward risk
- An active **NWS flood alert** now adds to every neighborhood's risk score: +2 for a Warning, +1 for an Advisory or Watch. The risk card names the alert, for example "NWS Coastal Flood Advisory in effect". One is in effect right now.
- When several posts about one flood merge into a single pin, that pin now keeps a photo, even if the best-placed post had none.
- Pins now fade and disappear by age on a timer, instead of only when reports refresh.
- Sandbag sheets now show "Event ended" instead of going blank, and the Help sheet links to SF's sandbag page.
- **Tweet angle:** "NWS just issued a Coastal Flood Advisory for SF. SF Flood Watch now folds official alerts into each neighborhood's risk score and tells you which one, next to the flood photos people are posting."

## 2026-11-18

### 6:04pm: From "where's the risk" to "what do I do"
- **Sandbag pickup sites** on the map (amber, official, from sf.gov/urban-flooding), with live status such as "Open now · until 2pm" or "Opens Mon 8am".
  - The Public Works yard (Kansas & Marin) is open Mon–Sat 8am–2pm.
  - Marina Green and Ocean Beach pop-up sites run Sat Nov 21.
- **"Report flooding here" button** on every risk card and report: one tap to call 311, plus the sf.gov form link. Emergency? Call 911.
- **"?" Help sheet:**
  - what the colors mean
  - how to get alerts (text your ZIP to 888-777 / AlertSF)
  - how to report flooding and clogged drains
  - sandbags
  - Adopt a Drain
  - SF's official flood maps
- **King tide notice:** NOAA expects king tides Nov 23–27, the next coastal flood window.
- **Tweet angle:** "SF Flood Watch now tells you what to *do*: the nearest open sandbag site, one-tap report to 311, and AlertSF signup. King tides are coming Nov 23–27."

### 5:54pm: One incident = one pin; Waymo + Moscone pins
- Grok now gives each post an incident key, so reposts and commentary about the same event collapse into one pin with "+N similar posts" links.
- New pins:
  - the Waymo stalled in flooded lanes on Oak St (Panhandle), from @julia_n_daniel's video
  - Supervisor Bilal Mahmood's statement that Waymo service was paused after cars stalled in flood zones
  - water pouring into Moscone Center during Microsoft Ignite, from @socialchanger's video
- **Tweet angle:** "Same flood, 3 reposts → 1 pin. Grok tags each post with the incident it's about, so the map shows events, not noise."

### 5:52pm: Honest under bad wifi, smarter risk
- If reports or risk data fail to load, the app now says "unavailable · retrying" and keeps retrying, instead of showing an empty map that reads as "no flooding".
- A fresh (<2h) high-severity flood photo now raises a neighborhood to at least **Moderate** risk, with the reason shown on the card.
- News pins say "Open article" and show the outlet. Broken images hide cleanly. The I-280/Geneva pin now uses the CHP report time (10:35am).
- **Tweet angle:** "If there's a fresh photo of a flooded street in your area, the map won't call it Low risk, whatever the models say."

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
