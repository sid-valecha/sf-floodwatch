import { connection } from "next/server";
import { getConditions } from "@/lib/conditions/fetch";
import type { ConditionsPayload } from "@/lib/conditions/types";

const TTL_MS = 5 * 60_000;
const PARTIAL_TTL_MS = 30_000;
let cache: { at: number; ttl: number; data: ConditionsPayload } | null = null;
let inflight: Promise<ConditionsPayload> | null = null;

export async function GET() {
  await connection(); // opt out of prerendering: always dynamic
  const now = Date.now();
  if (cache && now - cache.at < cache.ttl) return Response.json(cache.data);
  inflight ??= getConditions().finally(() => {
    inflight = null;
  });
  const data = await inflight;
  // Full successes cache 5 min; partial results only 30 s so one upstream blip doesn't stick; total failure isn't cached.
  if (data.failed.length < 4) cache = { at: Date.now(), ttl: data.failed.length === 0 ? TTL_MS : PARTIAL_TTL_MS, data };
  return Response.json(data);
}
