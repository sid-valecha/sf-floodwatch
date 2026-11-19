// Same-incident merging: many posts about one physical event become one pin.
import type { Report } from "../types";

export const MAX_RELATED = 3;

/** Higher is better: firsthand, then has image, then confidence, then newest. */
function better(a: Report, b: Report): boolean {
  if (a.isFirsthand !== b.isFirsthand) return a.isFirsthand;
  if (!!a.imageUrl !== !!b.imageUrl) return !!a.imageUrl;
  if (a.confidence !== b.confidence) return a.confidence > b.confidence;
  return Date.parse(a.createdAt) > Date.parse(b.createdAt);
}

const norm = (k: string | null | undefined) => (k ?? "").trim().toLowerCase();

/**
 * Groups by neighborhood + incident key (reports without a key stay alone) and keeps one report per group.
 * The kept report gets alsoReportedBy (group size - 1) and relatedUrls (up to 3 other post URLs).
 */
export function mergeIncidents(items: { report: Report; incidentKey?: string | null }[]): Report[] {
  const groups = new Map<string, { report: Report }[]>();
  items.forEach((it, i) => {
    const k = norm(it.incidentKey);
    const gk = k ? `${it.report.neighborhood}\u0000${k}` : `\u0001solo-${i}`;
    const g = groups.get(gk);
    if (g) g.push(it);
    else groups.set(gk, [it]);
  });
  const out: Report[] = [];
  for (const g of groups.values()) {
    let best = g[0].report;
    for (const it of g) if (better(it.report, best)) best = it.report;
    if (g.length === 1) {
      out.push(best);
      continue;
    }
    const related = g
      .map((it) => it.report)
      .filter((r) => r !== best && r.url !== best.url)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((r) => r.url)
      .slice(0, MAX_RELATED);
    let imageUrl = best.imageUrl;
    if (!imageUrl) {
      // Winner has no photo: borrow the newest group member's photo (never overwrite its own).
      const withImg = g
        .map((it) => it.report)
        .filter((r) => r.imageUrl)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
      imageUrl = withImg?.imageUrl;
    }
    out.push({ ...best, ...(imageUrl ? { imageUrl } : {}), alsoReportedBy: g.length - 1, relatedUrls: related });
  }
  return out;
}
