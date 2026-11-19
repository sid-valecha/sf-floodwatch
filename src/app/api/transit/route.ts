import { after, connection } from "next/server";
import { fetchBart, type TransitAlert } from "@/lib/transit/bart";
import { pendingLabels, type TransitPayload } from "@/lib/transit/sources";

const TTL_MS = 2 * 60_000;
const FAIL_TTL_MS = 30_000;
let cache: { at: number; ttl: number; advisories: TransitAlert[]; elevators: TransitAlert[]; failed: string[] } | null = null;
let inflight: Promise<void> | null = null;

/** De-duplicated refresh. Never rejects. A part that fails keeps its previous alerts and is reported in `failed`. */
function refresh(): Promise<void> {
  inflight ??= fetchBart()
    .then((r) => {
      const failed: string[] = [];
      if (!r.advisories) failed.push("BART");
      if (!r.elevators) failed.push("BART elevators");
      cache = {
        at: Date.now(),
        ttl: failed.length ? FAIL_TTL_MS : TTL_MS,
        advisories: r.advisories ?? cache?.advisories ?? [],
        elevators: r.elevators ?? cache?.elevators ?? [],
        failed,
      };
    })
    .catch((e) => {
      console.warn("[transit] BART failed:", String(e?.message ?? e));
      cache = { at: Date.now(), ttl: FAIL_TTL_MS, advisories: cache?.advisories ?? [], elevators: cache?.elevators ?? [], failed: ["BART"] };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function GET() {
  await connection(); // always dynamic
  if (!cache) await refresh(); // cold start: wait (6s max) so we never show a false "no advisories"
  else if (Date.now() - cache.at >= cache.ttl) after(refresh); // stale-while-revalidate
  const c = cache;
  const payload: TransitPayload = {
    alerts: c ? [...c.advisories, ...c.elevators] : [],
    fetchedAt: new Date(c?.at ?? Date.now()).toISOString(),
    failed: c?.failed ?? ["BART"],
    pending: pendingLabels(),
  };
  return Response.json(payload);
}
