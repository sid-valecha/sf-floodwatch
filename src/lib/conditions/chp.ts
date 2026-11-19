// CHP public CAD feed (statewide XML). We keep only flood-related incidents inside SF
// from the Golden Gate (GGCC) dispatch. No dependency: simple regex/string parsing.
import { readFile } from "node:fs/promises";
import path from "node:path";
// @ts-expect-error TS5097: extension import is required at runtime by node --test
import { findNeighborhood, type NhoodFeature } from "../geo.ts";
import type { RoadIncident } from "./types";

export const CHP_URL = "https://media.chp.ca.gov/sa_xml/sa.xml";
export const CHP_INCIDENT_URL = "https://cad.chp.ca.gov/";
const UA = "sf-floodwatch (https://sf-floodwatch.vercel.app)";
const TIMEOUT_MS = 6000;

const SF_BBOX = { minLat: 37.7, maxLat: 37.84, minLng: -122.53, maxLng: -122.35 };
const FLOODISH = /flood|ponding|standing water|water on (the )?(road|rdwy|roadway)|hydroplan/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ptFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** Offset (ms) of America/Los_Angeles from UTC at the given instant (negative: -8h PST / -7h PDT). */
function ptOffsetMs(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const x of ptFmt.formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "Nov 18 2026  4:08PM" (Pacific local time, possible double space) -> ISO UTC, or null. */
export function parseChpTime(s: string): string | null {
  const m = /^\s*([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP])M\s*$/i.exec(s);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[1].toLowerCase());
  if (mon < 0) return null;
  let h = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "P") h += 12;
  const wall = Date.UTC(Number(m[3]), mon, Number(m[2]), h, Number(m[5]));
  // Resolve the offset at the candidate instant, then re-check once (handles DST edges).
  let utc = wall - ptOffsetMs(wall);
  utc = wall - ptOffsetMs(utc);
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

function unquote(s: string): string {
  return s.trim().replace(/^"/, "").replace(/"$/, "").trim();
}

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? unquote(m[1]) : "";
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Pure parser: XML text -> SF flood-related road incidents (GGCC dispatch only), newest first. */
export function parseChpFlooding(
  xml: string,
  locate: (lng: number, lat: number) => string | null = () => null,
): RoadIncident[] {
  const out: RoadIncident[] = [];
  const dispatchRe = /<Dispatch\s+ID\s*=\s*"GGCC"\s*>([\s\S]*?)<\/Dispatch>/g;
  for (const d of xml.matchAll(dispatchRe)) {
    for (const lm of d[1].matchAll(/<Log\s+ID\s*=\s*"([^"]+)"\s*>([\s\S]*?)<\/Log>/g)) {
      const id = lm[1];
      const body = lm[2];
      const ll = /^(\d+):(\d+)$/.exec(tag(body, "LATLON"));
      if (!ll) continue;
      const lat = Number(ll[1]) / 1e6;
      const lng = -Number(ll[2]) / 1e6;
      if (!lat || !lng) continue; // "0:0" = unknown
      if (lat < SF_BBOX.minLat || lat > SF_BBOX.maxLat || lng < SF_BBOX.minLng || lng > SF_BBOX.maxLng) continue;

      const type = decode(tag(body, "LogType"));
      const location = decode(tag(body, "Location"));
      const details: { n: number; text: string }[] = [];
      for (const dm of body.matchAll(/<IncidentDetail>([\s\S]*?)<\/IncidentDetail>/g)) {
        const raw = decode(unquote(dm[1]));
        const nm = /^\[(\d+)\]\s*/.exec(raw);
        details.push({ n: nm ? Number(nm[1]) : 0, text: raw.replace(/^\[\d+\]\s*/, "").trim() });
      }
      const floodish =
        /^FLOOD/i.test(type) || FLOODISH.test(type) || FLOODISH.test(location) || details.some((x) => FLOODISH.test(x.text));
      if (!floodish) continue;

      const createdAt = parseChpTime(tag(body, "LogTime"));
      if (!createdAt) continue;
      const latest = details.reduce<{ n: number; text: string } | null>((b, x) => (!b || x.n > b.n ? x : b), null);
      const inc: RoadIncident = {
        id,
        type: type || "Roadway flooding",
        location,
        area: decode(tag(body, "Area")),
        createdAt,
        lng,
        lat,
        neighborhood: locate(lng, lat),
        url: CHP_INCIDENT_URL,
      };
      if (latest?.text) inc.latestDetail = latest.text;
      out.push(inc);
    }
  }
  return out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

let nhoodsCache: Promise<NhoodFeature[]> | null = null;
function loadNeighborhoods(): Promise<NhoodFeature[]> {
  nhoodsCache ??= readFile(path.join(process.cwd(), "public", "data", "neighborhoods.geojson"), "utf8")
    .then((t) => (JSON.parse(t) as { features: NhoodFeature[] }).features)
    .catch((e) => {
      nhoodsCache = null; // retry next time
      console.warn("[chp] neighborhoods unavailable:", String(e?.message ?? e));
      return [];
    });
  return nhoodsCache;
}

export async function fetchChpFlooding(): Promise<RoadIncident[]> {
  const res = await fetch(CHP_URL, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`CHP ${res.status}`);
  const [xml, nhoods] = await Promise.all([res.text(), loadNeighborhoods()]);
  return parseChpFlooding(xml, (lng, lat) => findNeighborhood(lng, lat, nhoods));
}
