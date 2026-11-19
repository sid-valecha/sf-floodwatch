import { connection } from "next/server";
import { getConditions } from "@/lib/conditions/fetch";
import type { ConditionsPayload } from "@/lib/conditions/types";

const TTL_MS = 5 * 60_000;
let cache: { at: number; data: ConditionsPayload } | null = null;
let inflight: Promise<ConditionsPayload> | null = null;

export async function GET() {
  await connection(); // opt out of prerendering: always dynamic
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return Response.json(cache.data);
  inflight ??= getConditions().finally(() => {
    inflight = null;
  });
  const data = await inflight;
  // Don't cache a fully failed result for the whole TTL.
  if (data.failed.length < 4) cache = { at: Date.now(), data };
  return Response.json(data);
}
