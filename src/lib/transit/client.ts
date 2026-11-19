"use client";

import { useEffect, useState } from "react";
import type { TransitPayload } from "./sources";

const REFRESH_MS = 2 * 60_000;

/** Polls /api/transit. data is null until the first success; failed is true while the latest attempt failed (retries in 30s). */
export function useTransit(): { data: TransitPayload | null; failed: boolean } {
  const [data, setData] = useState<TransitPayload | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let ok = false;
      try {
        const r = await fetch("/api/transit");
        const p: TransitPayload | null = r.ok ? await r.json() : null;
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
