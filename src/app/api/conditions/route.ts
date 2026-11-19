import { after, connection } from "next/server";
import { getConditions } from "@/lib/conditions/fetch";
import { fetchChpFlooding } from "@/lib/conditions/chp";
import type { ConditionsPayload, RoadIncident } from "@/lib/conditions/types";

const TTL_MS = 5 * 60_000;
const PARTIAL_TTL_MS = 30_000;
const CHP_TTL_MS = 2 * 60_000;
const CHP_FAIL_TTL_MS = 30_000;
let cache: { at: number; ttl: number; data: ConditionsPayload } | null = null;
let inflight: Promise<ConditionsPayload> | null = null;
let chpCache: { at: number; ttl: number; data: RoadIncident[] } | null = null;
let chpInflight: Promise<void> | null = null;

/** Background refresh, de-duplicated. Never rejects. On failure keeps serving the previous data. */
function refreshChp(): Promise<void> {
  chpInflight ??= fetchChpFlooding()
    .then((data) => {
      chpCache = { at: Date.now(), ttl: CHP_TTL_MS, data };
    })
    .catch((e) => {
      console.warn("[conditions] CHP feed failed:", String(e?.message ?? e));
      chpCache = { at: Date.now(), ttl: CHP_FAIL_TTL_MS, data: chpCache?.data ?? [] };
    })
    .finally(() => {
      chpInflight = null;
    });
  return chpInflight;
}

/** Stale-while-revalidate: returns cached incidents (or [] on cold start) immediately; CHP never adds latency. */
function getRoadIncidents(): RoadIncident[] {
  if (!chpCache || Date.now() - chpCache.at >= chpCache.ttl) after(refreshChp);
  return chpCache?.data ?? [];
}

export async function GET() {
  await connection(); // opt out of prerendering: always dynamic
  const now = Date.now();
  const roadIncidents = getRoadIncidents();
  if (cache && now - cache.at < cache.ttl) return Response.json({ ...cache.data, roadIncidents });
  inflight ??= getConditions().finally(() => {
    inflight = null;
  });
  const data = await inflight;
  // Full successes cache 5 min; partial results only 30 s so one upstream blip doesn't stick; total failure isn't cached.
  if (data.failed.length < 4) cache = { at: Date.now(), ttl: data.failed.length === 0 ? TTL_MS : PARTIAL_TTL_MS, data };
  return Response.json({ ...data, roadIncidents });
}
