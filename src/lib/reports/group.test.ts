import test from "node:test";
import assert from "node:assert/strict";
// @ts-ignore TS5097: extension import is required at runtime by node --test
import { mergeIncidents } from "./group.ts";
import type { Report } from "../types";

const mk = (id: string, o: Partial<Report> = {}): Report => ({
  source: "x",
  summary: "s",
  severity: "med",
  neighborhood: "Haight Ashbury",
  crossStreet: null,
  locationEvidence: "text",
  lng: 0,
  lat: 0,
  approximate: true,
  id,
  url: `https://x.com/a/status/${id}`,
  createdAt: "2026-11-18T10:00:00Z",
  confidence: 0.5,
  isFirsthand: false,
  ...o,
});

test("groups by neighborhood+key and prefers firsthand", () => {
  const out = mergeIncidents([
    { report: mk("1", { confidence: 0.99, imageUrl: "i" }), incidentKey: "waymo-oak" },
    { report: mk("2", { isFirsthand: true }), incidentKey: "waymo-oak" },
    { report: mk("3"), incidentKey: "WAYMO-OAK " },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "2");
  assert.equal(out[0].alsoReportedBy, 2);
  assert.equal(out[0].relatedUrls?.length, 2);
});

test("then image, then confidence, then newest", () => {
  let out = mergeIncidents([
    { report: mk("1", { confidence: 0.9 }), incidentKey: "k" },
    { report: mk("2", { imageUrl: "i", confidence: 0.1 }), incidentKey: "k" },
  ]);
  assert.equal(out[0].id, "2");
  out = mergeIncidents([
    { report: mk("1", { confidence: 0.6 }), incidentKey: "k" },
    { report: mk("2", { confidence: 0.7 }), incidentKey: "k" },
  ]);
  assert.equal(out[0].id, "2");
  out = mergeIncidents([
    { report: mk("1"), incidentKey: "k" },
    { report: mk("2", { createdAt: "2026-11-18T11:00:00Z" }), incidentKey: "k" },
  ]);
  assert.equal(out[0].id, "2");
});

test("different neighborhood or missing key stays separate; relatedUrls capped at 3", () => {
  const out = mergeIncidents([
    { report: mk("1"), incidentKey: "k" },
    { report: mk("2", { neighborhood: "Mission" }), incidentKey: "k" },
    { report: mk("3"), incidentKey: null },
    { report: mk("4") },
  ]);
  assert.equal(out.length, 4);
  assert.equal(out[0].alsoReportedBy, undefined);
  const many = mergeIncidents(Array.from({ length: 7 }, (_, i) => ({ report: mk(String(i)), incidentKey: "k" })));
  assert.equal(many[0].alsoReportedBy, 6);
  assert.equal(many[0].relatedUrls?.length, 3);
});
