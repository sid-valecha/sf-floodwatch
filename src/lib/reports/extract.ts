// Grok vision extraction: one batched xAI Responses call over post texts + photos.
import centroids from "./centroids.json";
import { outputText, type RawPost } from "./sources";

// Non-reasoning Grok 4.20 accepts ["text","image"] (GET /v1/language-models) and is fast enough for a
// request-time refresh; grok-4.7 (reasoning) took >90 s on a 25-post vision batch.
export const EXTRACT_MODEL = "grok-4.20-non-reasoning";
const BATCH = 5;

export const NEIGHBORHOODS = Object.keys(centroids);
const MAX_POSTS = 50;

export interface Extraction {
  post_id: string;
  neighborhood: string | null;
  cross_street: string | null;
  location_evidence: string;
  severity: "low" | "med" | "high";
  summary: string;
  is_firsthand: boolean;
  is_flooding: boolean;
  confidence: number;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "post_id",
          "neighborhood",
          "cross_street",
          "location_evidence",
          "severity",
          "summary",
          "is_firsthand",
          "is_flooding",
          "confidence",
        ],
        properties: {
          post_id: { type: "string" },
          neighborhood: { type: ["string", "null"], enum: [...NEIGHBORHOODS, null] },
          cross_street: { type: ["string", "null"] },
          location_evidence: { type: "string" },
          severity: { type: "string", enum: ["low", "med", "high"] },
          summary: { type: "string" },
          is_firsthand: { type: "boolean" },
          is_flooding: { type: "boolean" },
          confidence: { type: "number" },
        },
      },
    },
  },
};

const INSTRUCTIONS = `You analyze X posts about possible street flooding in San Francisco during a storm.
For EACH post below, return one item with:
- post_id: the post's id exactly as given.
- neighborhood: one value copied exactly from this list, or null if you cannot tell: ${JSON.stringify(NEIGHBORHOODS)}
- cross_street: the intersection or street address (e.g. "Folsom St & 17th St"), or null.
- location_evidence: how you located it: "text", "image: street sign", "image: landmark", "image: business", or "both" (text and photo agree).
- severity: low (ponding/puddles), med (lane or sidewalk flooded, cars slowed), high (deep water, stalled cars, water entering buildings).
- summary: at most 15 words describing what is seen.
- is_firsthand: true if the poster appears to be on scene (own photo, present tense).
- is_flooding: true only if the post shows or reports actual flooding/ponding in San Francisco now. False for jokes, forecasts, other cities, old events, ads, unrelated "flood" usage.
- confidence: 0-1, your confidence in the flooding AND the location.
Look carefully at the photos: read street signs, business names and storefronts, transit stops, and landmarks to locate the scene.
Return null rather than guess. Never invent a neighborhood or street that isn't supported by the text or photo.`;

function buildInput(posts: RawPost[], withImages: boolean) {
  const content: ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string; detail: string })[] = [
    { type: "input_text", text: INSTRUCTIONS },
  ];
  for (const p of posts) {
    content.push({
      type: "input_text",
      text: `--- POST post_id=${p.id} author=@${p.author} created_at=${p.createdAt}\n${p.text}${
        withImages && p.imageUrls[0] ? "\n(photo follows)" : ""
      }`,
    });
    if (withImages && p.imageUrls[0]) content.push({ type: "input_image", image_url: p.imageUrls[0], detail: "high" });
  }
  return [{ role: "user", content }];
}

async function callGrok(apiKey: string, posts: RawPost[], withImages: boolean, signal?: AbortSignal): Promise<Extraction[]> {
  console.log(`[reports] upstream call: xAI extract (${posts.length} posts, ${withImages ? "vision" : "text"})`);
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: signal ? AbortSignal.any([AbortSignal.timeout(45_000), signal]) : AbortSignal.timeout(45_000),
    body: JSON.stringify({
      model: EXTRACT_MODEL,
      store: false,
      input: buildInput(posts, withImages),
      text: { format: { type: "json_schema", name: "flood_extractions", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`xAI extract ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (JSON.parse(outputText(await res.json())) as { items: Extraction[] }).items;
}

async function extractBatch(
  apiKey: string,
  posts: RawPost[],
  signal?: AbortSignal,
): Promise<{ items: Extraction[]; mode: string }> {
  try {
    return { items: await callGrok(apiKey, posts, true, signal), mode: "vision" };
  } catch (e) {
    if (signal?.aborted) return { items: [], mode: "failed" }; // overall deadline hit: no retry
    console.warn(`[reports] Grok vision batch failed (${(e as Error).message.slice(0, 160)}); retrying text-only`);
    try {
      return { items: await callGrok(apiKey, posts, false, signal), mode: "text" };
    } catch (e2) {
      console.warn(`[reports] Grok text batch failed (${(e2 as Error).message.slice(0, 160)})`);
      return { items: [], mode: "failed" };
    }
  }
}

/** Extracts in parallel batches of 5 posts; returns one item per recognised post (unknown ids dropped). */
export async function extract(apiKey: string, allPosts: RawPost[], signal?: AbortSignal): Promise<Extraction[]> {
  const posts = allPosts.slice(0, MAX_POSTS);
  if (!posts.length) return [];
  const t0 = Date.now();
  const batches: RawPost[][] = [];
  for (let i = 0; i < posts.length; i += BATCH) batches.push(posts.slice(i, i + BATCH));
  const results = await Promise.all(batches.map((b) => extractBatch(apiKey, b, signal)));
  if (results.every((r) => r.mode === "failed")) throw new Error("all Grok extraction batches failed");
  const ids = new Set(posts.map((p) => p.id));
  const items: Extraction[] = [];
  for (const i of results.flatMap((r) => r.items)) {
    if (!ids.has(i.post_id)) continue; // unknown id
    ids.delete(i.post_id); // de-duplicate: first item per post wins
    items.push(i);
  }
  const modes = results.map((r) => r.mode).join(",");
  console.log(`[reports] Grok ${EXTRACT_MODEL} [${modes}]: ${posts.length} posts -> ${items.length} items in ${Date.now() - t0}ms`);
  return items;
}
