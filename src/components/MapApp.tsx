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
  const [searchOpen, setSearchOpen] = useState(false);

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
      setSearchOpen(false);
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

      {/* Top: title row (title + search + layers), banner, optional search input */}
      <header className="pointer-events-none absolute inset-x-3 top-[max(env(safe-area-inset-top),0.75rem)] z-10 min-w-0">
        <div className="relative flex items-center gap-2">
          <div className="pointer-events-auto flex min-h-10 min-w-0 items-center gap-2 rounded-xl bg-slate-950/80 px-3 shadow-lg ring-1 ring-white/10 backdrop-blur">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
            </span>
            <h1 className="truncate text-sm font-semibold tracking-tight">SF Flood Watch</h1>
            {payload?.mode === "snapshot" && (
              <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                snapshot
              </span>
            )}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search neighborhood"
            aria-expanded={searchOpen}
            className="pointer-events-auto h-10 w-10 shrink-0 rounded-xl bg-slate-950/80 text-base shadow-lg ring-1 ring-white/10 backdrop-blur"
          >
            🔍
          </button>
          <button
            onClick={() => setLayersOpen((o) => !o)}
            aria-expanded={layersOpen}
            className="pointer-events-auto h-10 shrink-0 rounded-xl bg-slate-950/80 px-3 text-xs font-medium shadow-lg ring-1 ring-white/10 backdrop-blur"
          >
            Layers {layersOpen ? "▴" : "▾"}
          </button>
          {layersOpen && (
            <div className="pointer-events-auto absolute right-0 top-12 z-30 w-64 max-w-full rounded-xl bg-slate-950/95 p-2 shadow-xl ring-1 ring-white/10 backdrop-blur">
              {TOGGLES.map((t) => (
                <label key={t.key} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={visibility[t.key]}
                    onChange={(e) => setVisibility((v) => ({ ...v, [t.key]: e.target.checked }))}
                    className="accent-sky-400"
                  />
                  <span className={`h-2 w-2 rounded-full ${KIND_STYLE[t.kind]}`} />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {searchOpen && (
          <div className="pointer-events-auto mt-2 min-w-0">
            <input
              list="nhood-names"
              value={query}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search neighborhood…"
              aria-label="Search neighborhood"
              enterKeyHint="search"
              autoFocus
              className="block h-10 w-full min-w-0 rounded-xl bg-slate-950/90 px-3 text-sm text-slate-100 shadow-lg ring-1 ring-white/10 backdrop-blur placeholder:text-slate-500"
            />
          </div>
        )}
        <datalist id="nhood-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="pointer-events-auto mt-2 min-w-0">
          <ConditionsBanner data={conditions} failed={conditionsFailed} />
        </div>
      </header>

      {/* Legend + disclaimer */}
      <footer className={`pointer-events-none absolute bottom-3 left-3 right-16 min-w-0 pb-[env(safe-area-inset-bottom)] ${sheet ? "hidden" : ""}`}>
        {now > 0 && <ReportFeed reports={reports} now={now} open={feedOpen} onToggle={() => setFeedOpen((o) => !o)} onSelect={openReport} />}
        <div className="pointer-events-auto mb-2 inline-flex max-w-full flex-wrap gap-x-3 gap-y-1 rounded-lg bg-slate-950/75 px-2.5 py-1.5 text-[11px] ring-1 ring-white/10 backdrop-blur">
          <Legend dot="bg-rose-500" label="Observed" sub="X / news" />
          <Legend dot="bg-amber-400" label="Official" sub="NWS / NOAA" />
          <Legend dot="bg-sky-400" label="Modeled" sub="risk zones" />
        </div>
        <p className="text-[10px] leading-tight text-slate-300 [text-shadow:0_1px_2px_#000]">
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
      <span className="hidden text-slate-400 sm:inline">{sub}</span>
    </span>
  );
}
