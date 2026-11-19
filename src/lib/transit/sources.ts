// Transit agencies as a small list so adding Los Angeles (or 511 parsing) later touches one place.
import type { TransitAlert } from "./bart";

export interface TransitSource {
  id: string;
  /** Label shown in the "coming soon" line. */
  label: string;
  /** Env var that must be set for the source to run; omitted = no token needed. */
  tokenEnv?: string;
  /** True once a parser exists. 511 parsers are intentionally not written yet. */
  implemented: boolean;
}

export const TRANSIT_SOURCES: TransitSource[] = [
  { id: "bart", label: "BART", implemented: true },
  { id: "511-SF", label: "Muni", tokenEnv: "API_511_TOKEN", implemented: false },
  { id: "511-CT", label: "Caltrain", tokenEnv: "API_511_TOKEN", implemented: false },
  { id: "511-GF", label: "Ferries", tokenEnv: "API_511_TOKEN", implemented: false }, // Golden Gate Ferry
  { id: "511-SB", label: "Ferries", tokenEnv: "API_511_TOKEN", implemented: false }, // SF Bay Ferry
];

/** Labels of sources that are skipped (no token, or no parser yet), de-duplicated in list order. */
export function pendingLabels(env: Record<string, string | undefined> = process.env): string[] {
  const out: string[] = [];
  for (const s of TRANSIT_SOURCES) {
    const active = s.implemented && (!s.tokenEnv || !!env[s.tokenEnv]);
    if (!active && !out.includes(s.label)) out.push(s.label);
  }
  return out;
}

export interface TransitPayload {
  alerts: TransitAlert[];
  fetchedAt: string;
  failed: string[];
  pending: string[];
}
