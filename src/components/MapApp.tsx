"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LayerKey, LayerVisibility } from "./FloodMap";
import { ReportSheet } from "./ReportSheet";
import { ConditionsBanner } from "./ConditionsBanner";
import { RiskCard } from "./RiskCard";
import { ReportFeed } from "./ReportFeed";
import { scoreNeighborhood, type NeighborhoodStats, type RiskConditions } from "@/lib/risk";
import type { ConditionsPayload } from "@/lib/conditions/types";
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

const PT = "America/Los_Angeles";
function hourLabel(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", timeZone: PT })
    .replace(" ", "")
    .toLowerCase();
}
function toRiskConditions(c: ConditionsPayload | null): RiskConditions {
  const rain = c?.rain;
  let rainWindow: string | null = null;
  if (rain?.windowStart && rain.windowEnd) {
    const a = hourLabel(rain.windowStart);
    const b = hourLabel(rain.windowEnd);
    rainWindow = a === b ? a : a.slice(-2) === b.slice(-2) ? `${a.slice(0, -2)}–${b}` : `${a}–${b}`;
  }
  return {
    rainPeakChance: rain?.peakChance ?? null,
    rainWindow,
    rainInchesNext6h: null,
    nextHighTide: c?.tide.nextHigh ? { time: c.tide.nextHigh.time, ft: c.tide.nextHigh.heightFt } : null,
  };
}

type Sheet = { type: "report"; report: Report } | { type: "nhood"; name: string } | null;
type FlyTo = { lng: number; lat: number; zoom?: number; padBottom?: number; key: number };

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
  const [sheet, setSheet] = useState<Sheet>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [stats, setStats] = useState<Record<string, NeighborhoodStats> | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    fetch("/data/neighborhood-stats.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setStats(j))
      .catch(() => {});
  }, []);

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

  const { data: conditions, failed: conditionsFailed } = useConditions();
  const radarTileUrl = useRadarTileUrl();
  const reports = useMemo(
    () => [...(payload?.reports ?? [])].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [payload],
  );
  const names = useMemo(() => (stats ? Object.keys(stats).sort() : []), [stats]);

  const fly = useCallback((lng: number, lat: number, zoom: number) => {
    setFlyTo({ lng, lat, zoom, padBottom: Math.round(window.innerHeight * 0.38), key: Date.now() });
  }, []);
  const openReport = useCallback(
    (r: Report) => {
      setFeedOpen(false);
      setSheet({ type: "report", report: r });
      fly(r.lng, r.lat, 15);
    },
    [fly],
  );
  const openNhood = useCallback(
    (name: string, at?: [number, number]) => {
      setFeedOpen(false);
      setSheet({ type: "nhood", name });
      setNow(Date.now());
      const c = stats?.[name]?.centroid ?? at;
      if (c) fly(c[0], c[1], 13.5);
    },
    [fly, stats],
  );
  const onSearch = (v: string) => {
    setQuery(v);
    const hit = names.find((n) => n.toLowerCase() === v.trim().toLowerCase());
    if (hit) {
      openNhood(hit);
      setQuery("");
    }
  };

  const nhoodName = sheet?.type === "nhood" ? sheet.name : null;
  const risk = useMemo(() => {
    if (!nhoodName || !stats?.[nhoodName] || !now) return null;
    return scoreNeighborhood(nhoodName, stats[nhoodName], toRiskConditions(conditions), reports, now);
  }, [nhoodName, stats, conditions, reports, now]);
  const nhoodReports = useMemo(
    () => (risk ? reports.filter((r) => risk.reportIds.includes(r.id)) : []),
    [risk, reports],
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0b0f17] text-slate-100">
      <FloodMap
        visibility={visibility}
        reports={reports}
        radarTileUrl={radarTileUrl}
        alertsGeoJSON={conditions?.alertsGeoJSON ?? null}
        selectedNhood={nhoodName}
        flyTo={flyTo}
        onSelectReport={openReport}
        onSelectNeighborhood={(n, ll) => openNhood(n, ll)}
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
          <ConditionsBanner data={conditions} failed={conditionsFailed} />
        </div>
        <div className="pointer-events-auto mt-2 w-[min(24rem,calc(100vw-1.5rem))]">
          <input
            list="nhood-names"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search neighborhood…"
            aria-label="Search neighborhood"
            enterKeyHint="search"
            className="h-10 w-full rounded-xl bg-slate-950/80 px-3 text-base text-slate-100 shadow-lg ring-1 ring-white/10 backdrop-blur placeholder:text-slate-500 sm:text-sm"
          />
          <datalist id="nhood-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      </header>

      {/* Layer toggles */}
      <div className="absolute right-3 top-[max(env(safe-area-inset-top),0.75rem)] flex flex-col items-end gap-2">
        <button
          onClick={() => setLayersOpen((o) => !o)}
          className="min-h-10 rounded-xl bg-slate-950/80 px-3 py-2 text-xs font-medium shadow-lg ring-1 ring-white/10 backdrop-blur"
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
      <footer className={`pointer-events-none absolute inset-x-0 bottom-0 p-3 pr-16 pb-[max(env(safe-area-inset-bottom),0.75rem)] ${sheet ? "hidden" : ""}`}>
        {now > 0 && <ReportFeed reports={reports} now={now} open={feedOpen} onToggle={() => setFeedOpen((o) => !o)} onSelect={openReport} />}
        <div className="pointer-events-auto mb-2 inline-flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-[11px] ring-1 ring-white/10 backdrop-blur">
          <Legend dot="bg-rose-500" label="Observed" sub="X / news" />
          <Legend dot="bg-amber-400" label="Official" sub="NWS / NOAA" />
          <Legend dot="bg-sky-400" label="Modeled" sub="risk zones" />
        </div>
        <p className="text-[10px] leading-tight text-slate-400 drop-shadow">
          Informational, not an official safety tool. Follow NWS / AlertSF / 511. No reports ≠ no flooding.
        </p>
      </footer>

      {sheet?.type === "report" && <ReportSheet report={sheet.report} onClose={() => setSheet(null)} />}
      {sheet?.type === "nhood" && (
        <RiskCard
          name={sheet.name}
          risk={risk}
          reports={nhoodReports}
          now={now}
          onSelectReport={openReport}
          onClose={() => setSheet(null)}
        />
      )}
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
