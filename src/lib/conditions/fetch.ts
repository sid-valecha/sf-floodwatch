import type {
  ConditionsPayload,
  ConditionsSource,
  HourlyPoint,
  NwsAlert,
  RainSummary,
  TideInfo,
} from "./types";

const UA = "SF Flood Watch (contact: valechasiddharth@gmail.com)";
const POINT = "37.7749,-122.4194";
const STATION = "9414290";
const TIMEOUT_MS = 6000;

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/geo+json, application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${url.split("?")[0]}`);
  return (await res.json()) as T;
}

type AlertFeature = GeoJSON.Feature<GeoJSON.Geometry | null, Record<string, unknown>>;

async function fetchAlerts() {
  const data = await getJSON<{ features: AlertFeature[] }>(
    `https://api.weather.gov/alerts/active?point=${POINT}`,
  );
  const alerts: NwsAlert[] = data.features.map((f) => {
    const p = f.properties;
    return {
      event: String(p.event ?? "Alert"),
      headline: (p.headline as string) ?? null,
      severity: (p.severity as string) ?? null,
      ends: ((p.ends ?? p.expires) as string) ?? null,
      url: "https://forecast.weather.gov/MapClick.php?lat=37.7749&lon=-122.4194",
    };
  });
  const features = data.features
    .filter((f) => f.geometry)
    .map((f) => ({
      type: "Feature" as const,
      geometry: f.geometry as GeoJSON.Geometry,
      properties: { event: f.properties.event, headline: f.properties.headline, severity: f.properties.severity },
    }));
  return { alerts, alertsGeoJSON: { type: "FeatureCollection", features } as GeoJSON.FeatureCollection };
}

interface Period {
  startTime: string;
  endTime: string;
  shortForecast: string;
  probabilityOfPrecipitation?: { value: number | null };
}

async function fetchHourly(): Promise<HourlyPoint[]> {
  const pt = await getJSON<{ properties: { forecastHourly: string } }>(`https://api.weather.gov/points/${POINT}`);
  const fc = await getJSON<{ properties: { periods: Period[] } }>(pt.properties.forecastHourly);
  const now = Date.now();
  return fc.properties.periods
    .filter((p) => Date.parse(p.endTime) > now)
    .slice(0, 6)
    .map((p) => ({
      time: p.startTime,
      precipChance: p.probabilityOfPrecipitation?.value ?? null,
      shortForecast: p.shortForecast,
    }));
}

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", timeZone: "America/Los_Angeles" });
}

export function summarizeRain(hourly: HourlyPoint[]): RainSummary | null {
  if (!hourly.length) return null;
  let peak = hourly[0];
  for (const h of hourly) if ((h.precipChance ?? 0) > (peak.precipChance ?? 0)) peak = h;
  const peakChance = peak.precipChance ?? 0;
  const wet = hourly.filter((h) => (h.precipChance ?? 0) >= 30);
  const windowStart = wet[0]?.time ?? null;
  const windowEnd = wet.length ? wet[wet.length - 1].time : null;
  let text: string;
  if (!wet.length) text = `Rain risk low next 6h (peak ${peakChance}%)`;
  else if (windowStart === windowEnd) text = `Rain ${peakChance}% around ${hourLabel(windowStart!)}`;
  else text = `Rain peak ${peakChance}%, ${hourLabel(windowStart!)}–${hourLabel(windowEnd!)}`;
  return { peakChance, peakTime: peak.time, windowStart, windowEnd, text };
}

async function fetchWaterLevel() {
  const d = await getJSON<{ metadata?: { name: string }; data?: { t: string; v: string }[]; error?: { message: string } }>(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_level&date=latest&datum=MLLW&units=english&time_zone=lst_ldt&station=${STATION}&format=json&application=sf-floodwatch`,
  );
  const row = d.data?.[0];
  if (!row) throw new Error(d.error?.message ?? "no water level data");
  return { name: d.metadata?.name ?? "San Francisco", level: Number(row.v), time: row.t };
}

async function fetchNextHigh() {
  const d = await getJSON<{ predictions?: { t: string; v: string; type: string }[]; error?: { message: string } }>(
    `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&interval=hilo&begin_date=${new Date().toISOString().slice(0, 10).replace(/-/g, "")}&range=48&datum=MLLW&units=english&time_zone=gmt&station=${STATION}&format=json&application=sf-floodwatch`,
  );
  if (!d.predictions) throw new Error(d.error?.message ?? "no predictions");
  const now = Date.now();
  for (const p of d.predictions) {
    const iso = p.t.replace(" ", "T") + ":00Z"; // gmt timestamps
    if (p.type === "H" && Date.parse(iso) > now) return { time: iso, heightFt: Number(p.v) };
  }
  return null;
}

export async function getConditions(): Promise<ConditionsPayload> {
  const [a, h, w, n] = await Promise.allSettled([fetchAlerts(), fetchHourly(), fetchWaterLevel(), fetchNextHigh()]);
  const failed: ConditionsSource[] = [];
  if (a.status === "rejected") failed.push("nws-alerts");
  if (h.status === "rejected") failed.push("nws-forecast");
  if (w.status === "rejected") failed.push("noaa-water-level");
  if (n.status === "rejected") failed.push("noaa-predictions");
  for (const r of [a, h, w, n]) {
    if (r.status === "rejected") console.warn("[conditions] upstream failed:", String(r.reason?.message ?? r.reason));
  }

  const hourly = h.status === "fulfilled" ? h.value : [];
  const tide: TideInfo = {
    stationId: STATION,
    stationName: w.status === "fulfilled" ? w.value.name : "San Francisco",
    waterLevelFt: w.status === "fulfilled" ? w.value.level : null,
    waterLevelTime: w.status === "fulfilled" ? w.value.time : null,
    nextHigh: n.status === "fulfilled" ? n.value : null,
  };
  return {
    fetchedAt: new Date().toISOString(),
    alerts: a.status === "fulfilled" ? a.value.alerts : [],
    alertsGeoJSON: a.status === "fulfilled" ? a.value.alertsGeoJSON : { type: "FeatureCollection", features: [] },
    hourly,
    rain: summarizeRain(hourly),
    tide,
    failed,
  };
}
