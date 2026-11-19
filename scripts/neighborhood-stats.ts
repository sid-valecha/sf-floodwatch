// Precompute per-neighborhood flood-zone coverage by grid sampling (~40 m).
// Run: node --experimental-strip-types scripts/neighborhood-stats.ts
import { readFileSync, writeFileSync } from "node:fs";

type Ring = number[][];
type Poly = Ring[]; // outer ring + holes
interface Prepared { poly: Poly; bbox: [number, number, number, number] }
interface Feature { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }

// Copied from src/lib/hotspots.ts (kept in sync by hand so this script has no src imports).
const HOTSPOTS: [number, number][] = [
  [-122.3937, 37.7955],
  [-122.4177, 37.808],
  [-122.44, 37.8065],
  [-122.465, 37.804],
  [-122.388, 37.7465],
];

function load(path: string): Feature[] {
  return JSON.parse(readFileSync(path, "utf8")).features as Feature[];
}

function polysOf(f: Feature): Poly[] {
  if (f.geometry.type === "Polygon") return [f.geometry.coordinates as Poly];
  if (f.geometry.type === "MultiPolygon") return f.geometry.coordinates as Poly[];
  return [];
}

function prepare(polys: Poly[]): Prepared[] {
  return polys.map((poly) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { poly, bbox: [minX, minY, maxX, maxY] };
  });
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inPrepared(x: number, y: number, ps: Prepared[]): boolean {
  for (const p of ps) {
    const [minX, minY, maxX, maxY] = p.bbox;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    if (!inRing(x, y, p.poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < p.poly.length; h++) {
      if (inRing(x, y, p.poly[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

const hoods = load("public/data/neighborhoods.geojson");
const sfpuc = prepare(load("public/data/sfpuc-100yr.geojson").flatMap(polysOf));
const fema = load("public/data/fema-flood.geojson");
const femaHigh = prepare(fema.filter((f) => f.properties.risk === "high").flatMap(polysOf));
const femaMod = prepare(fema.filter((f) => f.properties.risk === "moderate").flatMap(polysOf));

const SPACING_M = 40;
const out: Record<string, unknown> = {};
const rows: Record<string, unknown>[] = [];

for (const f of hoods) {
  const name = String(f.properties.nhood);
  const nh = prepare(polysOf(f));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of nh) {
    minX = Math.min(minX, p.bbox[0]); minY = Math.min(minY, p.bbox[1]);
    maxX = Math.max(maxX, p.bbox[2]); maxY = Math.max(maxY, p.bbox[3]);
  }
  const midLat = (minY + maxY) / 2;
  const dLat = SPACING_M / 111320;
  const dLng = SPACING_M / (111320 * Math.cos((midLat * Math.PI) / 180));
  let n = 0, nS = 0, nH = 0, nM = 0, sx = 0, sy = 0;
  for (let y = minY + dLat / 2; y < maxY; y += dLat) {
    for (let x = minX + dLng / 2; x < maxX; x += dLng) {
      if (!inPrepared(x, y, nh)) continue;
      n++; sx += x; sy += y;
      if (inPrepared(x, y, sfpuc)) nS++;
      if (inPrepared(x, y, femaHigh)) nH++;
      if (inPrepared(x, y, femaMod)) nM++;
    }
  }
  // Tiny neighborhoods can miss the grid entirely; fall back to the mean of the outer ring vertices.
  let centroid: [number, number];
  if (n > 0) centroid = [r5(sx / n), r5(sy / n)];
  else {
    const ring = nh[0].poly[0];
    centroid = [r5(ring.reduce((a, c) => a + c[0], 0) / ring.length), r5(ring.reduce((a, c) => a + c[1], 0) / ring.length)];
  }
  const pct = (k: number) => (n ? r1((k / n) * 100) : 0);
  const femaHighPct = pct(nH);
  const hotspotIn = HOTSPOTS.some(([x, y]) => inPrepared(x, y, nh));
  const coastal = femaHighPct > 0.5 || hotspotIn;
  out[name] = {
    sfpucPct: pct(nS), femaHighPct, femaModPct: pct(nM), centroid,
    bbox: [r5(minX), r5(minY), r5(maxX), r5(maxY)], coastal,
  };
  rows.push({ nhood: name, samples: n, sfpucPct: pct(nS), femaHighPct, femaModPct: pct(nM), coastal, hotspot: hotspotIn });
}

writeFileSync("public/data/neighborhood-stats.json", JSON.stringify(out, null, 1) + "\n");
console.table(rows);
console.log(`${Object.keys(out).length} neighborhoods written`);
