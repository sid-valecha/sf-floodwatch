import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error TS5097: extension import is required at runtime by node --test
import { addDays, buildOutlook, levelFor, stndToMllw } from "./tides.ts";

test("stndToMllw converts NWS minor (STND) to MLLW", () => {
  assert.equal(stndToMllw(13.02, 5.98), 7.04);
});

test("levelFor thresholds", () => {
  assert.equal(levelFor(7.04, 7.04), "above");
  assert.equal(levelFor(7.5, 7.04), "above");
  assert.equal(levelFor(6.6, 7.04), "near");
  assert.equal(levelFor(6.4, 7.04), "normal");
});

test("buildOutlook groups highs per day, ignores lows, picks peak and level", () => {
  const p = [
    { t: "2026-11-25 04:10", v: "0.5", type: "L" },
    { t: "2026-11-25 10:49", v: "7.029", type: "H" },
    { t: "2026-11-25 23:30", v: "5.2", type: "H" },
    { t: "2026-11-24 09:00", v: "6.7", type: "H" },
    { t: "2026-11-26 09:00", v: "bad", type: "H" },
    { t: "2026-11-27 09:00", v: "4.0", type: "H" },
  ];
  const d = buildOutlook(p, 7.04);
  assert.deepEqual(d.map((x: { date: string }) => x.date), ["2026-11-24", "2026-11-25", "2026-11-27"]);
  assert.equal(d[1].peakFt, 7.029);
  assert.equal(d[1].level, "near");
  assert.deepEqual(d[1].highs.map((h: { time: string }) => h.time), ["10:49", "23:30"]);
  assert.equal(d[0].level, "near");
  assert.equal(d[2].level, "normal");
  assert.equal(buildOutlook(p, 7.0)[1].level, "above");
});

test("addDays crosses month boundary", () => {
  assert.equal(addDays("20261125", 9), "20261204");
});
