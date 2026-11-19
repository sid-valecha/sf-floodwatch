// Pure, explainable neighborhood risk scoring. No fetches, no Date.now (caller passes `now`).
// Wording: "risk" only; never "safe". A zero score is still "Low risk".
import type { Report } from "./types";
import type { RoadIncident } from "./conditions/types";

export interface NeighborhoodStats {
  sfpucPct: number;
  femaHighPct: number;
  femaModPct: number;
  centroid: [number, number];
  bbox: [number, number, number, number];
  coastal: boolean;
}
export interface RiskConditions {
  rainPeakChance: number | null;
  rainWindow: string | null;
  rainInchesNext6h: number | null;
  nextHighTide: { time: string; ft: number } | null;
  /** Active NWS alerts (county-wide for SF). Optional so older callers still compile. */
  alerts?: { event: string }[];
}
export interface RiskFactor {
  kind: "modeled" | "official" | "observed";
  label: string;
  points: number;
  detail: string;
}
export interface RiskResult {
  level: "Low" | "Moderate" | "High";
  score: number;
  factors: RiskFactor[];
  reportIds: string[];
}

const HOUR = 3600_000;
const SEVERITY_WEIGHT = { low: 0.5, med: 1, high: 2 } as const;

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTime(ms: number): string {
  const parts = timeFmt.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()}`;
}

function recency(ageMs: number): number {
  if (ageMs < 2 * HOUR) return 1;
  if (ageMs < 6 * HOUR) return 0.5;
  if (ageMs < 12 * HOUR) return 0.25;
  return 0;
}

const roundHalf = (n: number) => Math.round(n * 2) / 2;
const plural = (n: number) => `${n} report${n === 1 ? "" : "s"}`;

export function scoreNeighborhood(
  name: string,
  stats: NeighborhoodStats,
  cond: RiskConditions,
  reports: Report[],
  now: number,
  roadIncidents: RoadIncident[] = [],
): RiskResult {
  const factors: RiskFactor[] = [];

  // Storm flood zone (modeled)
  const s = stats.sfpucPct;
  factors.push({
    kind: "modeled",
    label: "Storm flood zone",
    points: s >= 15 ? 3 : s >= 5 ? 2 : s >= 1 ? 1 : 0,
    detail: `${Math.round(s * 10) / 10}% of area in SFPUC 100-yr storm risk zone`,
  });

  // Coastal flood zone (modeled)
  const h = stats.femaHighPct;
  factors.push({
    kind: "modeled",
    label: "Coastal flood zone",
    points: h >= 10 ? 2 : h > 0.5 ? 1 : 0,
    detail: `${Math.round(h * 10) / 10}% in FEMA high-risk coastal zone`,
  });

  // Rain (official)
  const inches = cond.rainInchesNext6h;
  const chance = cond.rainPeakChance;
  let rainPts = 0;
  if ((inches != null && inches >= 0.5) || (chance != null && chance >= 80)) rainPts = 2;
  else if ((inches != null && inches >= 0.2) || (chance != null && chance >= 50)) rainPts = 1;
  const rainBits: string[] = [];
  if (inches != null) rainBits.push(`${inches.toFixed(1)}" next 6h`);
  if (chance != null) rainBits.push(`${Math.round(chance)}% peak${cond.rainWindow ? ` ${cond.rainWindow}` : ""}`);
  factors.push({
    kind: "official",
    label: "Rain",
    points: rainPts,
    detail: rainBits.length ? rainBits.join(" · ") : "Rain forecast unavailable",
  });

  // Official NWS flood alert (county-wide, applies to every neighborhood)
  const floodAlerts = (cond.alerts ?? []).filter((a) => /flood/i.test(a.event));
  if (floodAlerts.length) {
    const warning = floodAlerts.find((a) => /warning/i.test(a.event));
    const top = warning ?? floodAlerts[0];
    factors.push({
      kind: "official",
      label: "NWS flood alert",
      points: warning ? 2 : 1,
      detail: `NWS ${top.event} in effect`,
    });
  }

  // Tide (official, coastal only)
  if (stats.coastal) {
    const tide = cond.nextHighTide;
    let tidePts = 0;
    let detail = "No high tide data";
    if (tide) {
      const t = Date.parse(tide.time);
      if (Number.isFinite(t)) {
        const within = t >= now && t - now <= 4 * HOUR;
        tidePts = within ? (tide.ft >= 6.0 ? 2 : 1) : 0;
        detail = `High tide ${tide.ft.toFixed(1)} ft at ${formatTime(t)}${within ? "" : " (not within 4h)"}`;
      }
    }
    factors.push({ kind: "official", label: "Tide", points: tidePts, detail });
  }

  // Reports (observed)
  const mine = reports.filter((r) => r.neighborhood === name);
  let sum = 0;
  const ids: string[] = [];
  let recent2h = 0;
  let recent12h = 0;
  let freshHigh = false;
  for (const r of mine) {
    const rawAge = now - Date.parse(r.createdAt);
    // >10 min in the future = invalid timestamp (no weight); small clock skew clamps to 0.
    if (!Number.isFinite(rawAge) || rawAge < -10 * 60_000) continue;
    const age = Math.max(0, rawAge);
    const rec = recency(age);
    if (rec === 0) continue;
    sum += (SEVERITY_WEIGHT[r.severity] ?? 1) * rec;
    ids.push(r.id);
    recent12h++;
    if (age < 2 * HOUR) {
      recent2h++;
      if (r.severity === "high") freshHigh = true;
    }
  }
  const repPts = roundHalf(Math.min(4, sum));
  factors.push({
    kind: "observed",
    label: "Reports",
    points: repPts,
    detail:
      recent12h === 0
        ? "No recent reports"
        : recent2h > 0
          ? `${plural(recent2h)} in last 2h`
          : `${plural(recent12h)} in last 12h`,
  });

  // CHP roadway flooding: <2h old, inside this neighborhood's bbox. +1 each, cap +2.
  // (bbox, not polygon: neighboring bboxes can overlap, so an incident near a border may count for both.)
  const [bw, bs, be, bn] = stats.bbox;
  const chpNear = roadIncidents.filter((i) => {
    const age = now - Date.parse(i.createdAt);
    return Number.isFinite(age) && age >= -10 * 60_000 && age < 2 * HOUR && i.lng >= bw && i.lng <= be && i.lat >= bs && i.lat <= bn;
  });
  if (chpNear.length) {
    factors.push({
      kind: "observed",
      label: "CHP roadway flooding",
      points: Math.min(2, chpNear.length),
      detail: "CHP roadway flooding report nearby",
    });
  }

  const score = factors.reduce((a, f) => a + f.points, 0);
  let level: RiskResult["level"] = score >= 6 ? "High" : score >= 3 ? "Moderate" : "Low";
  if (freshHigh && level === "Low") {
    level = "Moderate";
    factors.push({ kind: "observed", label: "Raised to Moderate", points: 0, detail: "Raised to Moderate: high-severity report <2h" });
  }
  return { level, score, factors, reportIds: ids };
}
