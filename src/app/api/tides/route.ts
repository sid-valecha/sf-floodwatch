import { connection } from "next/server";
import { FALLBACK_MINOR_FLOOD_FT, fetchTideOutlook, type TideOutlook } from "@/lib/conditions/tides";

const TTL_MS = 6 * 60 * 60_000;
const FAIL_TTL_MS = 60_000;
let cache: { at: number; ttl: number; day: string; data: TideOutlook } | null = null;
let inflight: Promise<TideOutlook> | null = null;

export async function GET() {
  await connection(); // always dynamic
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }).replaceAll("-", "");
  if (cache && cache.day === today && Date.now() - cache.at < cache.ttl) return Response.json(cache.data);
  inflight ??= fetchTideOutlook(today)
    .catch((): TideOutlook => ({ days: [], minorFloodFt: FALLBACK_MINOR_FLOOD_FT, failed: true }))
    .finally(() => {
      inflight = null;
    });
  const data = await inflight;
  cache = { at: Date.now(), ttl: data.failed ? FAIL_TTL_MS : TTL_MS, day: today, data };
  return Response.json(data);
}
