// The live pipeline: source posts -> Grok extraction -> placement -> Report[].
import type { LocationEvidence, Report } from "../types";
import { extract, type Extraction } from "./extract";
import { CENTROIDS, centroidPoint, geocode, isGeocodeCached } from "./place";
import { BudgetExceededError, GrokXSearchSource, XApiSource, type RawPost } from "./sources";

const MAX_GEOCODES = 5; // uncached Nominatim lookups per refresh (1.1 s each)
const POSTS_TTL_MS = 10 * 60_000;
const GROK_SEARCH_MIN_INTERVAL_MS = 10 * 60_000;
export const PIPELINE_DEADLINE_MS = 50_000; // under the route's maxDuration (60 s)

// Raw posts are cached separately so a Grok failure retries extraction without re-buying posts from X.
let postsCache: { posts: RawPost[]; source: string; at: number } | null = null;
let lastGrokSearchAt = 0;

export interface PipelineResult {
  reports: Report[];
  posts: RawPost[];
  source: string;
  stats: { fetched: number; extracted: number; kept: number; geocoded: number; ms: number };
}

export function hasKeys() {
  return !!process.env.XAI_API_KEY;
}

/**
 * X API first; Grok x_search when there's no X token or X errors, at most once per 10 min.
 * Budget exhaustion propagates. Successful fetches are cached for 10 min.
 */
export async function fetchPosts(signal?: AbortSignal): Promise<{ posts: RawPost[]; source: string }> {
  if (postsCache && Date.now() - postsCache.at < POSTS_TTL_MS) {
    const age = Math.round((Date.now() - postsCache.at) / 1000);
    console.log(`[reports] using cached posts (${postsCache.posts.length}, ${age}s old)`);
    return postsCache;
  }
  const xToken = process.env.X_BEARER_TOKEN;
  let result: { posts: RawPost[]; source: string } | null = null;
  if (xToken) {
    try {
      const src = new XApiSource(xToken);
      result = { posts: await src.fetchPosts(signal), source: src.name };
    } catch (e) {
      if (e instanceof BudgetExceededError || signal?.aborted) throw e;
      console.warn(`[reports] X API failed (${(e as Error).message.slice(0, 160)}); falling back to Grok x_search`);
    }
  }
  if (!result) {
    if (Date.now() - lastGrokSearchAt < GROK_SEARCH_MIN_INTERVAL_MS) {
      throw new Error("Grok x_search fallback already used in the last 10 min");
    }
    lastGrokSearchAt = Date.now();
    const src = new GrokXSearchSource(process.env.XAI_API_KEY!);
    result = { posts: await src.fetchPosts(signal), source: src.name };
  }
  postsCache = { ...result, at: Date.now() };
  return result;
}

function evidence(raw: string): LocationEvidence {
  const s = raw.toLowerCase().trim();
  if (s.startsWith("both")) return "both";
  if (s.startsWith("image")) return "image";
  return "text";
}

async function toReport(
  post: RawPost,
  x: Extraction,
  allowGeocode: boolean,
  signal?: AbortSignal,
): Promise<Report | null> {
  const neighborhood = x.neighborhood!;
  let point: [number, number] | null = null;
  let approximate = false;
  let locationEvidence = evidence(x.location_evidence);
  if (x.cross_street && allowGeocode) point = await geocode(x.cross_street, signal);
  if (!point) {
    point = centroidPoint(neighborhood, post.id);
    approximate = true;
    if (!x.cross_street) locationEvidence = "neighborhood";
  }
  if (!point) return null;
  return {
    id: `x-${post.id}`,
    source: "x",
    url: post.url,
    createdAt: post.createdAt,
    author: post.author,
    text: post.text,
    summary: x.summary,
    severity: x.severity,
    neighborhood,
    crossStreet: x.cross_street,
    locationEvidence,
    locationDetail: x.location_evidence,
    confidence: Math.max(0, Math.min(1, x.confidence)),
    isFirsthand: x.is_firsthand,
    imageUrl: post.imageUrls[0],
    lng: point[0],
    lat: point[1],
    approximate,
  };
}

/** Runs extraction + placement on already-fetched posts. */
export async function processPosts(posts: RawPost[], signal?: AbortSignal) {
  const items = await extract(process.env.XAI_API_KEY!, posts, signal);
  signal?.throwIfAborted();
  const byId = new Map(posts.map((p) => [p.id, p]));
  // Only neighborhoods from our fixed list ever reach the client, even when geocoding succeeds.
  const kept = items.filter((i) => i.is_flooding && i.neighborhood && CENTROIDS[i.neighborhood]);
  const reports: Report[] = [];
  let lookups = 0;
  for (const x of kept) {
    let allow = !signal?.aborted;
    if (allow && x.cross_street && !isGeocodeCached(x.cross_street)) {
      allow = lookups < MAX_GEOCODES;
      if (allow) lookups++;
    }
    const r = await toReport(byId.get(x.post_id)!, x, allow, signal);
    if (r) reports.push(r);
  }
  return { reports, extracted: items.length, geocoded: reports.filter((r) => !r.approximate).length };
}

/** One overall deadline (50 s): hitting it aborts in-flight upstream calls and rejects, which counts as a failure. */
export async function runPipeline(postsOverride?: RawPost[], deadlineMs = PIPELINE_DEADLINE_MS): Promise<PipelineResult> {
  const t0 = Date.now();
  const signal = AbortSignal.timeout(deadlineMs);
  const { posts, source } = postsOverride ? { posts: postsOverride, source: "file" } : await fetchPosts(signal);
  const { reports, extracted, geocoded } = await processPosts(posts, signal);
  signal.throwIfAborted();
  const stats = { fetched: posts.length, extracted, kept: reports.length, geocoded, ms: Date.now() - t0 };
  console.log(`[reports] pipeline (${source}): ${JSON.stringify(stats)}`);
  return { reports, posts, source, stats };
}
