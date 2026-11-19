"use client";

import { useEffect, useState } from "react";
import type { ConditionsPayload } from "./types";

const REFRESH_MS = 5 * 60_000;

/** Polls /api/conditions. Null until the first response (or if it fails). */
export function useConditions(): ConditionsPayload | null {
  const [data, setData] = useState<ConditionsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/conditions")
        .then((r) => (r.ok ? r.json() : null))
        .then((p: ConditionsPayload | null) => {
          if (!cancelled && p) setData(p);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return data;
}

interface RainViewerIndex {
  host: string;
  radar: { past: { time: number; path: string }[] };
}

/** Tile URL template for the latest RainViewer past radar frame (latest frame only, no animation). */
export function useRadarTileUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("https://api.rainviewer.com/public/weather-maps.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((j: RainViewerIndex | null) => {
          const last = j?.radar?.past?.at(-1);
          if (!cancelled && j && last) setUrl(`${j.host}${last.path}/256/{z}/{x}/{y}/2/1_1.png`);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return url;
}
