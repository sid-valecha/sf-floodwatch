// Shared types. Every item on the map belongs to exactly one information kind,
// and the UI keeps the three visually distinct.
export type InfoKind = "observed" | "official" | "modeled";

export type Severity = "low" | "med" | "high";

export type ReportSourceName = "x" | "news";

export type LocationEvidence = "text" | "image" | "both" | "neighborhood";

export interface Report {
  id: string;
  source: ReportSourceName;
  url: string;
  createdAt: string; // ISO
  author?: string;
  text?: string;
  summary: string;
  severity: Severity;
  neighborhood: string;
  crossStreet: string | null;
  locationEvidence: LocationEvidence;
  /** Grok's own words about how it located the post, e.g. "image: street sign" */
  locationDetail?: string;
  confidence: number; // 0-1
  isFirsthand: boolean;
  imageUrl?: string;
  lng: number;
  lat: number;
  /** true when the pin is placed at a neighborhood centroid, not a geocoded street */
  approximate: boolean;
}

export interface ReportsPayload {
  reports: Report[];
  mode: "live" | "snapshot";
  fetchedAt: string;
  note?: string;
}

export interface Hotspot {
  name: string;
  lng: number;
  lat: number;
  why: string;
}
