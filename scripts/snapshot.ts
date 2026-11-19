// Runs the live reports pipeline once and writes data/reports.snapshot.json + data/geocode-cache.json.
//   npx tsx --env-file=.env.local scripts/snapshot.ts                    # live: X API (or Grok x_search) + Grok
//   npx tsx --env-file=.env.local scripts/snapshot.ts --posts-from f.json  # re-run extraction on saved posts (no X spend)
//   --save-posts f.json  saves the fetched raw posts for later --posts-from runs
import { readFileSync, writeFileSync } from "node:fs";
import { fetchPosts, runPipeline } from "../src/lib/reports/pipeline";
import { geocodeCache } from "../src/lib/reports/place";
import type { RawPost } from "../src/lib/reports/sources";
import type { ReportsPayload } from "../src/lib/types";

function arg(name: string) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.XAI_API_KEY) throw new Error("XAI_API_KEY not set (use --env-file=.env.local)");
  console.log(`keys: X_BEARER_TOKEN ${process.env.X_BEARER_TOKEN ? "set" : "unset"}, XAI_API_KEY set`);
  const from = arg("--posts-from");
  let posts: RawPost[];
  let source = arg("--source") ?? "file"; // label for --posts-from runs, e.g. "X API"
  if (from) posts = JSON.parse(readFileSync(from, "utf8")) as RawPost[];
  else {
    ({ posts, source } = await fetchPosts());
    const save = arg("--save-posts"); // save before extraction so a Grok failure never wastes X spend
    if (save) writeFileSync(save, JSON.stringify(posts, null, 1));
  }
  const r = { ...(await runPipeline(posts)), source };

  const payload: ReportsPayload = {
    reports: r.reports,
    mode: "snapshot",
    fetchedAt: new Date().toISOString(),
    note: `Snapshot of ${r.reports.length} X reports (from ${r.stats.fetched} posts via ${r.source}).`,
  };
  writeFileSync("data/reports.snapshot.json", JSON.stringify(payload, null, 1) + "\n");
  writeFileSync("data/geocode-cache.json", JSON.stringify(Object.fromEntries(geocodeCache), null, 1) + "\n");
  console.log(`source=${r.source} stats=${JSON.stringify(r.stats)}`);
  console.log(`with image: ${r.reports.filter((x) => x.imageUrl).length}, geocoded: ${r.stats.geocoded}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
