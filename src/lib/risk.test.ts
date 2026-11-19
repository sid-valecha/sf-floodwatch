import test from "node:test";
import assert from "node:assert/strict";
// tsconfig lacks allowImportingTsExtensions, but Node's type stripping needs the .ts extension.
// @ts-ignore TS5097: extension import is required at runtime by node --test
import { scoreNeighborhood } from "./risk.ts";
import type { NeighborhoodStats, RiskConditions } from "./risk";
import type { Report } from "./types";

const NOW = Date.parse("2026-11-18T20:00:00-08:00");
const HOUR = 3600_000;

const base: NeighborhoodStats = {
  sfpucPct: 0, femaHighPct: 0, femaModPct: 0,
  centroid: [-122.4, 37.77], bbox: [-122.41, 37.76, -122.39, 37.78], coastal: false,
};
const noCond: RiskConditions = { rainPeakChance: null, rainWindow: null, rainInchesNext6h: null, nextHighTide: null };

function report(id: string, ageH: number, severity: Report["severity"], neighborhood = "Mission"): Report {
  return {
    id, source: "x", url: "https://x.com/a/status/" + id, createdAt: new Date(NOW - ageH * HOUR).toISOString(),
    summary: "s", severity, neighborhood, crossStreet: null, locationEvidence: "text",
    confidence: 0.9, isFirsthand: true, lng: -122.4, lat: 37.77, approximate: true,
  };
}

test("zero inputs give Low with all non-tide factors present", () => {
  const r = scoreNeighborhood("Mission", base, noCond, [], NOW);
  assert.equal(r.level, "Low");
  assert.equal(r.score, 0);
  assert.deepEqual(r.factors.map((f) => f.label), ["Storm flood zone", "Coastal flood zone", "Rain", "Reports"]);
  assert.ok(r.factors.every((f) => f.points === 0));
  assert.equal(r.factors.find((f) => f.label === "Rain")?.detail, "Rain forecast unavailable");
  assert.deepEqual(r.reportIds, []);
});

test("tide counts only for coastal neighborhoods", () => {
  const cond = { ...noCond, nextHighTide: { time: new Date(NOW + 1.5 * HOUR).toISOString(), ft: 6.5 } };
  const coastal = scoreNeighborhood("Marina", { ...base, coastal: true }, cond, [], NOW);
  const inland = scoreNeighborhood("Mission", base, cond, [], NOW);
  assert.equal(coastal.factors.find((f) => f.label === "Tide")?.points, 2);
  assert.match(coastal.factors.find((f) => f.label === "Tide")!.detail, /^High tide 6\.5 ft at \d{1,2}:\d{2}[ap]m$/);
  assert.equal(inland.factors.find((f) => f.label === "Tide"), undefined);
  assert.equal(inland.score, 0);
  const far = { ...noCond, nextHighTide: { time: new Date(NOW + 5 * HOUR).toISOString(), ft: 6.5 } };
  assert.equal(scoreNeighborhood("Marina", { ...base, coastal: true }, far, [], NOW).factors.find((f) => f.label === "Tide")?.points, 0);
  const lowTide = { ...noCond, nextHighTide: { time: new Date(NOW + HOUR).toISOString(), ft: 5.2 } };
  assert.equal(scoreNeighborhood("Marina", { ...base, coastal: true }, lowTide, [], NOW).factors.find((f) => f.label === "Tide")?.points, 1);
});

test("report recency weighting and name filtering", () => {
  const rs = [report("a", 1, "high"), report("b", 3, "high"), report("c", 8, "high"), report("d", 13, "high"), report("e", 1, "high", "SoMa")];
  const r = scoreNeighborhood("Mission", base, noCond, rs, NOW);
  // 2*1 + 2*.5 + 2*.25 = 3.5
  assert.equal(r.factors.find((f) => f.label === "Reports")?.points, 3.5);
  assert.deepEqual(r.reportIds, ["a", "b", "c"]);
  const many = Array.from({ length: 6 }, (_, i) => report("m" + i, 0.5, "high"));
  assert.equal(scoreNeighborhood("Mission", base, noCond, many, NOW).factors.find((f) => f.label === "Reports")?.points, 4);
  const one = scoreNeighborhood("Mission", base, noCond, [report("z", 0.5, "low")], NOW);
  assert.equal(one.factors.find((f) => f.label === "Reports")?.points, 0.5);
  assert.equal(one.factors.find((f) => f.label === "Reports")?.detail, "1 report in last 2h");
});

test("zone and rain points, and level thresholds", () => {
  assert.equal(scoreNeighborhood("X", { ...base, sfpucPct: 15 }, noCond, [], NOW).factors[0].points, 3);
  assert.equal(scoreNeighborhood("X", { ...base, sfpucPct: 5 }, noCond, [], NOW).factors[0].points, 2);
  assert.equal(scoreNeighborhood("X", { ...base, sfpucPct: 1 }, noCond, [], NOW).factors[0].points, 1);
  assert.equal(scoreNeighborhood("X", { ...base, femaHighPct: 10 }, noCond, [], NOW).factors[1].points, 2);
  assert.equal(scoreNeighborhood("X", { ...base, femaHighPct: 0.6 }, noCond, [], NOW).factors[1].points, 1);
  const wet: RiskConditions = { ...noCond, rainInchesNext6h: 0.3, rainPeakChance: 80, rainWindow: "7-9pm" };
  const rain = scoreNeighborhood("X", base, wet, [], NOW);
  assert.equal(rain.factors[2].points, 2);
  assert.equal(rain.factors[2].detail, '0.3" next 6h · 80% peak 7-9pm');

  const mod = scoreNeighborhood("X", { ...base, sfpucPct: 15 }, noCond, [], NOW); // 3
  assert.equal(mod.level, "Moderate");
  const low = scoreNeighborhood("X", { ...base, sfpucPct: 5 }, noCond, [], NOW); // 2
  assert.equal(low.level, "Low");
  const high = scoreNeighborhood("X", { ...base, sfpucPct: 15, femaHighPct: 10, coastal: true }, wet, [], NOW);
  assert.equal(high.score, 3 + 2 + 2);
  assert.equal(high.level, "High");
  assert.equal(scoreNeighborhood("X", { ...base, sfpucPct: 15 }, { ...noCond, rainPeakChance: 85 }, [], NOW).level, "Moderate"); // 5
  assert.equal(scoreNeighborhood("X", { ...base, sfpucPct: 15 }, { ...noCond, rainPeakChance: 85 }, [report("q", 1, "high", "X")], NOW).level, "High"); // 7
});
