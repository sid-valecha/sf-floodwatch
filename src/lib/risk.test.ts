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

test("fresh high-severity report raises Low to at least Moderate", () => {
  const r = scoreNeighborhood("Mission", base, noCond, [report("h", 1, "high")], NOW);
  assert.equal(r.score, 2);
  assert.equal(r.level, "Moderate");
  assert.match(r.factors.find((f) => f.label === "Raised to Moderate")!.detail, /high-severity report <2h/);
  const old = scoreNeighborhood("Mission", base, noCond, [report("o", 3, "high")], NOW);
  assert.equal(old.level, "Low");
  const med = scoreNeighborhood("Mission", base, noCond, [report("m", 1, "med")], NOW);
  assert.equal(med.level, "Low");
});

test("future timestamps: small skew clamps, >10 min is ignored", () => {
  assert.deepEqual(scoreNeighborhood("Mission", base, noCond, [report("f1", -0.1, "med")], NOW).reportIds, ["f1"]);
  assert.deepEqual(scoreNeighborhood("Mission", base, noCond, [report("f2", -0.5, "high")], NOW).reportIds, []);
});

test("NWS flood alerts add points to any neighborhood; non-flood alerts ignored", () => {
  const adv = scoreNeighborhood("Mission", base, { ...noCond, alerts: [{ event: "Coastal Flood Advisory" }] }, [], NOW);
  const f = adv.factors.find((x) => x.label === "NWS flood alert");
  assert.equal(f?.points, 1);
  assert.equal(f?.detail, "NWS Coastal Flood Advisory in effect");
  const warn = scoreNeighborhood("Mission", base, { ...noCond, alerts: [{ event: "Flood Advisory" }, { event: "Flash Flood Warning" }] }, [], NOW);
  assert.equal(warn.factors.find((x) => x.label === "NWS flood alert")?.points, 2);
  assert.equal(warn.score, 2);
  const none = scoreNeighborhood("Mission", base, { ...noCond, alerts: [{ event: "Wind Advisory" }] }, [], NOW);
  assert.equal(none.factors.find((x) => x.label === "NWS flood alert"), undefined);
  assert.equal(none.score, 0);
});

// ---- CHP roadway flooding ----
const chp = (id: string, ageH: number, neighborhood: string | null = "Mission") => ({
  id, type: "FLOOD-Roadway Flooding", location: "x", area: "San Francisco",
  createdAt: new Date(NOW - ageH * HOUR).toISOString(), lng: -122.4, lat: 37.77, neighborhood, url: "https://cad.chp.ca.gov/",
});

test("fresh CHP incident inside bbox adds +1 with reason", () => {
  const r = scoreNeighborhood("Mission", base, noCond, [], NOW, [chp("a", 0.5)]);
  const f = r.factors.find((x) => x.label === "CHP roadway flooding");
  assert.equal(f?.points, 1);
  assert.equal(f?.kind, "observed");
  assert.equal(f?.detail, "CHP roadway flooding report nearby");
  assert.equal(r.score, 1);
});

test("CHP contribution caps at +2", () => {
  const r = scoreNeighborhood("Mission", base, noCond, [], NOW, [chp("a", 0.1), chp("b", 0.2), chp("c", 0.3)]);
  assert.equal(r.factors.find((x) => x.label === "CHP roadway flooding")?.points, 2);
  assert.equal(r.score, 2);
});

test("CHP incident older than 2h or outside bbox is ignored", () => {
  const r = scoreNeighborhood("Mission", base, noCond, [], NOW, [chp("old", 2.5), chp("far", 0.5, "Sunset"), chp("none", 0.5, null)]);
  assert.equal(r.factors.some((x) => x.label === "CHP roadway flooding"), false);
  assert.equal(r.score, 0);
});
