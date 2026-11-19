// Freshness rules: full color <2h, faded 2–6h, dimmer 6–12h, hidden after the max age.
// X posts hide at 12h; news pins at 24h so this morning's incidents survive into the evening.
const HOUR = 3600_000;

export function ageMs(iso: string, now = Date.now()) {
  return Math.max(0, now - new Date(iso).getTime());
}

export function maxAgeMs(source: "x" | "news") {
  return (source === "news" ? 24 : 12) * HOUR;
}

export function freshnessOpacity(iso: string, now = Date.now()) {
  const a = ageMs(iso, now);
  if (a < 2 * HOUR) return 1;
  if (a < 6 * HOUR) return 0.55;
  return 0.3;
}

export function formatAge(iso: string, now = Date.now()) {
  const m = Math.round(ageMs(iso, now) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m ago` : `${Math.floor(h / 24)}d ago`;
}
