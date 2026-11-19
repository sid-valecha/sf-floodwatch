import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error TS5097: extension import is required at runtime by node --test
import { findNeighborhood, pointInGeometry } from "./geo.ts";

const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
const holed = [...square, [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]];
const multi = [square, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]];

test("point inside / outside a Polygon", () => {
  const g = { type: "Polygon", coordinates: square };
  assert.equal(pointInGeometry(5, 5, g), true);
  assert.equal(pointInGeometry(15, 5, g), false);
});

test("holes are excluded", () => {
  assert.equal(pointInGeometry(5, 5, { type: "Polygon", coordinates: holed }), false);
  assert.equal(pointInGeometry(2, 2, { type: "Polygon", coordinates: holed }), true);
});

test("point in second part of a MultiPolygon", () => {
  const g = { type: "MultiPolygon", coordinates: multi };
  assert.equal(pointInGeometry(25, 25, g), true);
  assert.equal(pointInGeometry(15, 15, g), false);
});

test("findNeighborhood returns the containing name or null", () => {
  const fs = [
    { properties: { nhood: "A" }, geometry: { type: "Polygon", coordinates: square } },
    { properties: { nhood: "B" }, geometry: { type: "MultiPolygon", coordinates: multi.slice(1) } },
  ];
  assert.equal(findNeighborhood(5, 5, fs), "A");
  assert.equal(findNeighborhood(25, 25, fs), "B");
  assert.equal(findNeighborhood(50, 50, fs), null);
});
