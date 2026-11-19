### Task 7: Final-review fix wave (demo credibility on flaky wifi)

Source: the final whole-branch review. Fix everything listed here, in one pass.

**Important**
1. `MapApp.tsx:101-112`. A failed /api/reports fetch is swallowed, nothing retries for 5 min, and the feed says "No reports yet". That reads as "no flooding".
   Fix: track a `reportsFailed` state, retry every 25 s while failing, and make the feed pill say "Reports unavailable · retrying" (rose outline, dimmed).
2. `MapApp.tsx:92-97`. A failed neighborhood-stats.json fetch is never retried. The risk card is then empty and misleading, and search is empty.
   Fix: retry with backoff (5 s, 15 s, 30 s). When `risk` is null, `RiskCard` shows "Risk data unavailable, retrying", while STILL listing that neighborhood's reports (filter the reports by `neighborhood` directly, not only by `reportIds`).
3. `risk.ts:146`. "Low risk" can sit on top of a fresh high-severity flood photo.
   Fix: if any report for the neighborhood has `severity === "high"` and is under 2 h old, set the level to at least "Moderate". Add a visible factor detail, e.g. "Raised to Moderate: high-severity report <2h". Add a node:test case for it to `src/lib/risk.test.ts`, and run it with `node --experimental-strip-types --test src/lib/risk.test.ts`.
4. `data/news.seed.json`, id `news-i280-geneva-flooding`. Set `createdAt` to `2026-11-18T10:35:00-08:00`, the CHP report time. Change nothing else in that file.

**Minor**
5. `ReportFeed.tsx:28`. The empty-state text says "last 6h". Make it "No flood reports right now. That doesn't mean streets are dry."
6. `ReportSheet.tsx:63`. For news, don't prefix the author with "@": show "Open article ↗ · CBS San Francisco". For news, the `LOCATED_BY.text` label should read "Located from article text".
7. `RiskCard`. Also list the 12–24 h news reports for the neighborhood, using the same neighborhood filter as in item 2, so the card matches the pins on the map. Scoring stays as it is.
8. `ReportSheet.tsx:17`. Change `70vh` to `70dvh`.
9. `ReportSheet` and `ReportFeed` `<img>`: on `onError`, hide the image (state flag), so no broken-image icon shows.
10. `src/lib/reports/sources.ts:153`. When the Grok fallback can't parse a time, DROP the post instead of defaulting to now.
    `risk.ts:126`: clamp negative ages to 0, but treat any report more than 10 min in the future as invalid (0 weight).

Files you may touch: `src/components/{MapApp,RiskCard,ReportFeed,ReportSheet}.tsx`, `src/lib/risk.ts`, `src/lib/risk.test.ts`, `src/lib/reports/sources.ts` (line ~153 only), `data/news.seed.json` (that one field only).
Don't change `src/app/api/**`. Keep `cacheComponents` safety: no Date.now() in render.
Verify: the risk tests pass, `npm run build` passes, and a 390-wide iframe screenshot of the feed "unavailable" state (force it by pointing the fetch at a 404 temporarily, then revert).
