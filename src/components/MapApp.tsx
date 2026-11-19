"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { LayerKey, LayerVisibility } from "./FloodMap";
import { ReportSheet } from "./ReportSheet";
import { ConditionsBanner } from "./ConditionsBanner";
import { RiskCard } from "./RiskCard";
import { ReportFeed } from "./ReportFeed";
import { HelpSheet, SandbagSheet } from "./HelpSheet";
import { SANDBAG_SITES, sandbagStatus, type SandbagView } from "@/lib/resources";
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
  { key: "sandbags", label: "Sandbag pickup", kind: "official" },
  { key: "radar", label: "Rain radar", kind: "official" },
  { key: "sfpuc", label: "Storm flood risk (SFPUC)", kind: "modeled" },
  { key: "fema", label: "Coastal flood risk (FEMA)", kind: "modeled" },
  { key: "hotspots", label: "Coastal hotspots", kind: "modeled" },
  { key: "drains", label: "Storm drains (zoom in)", kind: "modeled" },
];

const PT = "America/Los_Angeles";
function fmtAge(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

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
    alerts: (c?.alerts ?? []).map((a) => ({ event: a.event })),
    nextHighTide: c?.tide.nextHigh ? { time: c.tide.nextHigh.time, ft: c.tide.nextHigh.heightFt } : null,
  };
}

type Sheet =
  | { type: "report"; report: Report }
  | { type: "nhood"; name: string }
  | { type: "help" }
  | { type: "sandbag"; id: string }
  | null;
type FlyTo = { lng: number; lat: number; zoom?: number; padBottom?: number; key: number };

const KIND_STYLE = {
  observed: "bg-rose-500",
  official: "bg-amber-400",
  modeled: "bg-sky-400",
};

type WindowKey = "30m" | "1h" | "3h" | "6h" | "all";
const WINDOWS: { key: WindowKey; label: string; ms: number }[] = [
  { key: "30m", label: "30m", ms: 30 * 60_000 },
  { key: "1h", label: "1h", ms: 60 * 60_000 },
  { key: "3h", label: "3h", ms: 3 * 60 * 60_000 },
  { key: "6h", label: "6h", ms: 6 * 60 * 60_000 },
  { key: "all", label: "All", ms: Infinity },
];

export default function MapApp() {
  const [visibility, setVisibility] = useState<LayerVisibility>({
    reports: true,
    alerts: true,
    radar: true,
    sfpuc: true,
    fema: true,
    hotspots: true,
    drains: true,
    sandbags: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [payload, setPayload] = useState<ReportsPayload | null>(null);
  const [reportsFailed, setReportsFailed] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [now, setNow] = useState(0);
  const [stats, setStats] = useState<Record<string, NeighborhoodStats> | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTo | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [windowKey, setWindowKey] = useState<WindowKey>("all");

  // Restore the viewer's saved window after mount (never during render; Safari private mode can throw).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const v = localStorage.getItem("fw-window");
        if (v && WINDOWS.some((w) => w.key === v)) setWindowKey(v as WindowKey);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const chooseWindow = (k: WindowKey) => {
    setWindowKey(k);
    try {
      localStorage.setItem("fw-window", k);
    } catch {}
  };

  useEffect(() => {
    const t0 = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      clearTimeout(t0);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [5_000, 15_000, 30_000];
    const load = (attempt: number) => {
      fetch("/data/neighborhood-stats.json")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("stats " + r.status))))
        .then((j) => {
          if (!cancelled) setStats(j);
        })
        .catch(() => {
          if (!cancelled) timer = setTimeout(() => load(attempt + 1), delays[Math.min(attempt, delays.length - 1)]);
        });
    };
    load(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let repoll: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = (): Promise<void> =>
      fetch("/api/reports")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("reports " + r.status))))
        .then((p: ReportsPayload | null) => {
          if (cancelled) return;
          if (!p || !Array.isArray(p.reports)) throw new Error("bad payload");
          setReportsFailed(false);
          // Snapshot served while live data loads: re-poll once after 20 s.
          if (p.mode === "snapshot" && !repoll) repoll = setTimeout(() => void load(), 20_000);
          // Stale hiding (12h X, 24h news) happens in the `reports` memo against the ticking `now`.
          setPayload(p);
        })
        .catch(() => {
          if (cancelled) return;
          setReportsFailed(true);
          clearTimeout(retry);
          retry = setTimeout(() => void load(), 25_000);
        });
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => {
      cancelled = true;
      clearTimeout(repoll);
      clearTimeout(retry);
      clearInterval(t);
    };
  }, []);

  const { data: conditions, failed: conditionsFailed } = useConditions();
  const radarTileUrl = useRadarTileUrl();
  // All recent reports (per-source max age). Risk scoring always uses this unfiltered list.
  const allReports = useMemo(
    () =>
      (now > 0 ? (payload?.reports ?? []) : [])
        .filter((r) => ageMs(r.createdAt, now) < maxAgeMs(r.source))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [payload, now],
  );
  const windowDef = WINDOWS.find((w) => w.key === windowKey) ?? WINDOWS[4];
  // Display list (map pins, feed, counts) narrowed by the time window.
  const reports = useMemo(
    () => (windowDef.ms === Infinity ? allReports : allReports.filter((r) => ageMs(r.createdAt, now) <= windowDef.ms)),
    [allReports, windowDef, now],
  );
  // Status depends on `now` (state, refreshed each minute); past one-day sites drop out.
  const sandbags = useMemo<SandbagView[]>(
    () =>
      now > 0
        ? SANDBAG_SITES.map((s) => ({ ...s, status: sandbagStatus(s, now) })).filter((s) => s.status.upcoming)
        : [],
    [now],
  );
  const sandbagPins = useMemo(() => sandbags.map(({ id, lng, lat }) => ({ id, lng, lat })), [sandbags]);
  const names = useMemo(() => (stats ? Object.keys(stats).sort() : []), [stats]);

  const fly = useCallback((lng: number, lat: number, zoom: number) => {
    setFlyTo({ lng, lat, zoom, padBottom: Math.round(window.innerHeight * 0.38), key: Date.now() });
  }, []);
  const openReport = useCallback(
    (r: Report) => {
      setFeedOpen(false);
      setLayersOpen(false);
      setSearchOpen(false);
      setSheet({ type: "report", report: r });
      fly(r.lng, r.lat, 15);
    },
    [fly],
  );
  const closeOverlays = useCallback(() => {
    setFeedOpen(false);
    setLayersOpen(false);
    setSearchOpen(false);
  }, []);
  const openSandbag = useCallback(
    (id: string) => {
      closeOverlays();
      setNow(Date.now());
      setSheet({ type: "sandbag", id });
      const s = SANDBAG_SITES.find((x) => x.id === id);
      if (s) fly(s.lng, s.lat, 14.5);
    },
    [fly, closeOverlays],
  );
  const showSandbags = useCallback(() => {
    setSheet(null);
    setVisibility((v) => ({ ...v, sandbags: true }));
    fly(-122.43, 37.775, 11.6);
  }, [fly]);
  const openHelp = () => {
    closeOverlays();
    setNow(Date.now());
    setSheet((s) => (s?.type === "help" ? null : { type: "help" }));
  };
  const openNhood = useCallback(
    (name: string, opts?: { fly?: boolean }) => {
      setFeedOpen(false);
      setLayersOpen(false);
      setSearchOpen(false);
      setSheet({ type: "nhood", name });
      setNow(Date.now());
      const c = stats?.[name]?.centroid;
      if (opts?.fly && c) fly(c[0], c[1], 13.5);
    },
    [fly, stats],
  );
  const finishSearch = (name: string) => {
    openNhood(name, { fly: true });
    setQuery("");
    setSearchOpen(false);
  };
  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    // Only a datalist pick (replacement text) or a programmatic change opens directly.
    const type = (e.nativeEvent as InputEvent).inputType;
    if (type === undefined || type === "insertReplacementText") {
      const hit = names.find((n) => n.toLowerCase() === v.trim().toLowerCase());
      if (hit) finishSearch(hit);
    }
  };
  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = names.find((n) => n.toLowerCase().startsWith(q)) ?? names.find((n) => n.toLowerCase().includes(q));
    if (hit) finishSearch(hit);
  };

  const nhoodName = sheet?.type === "nhood" ? sheet.name : null;
  const risk = useMemo(() => {
    if (!nhoodName || !stats?.[nhoodName] || !now) return null;
    return scoreNeighborhood(nhoodName, stats[nhoodName], toRiskConditions(conditions), allReports, now);
  }, [nhoodName, stats, conditions, allReports, now]);
  const nhoodReports = useMemo(
    () => (nhoodName ? allReports.filter((r) => r.neighborhood === nhoodName) : []),
    [nhoodName, allReports],
  );

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0b0f17] text-slate-100">
      <FloodMap
        visibility={visibility}
        reports={reports}
        radarTileUrl={radarTileUrl}
        alertsGeoJSON={conditions?.alertsGeoJSON ?? null}
        selectedNhood={nhoodName}
        sandbagSites={sandbagPins}
        onSelectSandbag={openSandbag}
        flyTo={flyTo}
        onSelectReport={openReport}
        onSelectNeighborhood={(n) => openNhood(n)}
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
                {now > 0 && Date.parse(payload.fetchedAt) ? (
                  <span className="hidden min-[480px]:inline"> · {fmtAge(now - Date.parse(payload.fetchedAt))}</span>
                ) : null}
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
            onClick={openHelp}
            aria-label="Help and official resources"
            aria-expanded={sheet?.type === "help"}
            className="pointer-events-auto h-10 w-10 shrink-0 rounded-xl bg-slate-950/80 text-sm font-semibold shadow-lg ring-1 ring-white/10 backdrop-blur"
          >
            ?
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
          <form onSubmit={onSearchSubmit} className="pointer-events-auto mt-2 min-w-0">
            <input
              list="nhood-names"
              value={query}
              onChange={onSearchChange}
              placeholder="Search neighborhood…"
              aria-label="Search neighborhood"
              enterKeyHint="go"
              autoFocus
              className="block h-10 w-full min-w-0 rounded-xl bg-slate-950/90 px-3 text-sm text-slate-100 shadow-lg ring-1 ring-white/10 backdrop-blur placeholder:text-slate-500"
            />
          </form>
        )}
        <datalist id="nhood-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="pointer-events-auto mt-2 min-w-0">
          <ConditionsBanner data={conditions} failed={conditionsFailed} />
        </div>
        <div className="pointer-events-none mt-2 flex min-w-0 flex-col items-start gap-1">
          <div
            role="group"
            aria-label="Show reports from the last"
            className="pointer-events-auto flex items-center gap-0.5 rounded-xl bg-slate-950/80 p-0.5 text-xs shadow-lg ring-1 ring-white/10 backdrop-blur"
          >
            <span className="px-2 text-[10px] uppercase tracking-wide text-slate-400">Last</span>
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => chooseWindow(w.key)}
                aria-pressed={windowKey === w.key}
                className={`min-h-9 min-w-9 rounded-lg px-2 font-medium ${
                  windowKey === w.key ? "bg-sky-500/30 text-sky-100 ring-1 ring-sky-400/50" : "text-slate-300"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          {now > 0 && windowKey !== "all" && payload && reports.length === 0 && (
            <p className="pointer-events-auto max-w-full rounded-lg bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-200 ring-1 ring-white/10 backdrop-blur">
              No reports in the last {windowDef.label}. That doesn&apos;t mean no flooding.
            </p>
          )}
        </div>
      </header>

      {/* Legend + disclaimer */}
      <footer className={`pointer-events-none absolute bottom-3 left-3 right-16 min-w-0 pb-[env(safe-area-inset-bottom)] ${sheet ? "hidden" : ""}`}>
        {now > 0 && <ReportFeed reports={reports} failed={reportsFailed && !payload} now={now} open={feedOpen} onToggle={() => setFeedOpen((o) => !o)} onSelect={openReport} />}
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
      {sheet?.type === "help" && <HelpSheet sandbags={sandbags} onShowSandbags={showSandbags} onClose={() => setSheet(null)} />}
      {sheet?.type === "sandbag" &&
        (() => {
          // Keep an open sheet alive after its event ends (no blank sheet): show "Event ended".
          let s: SandbagView | undefined = sandbags.find((x) => x.id === sheet.id);
          if (!s) {
            const site = SANDBAG_SITES.find((x) => x.id === sheet.id);
            if (site) s = { ...site, status: { label: "Event ended", open: false, upcoming: false } };
          }
          return s ? <SandbagSheet site={s} onClose={() => setSheet(null)} /> : null;
        })()}
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
