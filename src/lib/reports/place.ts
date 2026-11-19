// Placement: Nominatim geocode for cross streets, else neighborhood centroid + ~150 m offset.
import geocodeSeed from "../../../data/geocode-cache.json";
import centroids from "./centroids.json";

const CENTROIDS = centroids as unknown as Record<string, [number, number]>;
const NOMINATIM =
  "https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=-122.52,37.83,-122.35,37.70&bounded=1";
const UA = "SF Flood Watch (https://sf-floodwatch.vercel.app; contact: valechasiddharth@gmail.com)";

/** query -> [lng, lat] or null (known miss). Seeded from data/geocode-cache.json. */
export const geocodeCache = new Map<string, [number, number] | null>(
  Object.entries(geocodeSeed as Record<string, [number, number] | null>),
);

let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geocode(crossStreet: string): Promise<[number, number] | null> {
  const q = `${crossStreet}, San Francisco, CA`;
  const key = q.toLowerCase();
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  try {
    const res = await fetch(`${NOMINATIM}&q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null; // don't cache transient errors
    const j = (await res.json()) as { lat: string; lon: string }[];
    const hit: [number, number] | null = j[0] ? [Number(j[0].lon), Number(j[0].lat)] : null;
    geocodeCache.set(key, hit);
    return hit;
  } catch {
    return null;
  }
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 2 ** 32;
}

/** Neighborhood centroid plus a deterministic ~100-200 m offset (stable across refreshes). */
export function centroidPoint(neighborhood: string, seed: string): [number, number] | null {
  const c = CENTROIDS[neighborhood];
  if (!c) return null;
  const angle = hash(seed) * 2 * Math.PI;
  const r = 100 + hash(seed + "r") * 100;
  const dLat = (r * Math.sin(angle)) / 111_320;
  const dLng = (r * Math.cos(angle)) / (111_320 * Math.cos((c[1] * Math.PI) / 180));
  return [Number((c[0] + dLng).toFixed(6)), Number((c[1] + dLat).toFixed(6))];
}
