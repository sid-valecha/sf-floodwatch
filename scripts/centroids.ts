// Generates src/lib/reports/centroids.json (nhood -> [lng, lat]) from the neighborhoods geojson.
// Area-weighted centroid of each neighborhood's largest polygon. Run: npx tsx scripts/centroids.ts
import { readFileSync, writeFileSync } from "node:fs";

type Ring = number[][];
const gj = JSON.parse(readFileSync("public/data/neighborhoods.geojson", "utf8"));

function ringCentroid(ring: Ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  return { area: Math.abs(a), c: [cx / (6 * a), cy / (6 * a)] as [number, number] };
}

const out: Record<string, [number, number]> = {};
for (const f of gj.features) {
  const polys: Ring[][] = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let best = { area: -1, c: [0, 0] as [number, number] };
  for (const p of polys) {
    const r = ringCentroid(p[0]);
    if (r.area > best.area) best = r;
  }
  out[f.properties.nhood] = [Number(best.c[0].toFixed(5)), Number(best.c[1].toFixed(5))];
}
writeFileSync("src/lib/reports/centroids.json", JSON.stringify(out, null, 1) + "\n");
console.log(`wrote ${Object.keys(out).length} centroids`);
