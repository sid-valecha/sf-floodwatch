// BART service advisories + elevator status (public BART API, shared public key documented by BART).
// Dependency-free so it runs under `node --test`.

export interface TransitAlert {
  id: string;
  agency: "BART";
  kind: "advisory" | "elevator";
  title: string;
  text: string;
  /** ISO UTC, when BART gave a parseable posted time. */
  postedAt?: string;
  url: string;
  weatherRelated: boolean;
}

export const BART_KEY = "MW9S-E7SL-26DU-VV8V";
export const BART_ADVISORIES_URL = "https://www.bart.gov/schedules/advisories";
export const BART_BSA_URL = `https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=${BART_KEY}&json=y`;
export const BART_ELEV_URL = `https://api.bart.gov/api/bsa.aspx?cmd=elev&key=${BART_KEY}&json=y`;
const TIMEOUT_MS = 6000;
const UA = "sf-floodwatch (https://sf-floodwatch.vercel.app)";

// Leading \b so "train" does not match "rain" (the plain regex flagged every train advisory).
// Whole-word matches only: "train" must not match "rain", "window" must not match "wind". "power" is left out (outages are usually equipment).
const WEATHER = /\b(flood(s|ed|ing)?|water|storms?|weather|rain(s|ing|fall)?|winds?|trees?|(mud)?slides?|mud)\b/i;
const NO_DELAYS = /^\s*no\s+(delays|advisories|elevator\s+outages?)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

type Cdata = string | { "#cdata-section"?: string } | null | undefined;
interface RawItem {
  "@id"?: string;
  station?: string;
  type?: string;
  description?: Cdata;
  sms_text?: Cdata;
  posted?: string;
  expires?: string;
}

function cdata(v: Cdata): string {
  const s = typeof v === "string" ? v : (v?.["#cdata-section"] ?? "");
  return s.replace(/\s+/g, " ").trim();
}

/** "Thu Nov 19 2026 06:31 AM PST" -> ISO UTC (uses the PST/PDT suffix for the offset), else undefined. */
export function parseBartTime(s: string | undefined): string | undefined {
  const m = /([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP])M\s*(P[SD]T)/i.exec(s ?? "");
  if (!m) return undefined;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return undefined;
  const h = (Number(m[4]) % 12) + (m[6].toUpperCase() === "P" ? 12 : 0);
  const offsetH = m[7].toUpperCase() === "PDT" ? 7 : 8;
  const ms = Date.UTC(Number(m[3]), mon, Number(m[2]), h + offsetH, Number(m[5]));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** Normalize a BART bsa/elev JSON response. `root.bsa` may be an array, a single object, or missing. */
export function parseBart(json: unknown, kind: TransitAlert["kind"]): TransitAlert[] {
  const bsa = (json as { root?: { bsa?: RawItem | RawItem[] } } | null)?.root?.bsa;
  const items: RawItem[] = Array.isArray(bsa) ? bsa : bsa && typeof bsa === "object" ? [bsa] : [];
  const out: TransitAlert[] = [];
  items.forEach((it, i) => {
    const text = cdata(it.description) || cdata(it.sms_text);
    if (!text || NO_DELAYS.test(text)) return;
    const type = (it.type ?? "").trim();
    out.push({
      id: `bart-${kind}-${it["@id"] ?? i}`,
      agency: "BART",
      kind,
      title: kind === "elevator" ? "Elevator status" : type ? type[0] + type.slice(1).toLowerCase() : "Advisory",
      text,
      postedAt: parseBartTime(it.posted),
      url: BART_ADVISORIES_URL,
      weatherRelated: WEATHER.test(text),
    });
  });
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!r.ok) throw new Error(`BART ${r.status}`);
  return r.json();
}

/** Fetches advisories and elevators independently; never rejects. Each part is null when it failed. */
export async function fetchBart(): Promise<{ advisories: TransitAlert[] | null; elevators: TransitAlert[] | null }> {
  const [adv, elev] = await Promise.allSettled([getJson(BART_BSA_URL), getJson(BART_ELEV_URL)]);
  return {
    advisories: adv.status === "fulfilled" ? parseBart(adv.value, "advisory") : null,
    elevators: elev.status === "fulfilled" ? parseBart(elev.value, "elevator") : null,
  };
}
