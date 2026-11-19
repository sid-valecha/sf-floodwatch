// Refresh data/reports.snapshot.json from the deployed site WITHOUT spending X credits.
// Run: node --experimental-strip-types scripts/pull-snapshot.ts
import { writeFileSync } from "node:fs";

const API = "https://sf-floodwatch.vercel.app/api/reports";
const OUT = new URL("../data/reports.snapshot.json", import.meta.url);
const TRIES = 4; // first try + up to 3 retries
const WAIT_MS = 25_000;

interface Payload {
  reports: { source: string }[];
  mode: string;
  fetchedAt: string;
  note?: string;
}

for (let i = 1; i <= TRIES; i++) {
  const res = await fetch(API);
  const p = (await res.json()) as Payload;
  console.log(`try ${i}: HTTP ${res.status}, mode=${p.mode}, reports=${p.reports?.length}`);
  if (p.mode === "live") {
    const x = p.reports.filter((r) => r.source === "x"); // news is merged at runtime from data/news.seed.json
    const out = { reports: x, mode: "snapshot", fetchedAt: p.fetchedAt, note: `Snapshot of ${x.length} X reports (pulled from the live site).` };
    writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
    console.log(`wrote ${x.length} X reports`);
    process.exit(0);
  }
  if (i < TRIES) await new Promise((r) => setTimeout(r, WAIT_MS));
}
console.error("never got mode=live; snapshot left unchanged");
process.exit(1);
