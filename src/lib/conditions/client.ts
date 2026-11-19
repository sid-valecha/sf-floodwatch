"use client";

import { useEffect, useState } from "react";
import type { ConditionsPayload } from "./types";

const REFRESH_MS = 5 * 60_000;

/** Polls /api/conditions. data is null until the first success; failed is true while the latest attempt failed (retries in 30s). */
export function useConditions(): { data: ConditionsPayload | null; failed: boolean } {
  const [data, setData] = useState<ConditionsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let ok = false;
      try {
        const r = await fetch("/api/conditions");
        const p: ConditionsPayload | null = r.ok ? await r.json() : null;
        if (p && !cancelled) {
          setData(p);
          ok = true;
        }
      } catch {}
      if (cancelled) return;
      setFailed(!ok);
      timer = setTimeout(load, ok ? REFRESH_MS : 30_000);
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return { data, failed };
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
