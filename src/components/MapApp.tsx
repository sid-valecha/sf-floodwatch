"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { LayerKey, LayerVisibility } from "./FloodMap";
import { ReportSheet } from "./ReportSheet";
import { ConditionsBanner } from "./ConditionsBanner";
import { useConditions, useRadarTileUrl } from "@/lib/conditions/client";
import { ageMs, maxAgeMs } from "@/lib/freshness";
import type { Report, ReportsPayload } from "@/lib/types";

const FloodMap = dynamic(() => import("./FloodMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#0b0f17]" />,
});

const TOGGLES: { key: LayerKey; label: string; kind: "observed" | "official" | "modeled" }[] = [
  { key: "reports", label: "Live reports", kind: "observed" },
  { key: "alerts", label: "NWS alerts", kind: "official" },
  { key: "radar", label: "Rain radar", kind: "official" },
  { key: "sfpuc", label: "Storm flood risk (SFPUC)", kind: "modeled" },
  { key: "fema", label: "Coastal flood risk (FEMA)", kind: "modeled" },
  { key: "hotspots", label: "Coastal hotspots", kind: "modeled" },
];

const KIND_STYLE = {
  observed: "bg-rose-500",
  official: "bg-amber-400",
  modeled: "bg-sky-400",
};

export default function MapApp() {
  const [visibility, setVisibility] = useState<LayerVisibility>({
    reports: true,
    alerts: true,
    radar: true,
    sfpuc: true,
    fema: true,
    hotspots: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [selected, setSelected] = useState<Report | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/reports")
        .then((r) => (r.ok ? r.json() : null))
        .then((p: ReportsPayload | null) => {
          if (cancelled || !p) return;
          // Hide stale reports (12h for X, 24h for news); freshness fade happens in the map.
          const now = Date.now();
          setPayload({ ...p, reports: p.reports.filter((r) => ageMs(r.createdAt, now) < maxAgeMs(r.source)) });
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const conditions = useConditions();
  const radarTileUrl = useRadarTileUrl();
  const reports = useMemo(() => payload?.reports ?? [], [payload]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0b0f17] text-slate-100">
      <FloodMap
        visibility={visibility}
        reports={reports}
        radarTileUrl={radarTileUrl}
        alertsGeoJSON={conditions?.alertsGeoJSON ?? null}
        onSelectReport={setSelected}
        onSelectNeighborhood={() => {}}
      />

      {/* Title */}
      <header className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-2 shadow-lg ring-1 ring-white/10 backdrop-blur">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
          </span>
          <h1 className="text-sm font-semibold tracking-tight">SF Flood Watch</h1>
          {payload?.mode === "snapshot" && (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
              snapshot
            </span>
          )}
        </div>
        <div className="pointer-events-auto mt-2 w-[min(24rem,calc(100vw-1.5rem))]">
          <ConditionsBanner data={conditions} />
        </div>
      </header>

      {/* Layer toggles */}
      <div className="absolute right-3 top-[max(env(safe-area-inset-top),0.75rem)] flex flex-col items-end gap-2">
        <button
          onClick={() => setLayersOpen((o) => !o)}
          className="rounded-xl bg-slate-950/80 px-3 py-2 text-xs font-medium shadow-lg ring-1 ring-white/10 backdrop-blur"
        >
          Layers {layersOpen ? "▴" : "▾"}
        </button>
        {layersOpen && (
          <div className="w-64 rounded-xl bg-slate-950/90 p-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
            {TOGGLES.map((t) => (
              <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                <input
                  type="checkbox"
                  checked={visibility[t.key]}
                  onChange={(e) => setVisibility((v) => ({ ...v, [t.key]: e.target.checked }))}
                  className="accent-sky-400"
                />
                <span className={`h-2 w-2 rounded-full ${KIND_STYLE[t.kind]}`} />
                <span className="flex-1">{t.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Legend + disclaimer */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="pointer-events-auto mb-2 inline-flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-[11px] ring-1 ring-white/10 backdrop-blur">
          <Legend dot="bg-rose-500" label="Observed" sub="X / news" />
          <Legend dot="bg-amber-400" label="Official" sub="NWS / NOAA" />
          <Legend dot="bg-sky-400" label="Modeled" sub="risk zones" />
        </div>
        <p className="text-[10px] leading-tight text-slate-400 drop-shadow">
          Informational, not an official safety tool. Follow NWS / AlertSF / 511. No reports ≠ safe.
        </p>
      </footer>

      {selected && <ReportSheet report={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Legend({ dot, label, sub }: { dot: string; label: string; sub: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{label}</span>
      <span className="text-slate-400">{sub}</span>
    </span>
  );
}
