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
// Minimal. Asking for JSON (strict schema or plain) made Grok answer [] without searching, so we ask
// for one line per post and parse the status URLs. Image URLs are whatever Grok reports (often none).
export const GROK_MODEL = "grok-4.20-non-reasoning"; // grok-4.7 + x_search exceeded 60 s in testing

export class GrokXSearchSource implements ReportSource {
  name = "grok-x-search";
  constructor(private apiKey: string) {}

  async fetchPosts(): Promise<RawPost[]> {
    const t0 = Date.now();
    const now = Date.now();
    const from = new Date(now - 24 * 3600_000).toISOString().slice(0, 10);
    const to = new Date(now + 24 * 3600_000).toISOString().slice(0, 10);
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model: GROK_MODEL,
        store: false,
        tools: [{ type: "x_search", from_date: from, to_date: to }],
        input: [
          {
            role: "user",
            content:
              "Search X for recent posts (last 6 hours) about street flooding in San Francisco, preferring posts with photos. List up to 20 with their post URLs. " +
              "Format each post as ONE line: <post URL> | <created_at ISO time> | <full post text on one line> | <attached image URLs separated by spaces, or none>",
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`xAI x_search ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const text = outputText(await res.json());
    if (process.env.DEBUG_XS) console.log(text.slice(0, 1200));
    const seen = new Set<string>();
    const posts: RawPost[] = [];
    for (const line of text.split("\n")) {
      const m = line.match(/https:\/\/(?:x|twitter)\.com\/(\w+)\/status\/(\d+)/);
      if (!m || seen.has(m[2])) continue;
      seen.add(m[2]);
      const parts = line.split("|").map((s) => s.trim());
      const when = parts.find((s) => /^\d{4}-\d{2}-\d{2}T/.test(s));
      const body = (parts.length >= 4 ? parts.slice(2, -1) : parts.slice(2)).join(" | ") || line;
      posts.push({
        id: m[2],
        text: body,
        createdAt: when && !isNaN(Date.parse(when)) ? new Date(when).toISOString() : new Date().toISOString(),
        author: m[1],
        url: `https://x.com/${m[1]}/status/${m[2]}`,
        imageUrls: line.match(/https:\/\/pbs\.twimg\.com\/[^\s|)\]]+/g) ?? [],
      });
    }
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
