import { after, connection } from "next/server";
import news from "../../../../data/news.seed.json";
import snapshot from "../../../../data/reports.snapshot.json";
import { hasKeys, runPipeline } from "@/lib/reports/pipeline";
import { BudgetExceededError } from "@/lib/reports/sources";
import type { Report, ReportsPayload } from "@/lib/types";

export const maxDuration = 60; // runPipeline aborts at PIPELINE_DEADLINE_MS (50 s)

const TTL_MS = 10 * 60_000;
const COLD_TIMEOUT_MS = 8_000;
const FAILURE_BACKOFF_MS = 10 * 60_000; // after a failed refresh, no upstream calls for 10 min

// In-memory cache (per server instance) + one in-flight refresh shared by all requests.
let cache: { payload: ReportsPayload; at: number } | null = null;
let inflight: Promise<ReportsPayload | null> | null = null;
let lastFailureAt = 0;
const inBackoff = () => Date.now() - lastFailureAt < FAILURE_BACKOFF_MS;
const BACKOFF_NOTE = "Live reports are temporarily unavailable; showing the last snapshot.";

function snapshotPayload(note?: string): ReportsPayload {
  const s = snapshot as unknown as ReportsPayload;
  return { ...s, mode: "snapshot", note: note ?? s.note };
}

function refresh(): Promise<ReportsPayload | null> {
  if (inflight) return inflight;
  if (inBackoff()) return Promise.resolve(null);
  inflight = runPipeline()
    .then((r) => {
      const payload: ReportsPayload = { reports: r.reports, mode: "live", fetchedAt: new Date().toISOString() };
      cache = { payload, at: Date.now() };
      return payload;
    })
    .catch((e) => {
      const budget = e instanceof BudgetExceededError;
      console.error(`[reports] refresh failed${budget ? " (budget)" : ""}: ${(e as Error).message.slice(0, 200)}`);
      // Back off: no upstream calls for 10 min; serve the cache (or the snapshot) meanwhile.
      lastFailureAt = Date.now();
      return null;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function withNews(p: ReportsPayload): ReportsPayload {
  const seen = new Set(p.reports.map((r) => r.id));
  const extra = (news as unknown as Report[]).filter((r) => !seen.has(r.id));
  return { ...p, reports: [...p.reports, ...extra] };
}

export async function GET() {
  await connection(); // never prerender: this route reads live upstreams
  if (!hasKeys()) return Response.json(withNews(snapshotPayload()));

  if (cache) {
    if (Date.now() - cache.at > TTL_MS && !inBackoff()) after(refresh()); // stale-while-revalidate
    return Response.json(withNews(cache.payload));
  }

  if (inBackoff()) {
    console.log("[reports] in failure backoff: serving snapshot, no upstream calls");
    return Response.json(withNews(snapshotPayload(BACKOFF_NOTE)));
  }

  // Cold: wait up to 8 s, else serve the snapshot and let the refresh finish in the background.
  const pending = refresh();
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), COLD_TIMEOUT_MS));
  const fresh = await Promise.race([pending, timeout]);
  if (fresh) return Response.json(withNews(fresh));
  if (inBackoff()) return Response.json(withNews(snapshotPayload(BACKOFF_NOTE))); // failed fast
  after(pending);
  return Response.json(withNews(snapshotPayload("Live reports are loading; showing the last snapshot.")));
}
