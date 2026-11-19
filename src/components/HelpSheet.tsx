"use client";

import {
  ADOPT_A_DRAIN,
  ALERTSF,
  FLOODWATER_GRANT,
  HAZARD_DASHBOARD,
  KING_TIDE_END,
  KING_TIDE_START,
  REPORT_FLOODING,
  SANDBAG_RULES,
  SANDBAG_SOURCE,
  SFPUC_FLOOD_MAP,
  type SandbagView,
} from "@/lib/resources";
import type { RoadIncident } from "@/lib/conditions/types";
import { formatAge } from "@/lib/freshness";
import { TIDE_STATION_URL, type TideDay, type TideOutlook } from "@/lib/conditions/tides";
import { useEffect, useState } from "react";

const LINK = "text-amber-300 underline underline-offset-2";
const shell =
  "absolute inset-x-0 bottom-0 z-20 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:left-auto sm:right-3 sm:bottom-3 sm:w-96";
const card = "max-h-[70dvh] overflow-y-auto rounded-2xl bg-slate-950/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur";

/** OFFICIAL: report flooding to 311 (amber outline). Used in RiskCard and ReportSheet. */
export function ReportFloodingButton() {
  return (
    <div className="mt-3">
      <a
        href={`tel:${REPORT_FLOODING.phone}`}
        className="flex min-h-11 items-center justify-center rounded-lg border border-amber-400 px-3 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
      >
        Report flooding here · call 311
      </a>
      <p className="mt-1 text-[11px] text-slate-400">
        Emergency? Call {REPORT_FLOODING.emergency}.{" "}
        <a href={REPORT_FLOODING.page} target="_blank" rel="noopener noreferrer" className={LINK}>
          Report online (sf.gov) ↗
        </a>
      </p>
    </div>
  );
}

function Head({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-base font-semibold leading-tight">{title}</h2>
      <button onClick={onClose} className="-m-2.5 h-11 w-11 shrink-0 text-slate-400" aria-label="Close">
        ✕
      </button>
    </div>
  );
}

export function SandbagSheet({ site, onClose }: { site: SandbagView; onClose: () => void }) {
  return (
    <div className={shell}>
      <div className={card}>
        <Head title={site.name} onClose={onClose} />
        <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-300">Official · sandbag pickup</p>
        <p className={`mt-2 text-sm font-semibold ${site.status.open ? "text-emerald-300" : "text-slate-100"}`}>
          {site.status.label}
        </p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-400">
          <dt>Where</dt>
          <dd className="text-slate-200">
            {site.location}
            {site.approxPin && (
              <span className="mt-0.5 block text-amber-300">Pin approximate. Go by the cross streets above.</span>
            )}
          </dd>
          <dt>Hours</dt>
          <dd className="text-slate-200">
            {site.hours}
            {site.notes ? ` · ${site.notes}` : ""}
          </dd>
          <dt>Rules</dt>
          <dd className="text-slate-200">{SANDBAG_RULES}</dd>
        </dl>
        <a href={SANDBAG_SOURCE} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block text-sm ${LINK}`}>
          Source: sf.gov/urban-flooding ↗
        </a>
      </div>
    </div>
  );
}

export function ChpSheet({ incident, now, onClose }: { incident: RoadIncident; now: number; onClose: () => void }) {
  return (
    <div className={shell}>
      <div className={card}>
        <Head title="CHP: Roadway flooding" onClose={onClose} />
        <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-300">Official · CHP incident feed</p>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-slate-400">
          <dt>Where</dt>
          <dd className="text-slate-200">{incident.location}</dd>
          {incident.area && (
            <>
              <dt>Area</dt>
              <dd className="text-slate-200">{incident.area}</dd>
            </>
          )}
          <dt>Reported</dt>
          <dd className="text-slate-200">{formatAge(incident.createdAt, now)}</dd>
          {incident.latestDetail && (
            <>
              <dt>Latest</dt>
              <dd className="text-slate-200">{incident.latestDetail}</dd>
            </>
          )}
        </dl>
        <a href={incident.url} target="_blank" rel="noopener noreferrer" className={`mt-3 inline-block text-sm ${LINK}`}>
          Source: CHP incident feed ↗
        </a>
      </div>
    </div>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MON[m - 1]} ${d}`;
}
function timeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}
const BAR = { above: "bg-rose-400", near: "bg-amber-400", normal: "bg-slate-500" } as const;
const dayInitial = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return "SMTWTFS"[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
};
const isKing = (d: TideDay) => d.date >= KING_TIDE_START && d.date <= KING_TIDE_END;

export function TideSheet({ onClose }: { onClose: () => void }) {
  const [outlook, setOutlook] = useState<TideOutlook | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/tides")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("tides"))))
      .then((o: TideOutlook) => {
        if (!cancelled) setOutlook(o);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const unavailable = error || outlook?.failed || (outlook && outlook.days.length === 0);
  const days = outlook?.days ?? [];
  const thr = outlook?.minorFloodFt ?? 0;
  const thrLabel = `${thr.toFixed(1)} ft`;
  // Chart scale: 0 .. a bit above the highest of threshold/peaks. Bars are px-based inside a fixed-height box.
  const H = 96;
  const top = Math.max(thr, ...days.map((d) => d.peakFt)) + 0.5;
  const yf = (ft: number) => (ft / top) * H; // unrounded: bars and the threshold line share one scale
  const kingFirst = days.findIndex(isKing);
  const kingLast = days.findLastIndex(isKing);
  return (
    <div className={shell}>
      <div className={card}>
        <Head title="Tide outlook" onClose={onClose} />
        <p className="mt-1 text-[11px] uppercase tracking-wide text-amber-300">Official · NOAA predictions</p>
        {!outlook && !error && <p className="mt-3 text-sm text-slate-400">Loading tide predictions…</p>}
        {unavailable && (
          <p className="mt-3 text-sm text-slate-300">
            Tide predictions are unavailable right now.{" "}
            <a href={TIDE_STATION_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
              NOAA station page ↗
            </a>
          </p>
        )}
        {outlook && !unavailable && (
          <>
            <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-400">Highest high tide each day (ft above MLLW)</p>
            <div role="img" aria-label={`Daily peak high tide for the next ${days.length} days against the NWS minor flood level of ${thrLabel}`}>
              <div className="relative mt-5" style={{ height: H }}>
                <div className="absolute inset-x-0 z-10 border-t border-dashed border-amber-300" style={{ bottom: yf(thr) }} />
                <span
                  className="absolute right-0 z-10 rounded bg-slate-950/90 px-1 text-[10px] text-amber-300"
                  style={{ bottom: yf(thr) + 2 }}
                >
                  NWS minor flood level {thrLabel}
                </span>
                <div className="absolute inset-0 flex gap-1 border-b border-white/20">
                  {days.map((d) => (
                    <div key={d.date} className="relative min-w-0 flex-1">
                      <div className={`absolute inset-x-0 bottom-0 rounded-t ${BAR[d.level]}`} style={{ height: Math.max(yf(d.peakFt), 2) }} />
                      <span
                        className="absolute inset-x-0 text-center text-[9px] tabular-nums text-slate-300"
                        style={{ bottom: Math.max(yf(d.peakFt), 2) + 1 }}
                      >
                        {d.peakFt.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-0.5 grid gap-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map((d) => (
                  <span key={d.date} className="text-center text-[10px] tabular-nums text-slate-400">
                    {dayInitial(d.date)} {Number(d.date.slice(8))}
                  </span>
                ))}
                {kingFirst >= 0 && (
                  <span
                    className="mt-0.5 border-t-2 border-amber-300 pt-0.5 text-center text-[10px] font-semibold text-amber-300"
                    style={{ gridColumn: `${kingFirst + 1} / ${kingLast + 2}` }}
                  >
                    King tides
                  </span>
                )}
              </div>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              <span className="text-amber-300">Amber</span>: within 0.5 ft of the level ·{" "}
              <span className="text-rose-300">Red</span>: at or above it.
            </p>

            <ul className="mt-3 space-y-1.5 text-sm">
              {days.map((d) => (
                <li key={d.date}>
                  {d.highs.map((h) => {
                    const lvl = h.ft >= thr ? "above" : h.ft >= thr - 0.5 ? "near" : "normal";
                    return (
                      <p key={h.time} className="flex flex-wrap gap-x-1.5 text-slate-200">
                        <span>
                          {dayLabel(d.date)} · {timeLabel(h.time)} · {h.ft.toFixed(1)} ft
                        </span>
                        {isKing(d) && <span className="rounded bg-amber-400/20 px-1 text-[10px] leading-5 text-amber-300">King tides</span>}
                        {lvl === "above" && <b className="text-rose-300">At/above flood level</b>}
                        {lvl === "near" && <b className="text-amber-300">Near flood level</b>}
                      </p>
                    );
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 text-xs leading-snug text-slate-300">
          Low-lying shoreline areas (Embarcadero, Mission Creek, Islais Creek, Marina, Ocean Beach parking) face the most risk around
          these high tides, especially with rain or storm surge. Predictions are astronomical only; wind and rain can push water higher.
        </p>
        <p className="mt-2 text-xs">
          <a href={TIDE_STATION_URL} target="_blank" rel="noopener noreferrer" className={LINK}>
            NOAA tide predictions, San Francisco (9414290) ↗
          </a>
          <span className="block text-slate-400">Flood level: NWS minor coastal flood threshold, converted from station datum to MLLW.</span>
        </p>
      </div>
    </div>
  );
}

export function HelpSheet({
  sandbags,
  onShowSandbags,
  onClose,
}: {
  sandbags: SandbagView[];
  onShowSandbags: () => void;
  onClose: () => void;
}) {
  const best = sandbags.find((s) => s.status.open) ?? sandbags[0];
  return (
    <div className={shell}>
      <div className={card}>
        <Head title="Help" onClose={onClose} />

        <p className="mb-1 mt-3 text-[10px] uppercase tracking-wide text-slate-400">What the colors mean</p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex gap-2">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
            <span>
              <b>Observed</b> <span className="text-slate-300">· reports from X and news, with photos. Fades as it ages.</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
            <span>
              <b>Official</b> <span className="text-slate-300">· NWS, NOAA, sf.gov and CHP: alerts, tides, sandbag sites, CHP roadway flooding incidents.</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400" />
            <span>
              <b>Modeled</b> <span className="text-slate-300">· long-term flood risk zones. Not live water.</span>
            </span>
          </li>
        </ul>

        <p className="mb-1 mt-4 text-[10px] uppercase tracking-wide text-amber-300">What to do (official)</p>
        <ul className="space-y-2 text-sm">
          <li>
            <b>Get alerts.</b> {ALERTSF.text}{" "}
            <a href={ALERTSF.sms} className={LINK}>
              Text now
            </a>{" "}
            ·{" "}
            <a href={ALERTSF.web} target="_blank" rel="noopener noreferrer" className={LINK}>
              alertsf.org ↗
            </a>
          </li>
          <li>
            <b>Report flooding.</b> Call{" "}
            <a href={`tel:${REPORT_FLOODING.phone}`} className={LINK}>
              311
            </a>{" "}
            ({REPORT_FLOODING.phoneOutsideSF} outside SF) or{" "}
            <a href={REPORT_FLOODING.page} target="_blank" rel="noopener noreferrer" className={LINK}>
              report online ↗
            </a>
            . Emergency? Call {REPORT_FLOODING.emergency}.
          </li>
          <li>
            <b>Sandbags.</b>{" "}
            {best ? (
              <>
                {best.name}: {best.status.label}.{" "}
              </>
            ) : (
              "No upcoming sites listed. "
            )}
            <button onClick={onShowSandbags} className={LINK}>
              See map
            </button>
            {" · "}
            <a href={SANDBAG_SOURCE} target="_blank" rel="noopener noreferrer" className={LINK}>
              sf.gov/urban-flooding ↗
            </a>
            <span className="block text-xs text-slate-400">{SANDBAG_RULES}</span>
          </li>
          <li>
            <b>Adopt a Drain.</b>{" "}
            <a href={ADOPT_A_DRAIN} target="_blank" rel="noopener noreferrer" className={LINK}>
              adoptadrain.sfwater.org ↗
            </a>
          </li>
          <li>
            <b>Property owner?</b>{" "}
            <a href={FLOODWATER_GRANT} target="_blank" rel="noopener noreferrer" className={LINK}>
              Floodwater Grant, up to $100k ↗
            </a>
          </li>
        </ul>

        <p className="mb-1 mt-4 text-[10px] uppercase tracking-wide text-amber-300">Tides</p>
        <p className="text-sm text-slate-300">
          <b className="text-slate-100">Tide outlook</b> (Layers menu, or the king tide line in the banner) charts the next 10 days of NOAA high
          tides against the NWS minor flood level. Predictions only; rain and wind can push water higher.
        </p>

        <p className="mb-1 mt-4 text-[10px] uppercase tracking-wide text-sky-300">Official maps</p>
        <ul className="space-y-1 text-sm">
          <li>
            <a href={SFPUC_FLOOD_MAP} target="_blank" rel="noopener noreferrer" className={LINK}>
              SFPUC 100-Year Storm Flood Risk Map ↗
            </a>
          </li>
          <li>
            <a href={HAZARD_DASHBOARD} target="_blank" rel="noopener noreferrer" className={LINK}>
              SF Storm and Flood Hazard dashboard ↗
            </a>
          </li>
        </ul>

        <p className="mt-4 text-[11px] leading-snug text-slate-500">
          Informational, not an official safety tool. Follow NWS / AlertSF / 511. No reports ≠ no flooding.
        </p>
      </div>
    </div>
  );
}
