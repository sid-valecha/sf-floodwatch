// King tide outlook: NOAA hi/lo predictions (SF 9414290, MLLW) vs. the NWS minor coastal flood level.
// Pure helpers are unit-tested; fetchTideOutlook never throws.

export const TIDE_STATION = "9414290";
export const TIDE_STATION_URL = `https://tidesandcurrents.noaa.gov/stationhome.html?id=${TIDE_STATION}`;
/** Fallback if the NOAA flood level / datum lookups fail: 13.02 - 5.98 ft (STND -> MLLW). */
export const FALLBACK_MINOR_FLOOD_FT = 7.04;
export const OUTLOOK_DAYS = 10;
const NEAR_MARGIN_FT = 0.5;
const TIMEOUT_MS = 6000;
const API = "https://api.tidesandcurrents.noaa.gov";

export type TideLevel = "normal" | "near" | "above";
export interface TideHigh {
  time: string; // "HH:MM" 24h, SF local
  ft: number;
}
export interface TideDay {
  date: string; // YYYY-MM-DD, SF local
  highs: TideHigh[];
  peakFt: number;
  level: TideLevel;
}
export interface TideOutlook {
  days: TideDay[];
  minorFloodFt: number;
  failed: boolean;
}
export interface RawPrediction {
  t: string; // "YYYY-MM-DD HH:MM"
  v: string;
  type: string; // "H" | "L"
}

/** NWS thresholds are in station datum (STND); predictions are MLLW. */
export function stndToMllw(stndFt: number, mllwStndFt: number): number {
  return Math.round((stndFt - mllwStndFt) * 100) / 100;
}

export function levelFor(peakFt: number, minorFloodFt: number): TideLevel {
  if (peakFt >= minorFloodFt) return "above";
  if (peakFt >= minorFloodFt - NEAR_MARGIN_FT) return "near";
  return "normal";
}

/** Group high-tide predictions by SF local day. Days with no highs are omitted. */
export function buildOutlook(predictions: RawPrediction[], minorFloodFt: number): TideDay[] {
  const byDay = new Map<string, TideHigh[]>();
  for (const p of predictions) {
    if (p.type !== "H") continue;
    const ft = Number(p.v);
    const [date, time] = p.t.split(" ");
    if (!date || !time || !Number.isFinite(ft)) continue;
    const list = byDay.get(date) ?? [];
    list.push({ time, ft });
    byDay.set(date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, highs]) => {
      highs.sort((a, b) => (a.time < b.time ? -1 : 1));
      const peakFt = Math.max(...highs.map((h) => h.ft));
      return { date, highs, peakFt, level: levelFor(peakFt, minorFloodFt) };
    });
}

/** YYYYMMDD + n days -> YYYYMMDD (pure UTC calendar math). */
export function addDays(ymd: string, n: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + n));
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchMinorFloodFt(): Promise<number> {
  try {
    const base = `${API}/mdapi/prod/webapi/stations/${TIDE_STATION}`;
    const [fl, dt] = (await Promise.all([
      getJson(`${base}/floodlevels.json?units=english`),
      getJson(`${base}/datums.json?units=english`),
    ])) as [{ nws_minor?: number }, { datums?: { name: string; value: number }[] }];
    const mllw = dt.datums?.find((d) => d.name === "MLLW")?.value;
    if (typeof fl.nws_minor !== "number" || typeof mllw !== "number") return FALLBACK_MINOR_FLOOD_FT;
    return stndToMllw(fl.nws_minor, mllw);
  } catch {
    return FALLBACK_MINOR_FLOOD_FT;
  }
}

/** `today` is YYYYMMDD in Pacific time. Never throws. */
export async function fetchTideOutlook(today: string): Promise<TideOutlook> {
  const minorFloodFt = await fetchMinorFloodFt();
  try {
    const url =
      `${API}/api/prod/datagetter?product=predictions&station=${TIDE_STATION}` +
      `&begin_date=${today}&end_date=${addDays(today, OUTLOOK_DAYS - 1)}` +
      `&datum=MLLW&interval=hilo&units=english&time_zone=lst_ldt&format=json`;
    const j = (await getJson(url)) as { predictions?: RawPrediction[] };
    if (!Array.isArray(j.predictions) || j.predictions.length === 0) throw new Error("no predictions");
    return { days: buildOutlook(j.predictions, minorFloodFt), minorFloodFt, failed: false };
  } catch {
    return { days: [], minorFloodFt, failed: true };
  }
}
