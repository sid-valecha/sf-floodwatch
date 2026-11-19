"use client";

import { useState } from "react";
import type { ConditionsPayload } from "@/lib/conditions/types";

const PT = "America/Los_Angeles";

function hour(iso: string, withMinutes = false): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    ...(withMinutes ? { minute: "2-digit" } : {}),
    timeZone: PT,
  });
}

/** OFFICIAL info (NWS + NOAA): amber, collapsible, one line by default. */
export function ConditionsBanner({ data }: { data: ConditionsPayload | null }) {
  const [open, setOpen] = useState(false);

  if (!data) {
    return (
      <div className="rounded-xl bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-400 ring-1 ring-amber-400/30 backdrop-blur">
        <span className="font-semibold text-amber-400">OFFICIAL</span> · loading NWS / NOAA…
      </div>
    );
  }

  const { alerts, rain, tide, hourly, failed } = data;
  const top = alerts[0];
  const alertLabel = top
    ? alerts.length > 1
      ? `${top.event} +${alerts.length - 1}`
      : top.event
    : failed.includes("nws-alerts")
      ? "NWS alerts unavailable"
      : "No active NWS alerts";
  const tideNow = tide.waterLevelFt != null ? `${tide.waterLevelFt.toFixed(1)} ft` : null;
  const high = tide.nextHigh ? `high ${hour(tide.nextHigh.time, true)}` : null;

  return (
    <div className="rounded-xl bg-slate-950/80 text-[11px] shadow-lg ring-1 ring-amber-400/40 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left"
      >
        <span className="shrink-0 rounded bg-amber-400 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-slate-950">
          Official
        </span>
        <span className={`min-w-0 flex-1 truncate ${top ? "font-semibold text-amber-300" : "text-slate-300"}`}>
          {alertLabel}
          {rain && <span className="font-normal text-slate-300"> · Rain {rain.peakChance}%</span>}
          {tideNow && (
            <span className="font-normal text-slate-300">
              {" "}
              · Tide {tideNow}
              {high ? `, ${high}` : ""}
            </span>
          )}
        </span>
        <span className="shrink-0 text-slate-400">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/10 px-2.5 py-2">
          {alerts.length === 0 ? (
            <p className="text-slate-300">No active NWS alerts for downtown San Francisco.</p>
          ) : (
            alerts.map((a) => (
              <div key={a.event + a.ends}>
                <p className="font-semibold text-amber-300">{a.event}</p>
                {a.headline && <p className="text-slate-300">{a.headline}</p>}
              </div>
            ))
          )}
          {alerts.length > 0 && (
            <a
              href={alerts[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-amber-400 underline underline-offset-2"
            >
              NWS forecast page ↗
            </a>
          )}

          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              Rain risk, next 6h <span className="normal-case">(NWS)</span>
            </p>
            {hourly.length ? (
              <ul className="grid grid-cols-[auto_auto_1fr] gap-x-2 gap-y-0.5 text-slate-300">
                {hourly.map((h) => (
                  <li key={h.time} className="contents">
                    <span className="tabular-nums text-slate-400">{hour(h.time)}</span>
                    <span className="tabular-nums font-medium">{h.precipChance ?? "–"}%</span>
                    <span className="truncate">{h.shortForecast}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-400">Hourly forecast unavailable.</p>
            )}
          </div>

          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-400">
              Tide, {tide.stationName} <span className="normal-case">(NOAA {tide.stationId})</span>
            </p>
            <p className="text-slate-300">
              {tideNow ? `Water level ${tideNow} MLLW` : "Water level unavailable"}
              {tide.nextHigh && ` · next high ${hour(tide.nextHigh.time, true)} (${tide.nextHigh.heightFt.toFixed(1)} ft)`}
            </p>
          </div>

          {failed.length > 0 && <p className="text-slate-500">Unavailable right now: {failed.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
