// Post sources for the reports pipeline. No next/* imports here so scripts/ can use this under tsx.

export interface RawPost {
  id: string;
  text: string;
  createdAt: string; // ISO
  author: string;
  url: string;
  imageUrls: string[];
}

export interface ReportSource {
  name: string;
  fetchPosts(): Promise<RawPost[]>;
}

export class BudgetExceededError extends Error {
  constructor(used: number) {
    super(`X daily read budget reached (${used}/${DAILY_POST_BUDGET})`);
  }
}

// ---- Budget guard: posts read per PT calendar day (module-level, per server instance) ----
export const DAILY_POST_BUDGET = 1500;
const ptDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const budget = { day: ptDate(), used: 0 };

function budgetUsed() {
  const d = ptDate();
  if (d !== budget.day) {
    budget.day = d;
    budget.used = 0;
  }
  return budget.used;
}

export function budgetStatus() {
  return { day: budget.day, used: budgetUsed(), limit: DAILY_POST_BUDGET };
}

// ---- X API v2 recent search ----
export const X_QUERY =
  '(flood OR flooding OR flooded OR "under water" OR "knee deep" OR ponding OR "storm drain") ("San Francisco" OR SF OR SoMa OR Mission OR Embarcadero OR Dogpatch OR Marina OR Sunset OR Richmond) has:images -is:retweet lang:en';

interface XMedia {
  media_key: string;
  type: string;
  url?: string;
  preview_image_url?: string;
}
interface XSearchResponse {
  data?: { id: string; text: string; created_at: string; author_id: string; attachments?: { media_keys?: string[] } }[];
  includes?: { media?: XMedia[]; users?: { id: string; username: string }[] };
  meta?: { result_count: number };
  errors?: unknown[];
}

export class XApiSource implements ReportSource {
  name = "x-api";
  constructor(private token: string) {}

  async fetchPosts(): Promise<RawPost[]> {
    if (budgetUsed() >= DAILY_POST_BUDGET) throw new BudgetExceededError(budget.used);
    const params = new URLSearchParams({
      query: X_QUERY,
      max_results: "50",
      start_time: new Date(Date.now() - 6 * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      expansions: "attachments.media_keys,author_id",
      "media.fields": "url,preview_image_url,type",
      "tweet.fields": "created_at,author_id,attachments",
      "user.fields": "username",
    });
    const t0 = Date.now();
    const res = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`X API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as XSearchResponse;
    const tweets = j.data ?? [];
    budget.used += tweets.length;
    const media = new Map((j.includes?.media ?? []).map((m) => [m.media_key, m]));
    const users = new Map((j.includes?.users ?? []).map((u) => [u.id, u.username]));
    const posts = tweets.map((t) => {
      const author = users.get(t.author_id) ?? t.author_id;
      const imageUrls = (t.attachments?.media_keys ?? [])
        .map((k) => media.get(k))
        .map((m) => (m ? (m.type === "photo" ? m.url : m.preview_image_url) : undefined))
        .filter((u): u is string => !!u);
      return {
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        author,
        url: `https://x.com/${author}/status/${t.id}`,
        imageUrls,
      };
    });
    console.log(`[reports] X API: ${posts.length} posts in ${Date.now() - t0}ms (budget ${budget.used}/${DAILY_POST_BUDGET})`);
    return posts;
  }
}

// ---- Fallback: Grok with the x_search tool (xAI Responses API) ----
// Minimal: asks Grok to search X and return posts in the RawPost shape via structured output.
// Image URLs are whatever Grok reports; often empty.
export const GROK_MODEL = "grok-4.7";

export class GrokXSearchSource implements ReportSource {
  name = "grok-x-search";
  constructor(private apiKey: string) {}

  async fetchPosts(): Promise<RawPost[]> {
    const t0 = Date.now();
    const today = new Date();
    const from = new Date(today.getTime() - 24 * 3600_000).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 24 * 3600_000).toISOString().slice(0, 10);
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: GROK_MODEL,
        store: false,
        tools: [{ type: "x_search", from_date: from, to_date: to, enable_image_understanding: true }],
        input: [
          {
            role: "user",
            content:
              "Search X for posts from the last 6 hours showing or describing flooding, ponding, or overflowing storm drains in San Francisco, ideally with photos. " +
              "Return up to 25 real posts you actually found. Use the exact post id, text, author username (no @), created_at ISO time, post URL, and any image URLs (pbs.twimg.com) attached. " +
              "Never invent posts; return an empty list if none.",
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "x_posts",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["posts"],
              properties: {
                posts: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "text", "createdAt", "author", "url", "imageUrls"],
                    properties: {
                      id: { type: "string" },
                      text: { type: "string" },
                      createdAt: { type: "string" },
                      author: { type: "string" },
                      url: { type: "string" },
                      imageUrls: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`xAI x_search ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const parsed = JSON.parse(outputText(await res.json())) as { posts: RawPost[] };
    const posts = parsed.posts.filter((p) => /^\d+$/.test(p.id) && p.url.includes("/status/"));
    console.log(`[reports] Grok x_search: ${posts.length} posts in ${Date.now() - t0}ms`);
    return posts;
  }
}

/** Extracts the output_text of the message item from a Responses API result. */
export function outputText(j: unknown): string {
  const out = (j as { output?: { type: string; content?: { type: string; text?: string }[] }[] }).output ?? [];
  const msg = out.find((o) => o.type === "message");
  const text = msg?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) throw new Error("xAI response had no output_text");
  return text;
}
