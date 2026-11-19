// Tiny point-in-polygon helpers (ray casting). Coordinates are [lng, lat].
type Ring = number[][];

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon = [outer, ...holes]. */
function inPolygon(x: number, y: number, poly: Ring[]): boolean {
  if (!poly.length || !inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}

export function pointInGeometry(lng: number, lat: number, g: { type: string; coordinates: unknown }): boolean {
  if (g.type === "Polygon") return inPolygon(lng, lat, g.coordinates as Ring[]);
  if (g.type === "MultiPolygon") return (g.coordinates as Ring[][]).some((p) => inPolygon(lng, lat, p));
  return false;
}

export interface NhoodFeature {
  properties: { nhood?: string } | null;
  geometry: { type: string; coordinates: unknown };
}

/** Name of the first neighborhood feature containing the point, else null. */
export function findNeighborhood(lng: number, lat: number, features: NhoodFeature[]): string | null {
  for (const f of features) {
    if (f.properties?.nhood && pointInGeometry(lng, lat, f.geometry)) return f.properties.nhood;
  }
  return null;
}
