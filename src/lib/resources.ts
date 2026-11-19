// OFFICIAL resources, sourced from sf.gov / sfpuc.gov (https://www.sf.gov/urban-flooding).

export const SANDBAG_SOURCE = "https://www.sf.gov/urban-flooding";
export const SANDBAG_RULES = "Up to 10 bags per address, while supplies last. Proof of SF residence or business required.";

export interface SandbagSite {
  id: string;
  name: string;
  location: string;
  /**
   * Coordinates are hardcoded. Nominatim returned no result for these intersection queries
   * (it rarely resolves "X & Y" cross streets), so they are placed by hand from the cross
   * streets and sanity-checked against the expected neighborhood (Kansas & Marin is the
   * given reference point, -122.4036, 37.7486). Treat as approximate to ~100 m.
   */
  lng: number;
  lat: number;
  hours: string;
  notes?: string;
  /** Pin is a hand-placed estimate; the location text is the authority. */
  approxPin?: boolean;
  /** Recurring weekly hours (days: 0=Sun..6=Sat, PT). */
  schedule?: { days: number[]; from: string; to: string };
  /** One-day event (PT date, YYYY-MM-DD). */
  event?: { date: string; from: string; to: string };
}

export const SANDBAG_SITES: SandbagSite[] = [
  {
    id: "public-works-yard",
    name: "Public Works Operations Yard",
    location: "Enter at Kansas & Marin St",
    lng: -122.4036,
    lat: 37.7486,
    hours: "Mon–Sat 8am–2pm, year-round",
    notes: "Self-loading.",
    schedule: { days: [1, 2, 3, 4, 5, 6], from: "08:00", to: "14:00" },
  },
  {
    id: "marina-green",
    approxPin: true,
    name: "Marina Green Triangle",
    location: "Marina Blvd at Marina Green Dr",
    lng: -122.4358,
    lat: 37.8066,
    hours: "Sat Nov 21, 2026, 8am–2pm",
    event: { date: "2026-11-21", from: "08:00", to: "14:00" },
  },
  {
    id: "ocean-beach",
    approxPin: true,
    name: "Ocean Beach Parking Lot",
    location: "Great Highway at Balboa St (Stairwells 4–7)",
    lng: -122.5103,
    lat: 37.7752,
    hours: "Sat Nov 21, 2026, 8am–2pm",
    event: { date: "2026-11-21", from: "08:00", to: "14:00" },
  },
  {
    id: "sherman-st",
    approxPin: true,
    name: "Sherman St",
    location: "Between Folsom & Harrison",
    lng: -122.4089,
    lat: 37.7745,
    hours: "Sat Dec 5, 2026, 8am–2pm",
    event: { date: "2026-12-05", from: "08:00", to: "14:00" },
  },
  {
    id: "fire-training",
    approxPin: true,
    name: "SF Fire Training Center",
    location: "19th & Folsom",
    lng: -122.4145,
    lat: 37.76,
    hours: "Sat Dec 5, 2026, 8am–2pm",
    event: { date: "2026-12-05", from: "08:00", to: "14:00" },
  },
];

export const REPORT_FLOODING = {
  phone: "311",
  phoneOutsideSF: "415-701-2311",
  web: "https://sf311.org",
  page: "https://www.sf.gov/report-flooding-water-leaks-sewer-backup-or-odor-issues",
  pageTitle: "Report flooding, water leaks, sewer backup, or odor issues",
  emergency: "911",
};

export const ALERTSF = {
  text: "Text your ZIP code to 888-777",
  sms: "sms:888777",
  web: "https://www.alertsf.org/",
};
export const ADOPT_A_DRAIN = "https://adoptadrain.sfwater.org/";
export const SFPUC_FLOOD_MAP =
  "https://gis.sfpuc.org/portal/apps/instant/basic/index.html?appid=5dbe439cb71f42c89de0e2af110ae1f0";
export const HAZARD_DASHBOARD = "https://www.arcgis.com/apps/dashboards/9b14420bdefc427981b1c244f0113328";
export const FLOODWATER_GRANT = "https://www.sfpuc.gov/programs/grants/floodwater-grant-program";
/** King tide window (PT dates, inclusive). KING_TIDES_NOTE below is the human text for the same window. */
export const KING_TIDE_START = "2026-11-23";
export const KING_TIDE_END = "2026-11-27";
export const KING_TIDES_NOTE = "King tides expected Nov 23–27 (NOAA via SFPUC)";

// ---- Sandbag status (pure; pass `now` from state, never Date.now() in render) ----

export interface SandbagStatus {
  label: string;
  open: boolean;
  /** false once a one-day event has ended. */
  upcoming: boolean;
}

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ptFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function ptParts(ms: number) {
  const p: Record<string, string> = {};
  for (const x of ptFmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    dow: DAY.indexOf(p.weekday),
    min: Number(p.hour) * 60 + Number(p.minute),
  };
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
function clock(hhmm: string) {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : ":" + m}${h < 12 ? "am" : "pm"}`;
}

export function sandbagStatus(site: SandbagSite, nowMs: number): SandbagStatus {
  const t = ptParts(nowMs);
  if (site.schedule) {
    const { days, from, to } = site.schedule;
    const isDay = days.includes(t.dow);
    if (isDay && t.min >= toMin(from) && t.min < toMin(to))
      return { label: `Open now · until ${clock(to)}`, open: true, upcoming: true };
    if (isDay && t.min < toMin(from)) return { label: `Opens today ${clock(from)}`, open: false, upcoming: true };
    let next = -1;
    for (let i = 1; i <= 7; i++) {
      if (days.includes((t.dow + i) % 7)) {
        next = (t.dow + i) % 7;
        break;
      }
    }
    const opens = next >= 0 ? `Opens ${DAY[next]} ${clock(from)}` : "";
    return { label: isDay ? `Closed for today · ${opens}` : `Closed today · ${opens}`, open: false, upcoming: true };
  }
  const ev = site.event!;
  const [, mo, d] = ev.date.split("-");
  const dateLabel = `${DAY[new Date(`${ev.date}T12:00:00Z`).getUTCDay()]} ${MONTH[Number(mo) - 1]} ${Number(d)}`;
  if (t.ymd > ev.date || (t.ymd === ev.date && t.min >= toMin(ev.to)))
    return { label: "Ended", open: false, upcoming: false };
  if (t.ymd === ev.date) {
    if (t.min >= toMin(ev.from)) return { label: `Open now · until ${clock(ev.to)}`, open: true, upcoming: true };
    return { label: `Opens today ${clock(ev.from)}`, open: false, upcoming: true };
  }
  return { label: `${dateLabel}, ${clock(ev.from)}–${clock(ev.to)}`, open: false, upcoming: true };
}

export interface SandbagView extends SandbagSite {
  status: SandbagStatus;
}
