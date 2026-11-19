// The live pipeline: source posts -> Grok extraction -> placement -> Report[].
import type { LocationEvidence, Report } from "../types";
import { extract, type Extraction } from "./extract";
import { centroidPoint, geocode } from "./place";
import { BudgetExceededError, GrokXSearchSource, XApiSource, type RawPost } from "./sources";

const MAX_GEOCODES = 10;

export interface PipelineResult {
  reports: Report[];
  posts: RawPost[];
  source: string;
  stats: { fetched: number; extracted: number; kept: number; geocoded: number; ms: number };
}

export function hasKeys() {
  return !!process.env.XAI_API_KEY;
}

/** X API first; Grok x_search when there's no X token or X errors. Budget exhaustion propagates. */
export async function fetchPosts(): Promise<{ posts: RawPost[]; source: string }> {
  const xToken = process.env.X_BEARER_TOKEN;
  const xaiKey = process.env.XAI_API_KEY!;
  if (xToken) {
    try {
      const src = new XApiSource(xToken);
      return { posts: await src.fetchPosts(), source: src.name };
    } catch (e) {
      if (e instanceof BudgetExceededError) throw e;
      console.warn(`[reports] X API failed (${(e as Error).message.slice(0, 160)}); falling back to Grok x_search`);
    }
  }
  const src = new GrokXSearchSource(xaiKey);
  return { posts: await src.fetchPosts(), source: src.name };
}

function evidence(raw: string): LocationEvidence {
  const s = raw.toLowerCase().trim();
  if (s.startsWith("both")) return "both";
  if (s.startsWith("image")) return "image";
  return "text";
}

async function toReport(post: RawPost, x: Extraction, allowGeocode: boolean): Promise<Report | null> {
  const neighborhood = x.neighborhood!;
  let point: [number, number] | null = null;
  let approximate = false;
  let locationEvidence = evidence(x.location_evidence);
  if (x.cross_street && allowGeocode) point = await geocode(x.cross_street);
  if (!point) {
    point = centroidPoint(neighborhood, post.id);
    approximate = true;
    if (!x.cross_street) locationEvidence = "neighborhood";
  }
  if (!point) return null; // neighborhood not in our list
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
export async function processPosts(posts: RawPost[]) {
  const items = await extract(process.env.XAI_API_KEY!, posts);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const kept = items.filter((i) => i.is_flooding && i.neighborhood);
  const reports: Report[] = [];
  let geocodes = 0;
  for (const x of kept) {
    const allow = geocodes < MAX_GEOCODES;
    if (x.cross_street && allow) geocodes++;
    const r = await toReport(byId.get(x.post_id)!, x, allow);
    if (r) reports.push(r);
  }
  return { reports, extracted: items.length, geocoded: reports.filter((r) => !r.approximate).length };
}

export async function runPipeline(postsOverride?: RawPost[]): Promise<PipelineResult> {
  const t0 = Date.now();
  const { posts, source } = postsOverride
    ? { posts: postsOverride, source: "file" }
    : await fetchPosts();
  const { reports, extracted, geocoded } = await processPosts(posts);
  const stats = { fetched: posts.length, extracted, kept: reports.length, geocoded, ms: Date.now() - t0 };
  console.log(`[reports] pipeline (${source}): ${JSON.stringify(stats)}`);
  return { reports, posts, source, stats };
}
