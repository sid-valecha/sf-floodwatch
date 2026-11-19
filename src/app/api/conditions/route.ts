import { connection } from "next/server";
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
let chpInflight: Promise<RoadIncident[]> | null = null;

/** CHP incidents with their own 2 min cache. Never throws: on failure returns [] (retried after 30 s). */
async function getRoadIncidents(): Promise<RoadIncident[]> {
  if (chpCache && Date.now() - chpCache.at < chpCache.ttl) return chpCache.data;
  chpInflight ??= fetchChpFlooding()
    .then((data) => {
      chpCache = { at: Date.now(), ttl: CHP_TTL_MS, data };
      return data;
    })
    .catch((e) => {
      console.warn("[conditions] CHP feed failed:", String(e?.message ?? e));
      chpCache = { at: Date.now(), ttl: CHP_FAIL_TTL_MS, data: [] };
      return [] as RoadIncident[];
    })
    .finally(() => {
      chpInflight = null;
    });
  return chpInflight;
}

export async function GET() {
  await connection(); // opt out of prerendering: always dynamic
  const now = Date.now();
  const roadP = getRoadIncidents();
  if (cache && now - cache.at < cache.ttl) return Response.json({ ...cache.data, roadIncidents: await roadP });
  inflight ??= getConditions().finally(() => {
    inflight = null;
  });
  const data = await inflight;
  // Full successes cache 5 min; partial results only 30 s so one upstream blip doesn't stick; total failure isn't cached.
  if (data.failed.length < 4) cache = { at: Date.now(), ttl: data.failed.length === 0 ? TTL_MS : PARTIAL_TTL_MS, data };
  return Response.json({ ...data, roadIncidents: await roadP });
}
