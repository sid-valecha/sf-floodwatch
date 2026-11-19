export interface NwsAlert {
  event: string;
  headline: string | null;
  severity: string | null;
  ends: string | null;
  url: string;
}

export interface HourlyPoint {
  time: string; // ISO
  precipChance: number | null; // 0-100
  shortForecast: string;
}

export interface RainSummary {
  peakChance: number;
  peakTime: string | null;
  /** First and last hour in the next 6h with chance >= 30 */
  windowStart: string | null;
  windowEnd: string | null;
  text: string;
}

export interface TideInfo {
  stationId: string;
  stationName: string;
  waterLevelFt: number | null;
  waterLevelTime: string | null; // local PT "YYYY-MM-DD HH:MM"
  nextHigh: { time: string; heightFt: number } | null; // time ISO (UTC)
}

export type ConditionsSource = "nws-alerts" | "nws-forecast" | "noaa-water-level" | "noaa-predictions";

export interface ConditionsPayload {
  fetchedAt: string;
  alerts: NwsAlert[];
  alertsGeoJSON: GeoJSON.FeatureCollection;
  hourly: HourlyPoint[];
  rain: RainSummary | null;
  tide: TideInfo;
  failed: ConditionsSource[];
}
