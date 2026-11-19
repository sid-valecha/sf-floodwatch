### Task 3: Conditions banner + radar + NWS alert polygons

Files you own: `src/app/api/conditions/route.ts`, `src/lib/conditions/**`, `src/components/ConditionsBanner.tsx` (new), and minimal wiring edits in `src/components/MapApp.tsx` (pass `radarTileUrl` and `alertsGeoJSON` to `FloodMap`, render the banner below the title). `FloodMap.tsx` already supports both props. Do not touch `src/lib/reports/**` or `src/app/api/reports/**`.

1. `/api/conditions` (dynamic, in-memory cache 5 min), returns:
   - NWS (`api.weather.gov`, header `User-Agent: SF Flood Watch (contact: valechasiddharth@gmail.com)`): active alerts for point `37.7749,-122.4194` (`/alerts/active?point=...`) → `{event, headline, severity, ends, url}` plus a GeoJSON FeatureCollection of alerts that have geometry. Hourly forecast via `/points/37.7749,-122.4194` → `forecastHourly`. Next 6 hours: `{time, precipChance, shortForecast}`, plus a short "rain next 6h" summary (peak chance + window).
   - NOAA CO-OPS station 9414290: latest water level (`product=water_level&date=latest&datum=MLLW&units=english&time_zone=lst_ldt`) and the next high tide (`product=predictions&interval=hilo&begin_date=today&range=48`, first H after now).
   - Each upstream wrapped in try/catch with a 6 s timeout; partial data is fine; report which sources failed.
2. RainViewer radar: client fetches `https://api.rainviewer.com/public/weather-maps.json`, builds the tile URL for the latest past frame: `{host}{path}/256/{z}/{x}/{y}/2/1_1.png`. Bonus only if trivial: animate the last ~6 frames (500 ms per frame); otherwise show the latest frame.
3. `ConditionsBanner`: compact and collapsible, under the title. Amber OFFICIAL styling. One line by default: alert event name (or "No active NWS alerts"), rain next 6h, tide now + next high tide time. Tap to expand into the alert headline, a link, and the hourly list. Label the sources (NWS / NOAA).
4. Pass `alertsGeoJSON` and `radarTileUrl` into `FloodMap`.

Verify: `npm run build`; `curl localhost:3000/api/conditions` returns real NWS + NOAA data.

