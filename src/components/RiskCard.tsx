"use client";

import { formatAge, freshnessOpacity } from "@/lib/freshness";
import type { RiskResult } from "@/lib/risk";
import type { Report } from "@/lib/types";

const PILL = {
  Low: "bg-sky-500/20 text-sky-200 ring-sky-400/40",
  Moderate: "bg-amber-500/20 text-amber-200 ring-amber-400/50",
  High: "bg-rose-500/25 text-rose-200 ring-rose-400/60",
} as const;

const DOT = { modeled: "bg-sky-400", official: "bg-amber-400", observed: "bg-rose-500" } as const;

export function RiskCard({
  name,
  risk,
  reports,
  now,
  onSelectReport,
  onClose,
}: {
  name: string;
  risk: RiskResult | null;
  reports: Report[];
  now: number;
  onSelectReport: (r: Report) => void;
  onClose: () => void;
}) {
  const factors = risk ? [...risk.factors].sort((a, b) => b.points - a.points) : [];
  return (
    <div className="fw-sheet absolute inset-x-0 bottom-0 z-20 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:left-auto sm:right-3 sm:bottom-3 sm:w-96">
      <div className="max-h-[70dvh] overflow-y-auto rounded-2xl bg-slate-950/95 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold leading-tight">{name}</h2>
          <button onClick={onClose} className="-m-2.5 h-11 w-11 shrink-0 text-slate-400" aria-label="Close">
            ✕
          </button>
        </div>
        {!risk && <p className="mt-2 text-sm text-slate-300">Risk data unavailable, retrying</p>}
        {risk && (
          <p className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold ring-1 ${PILL[risk.level]}`}>
            {risk.level} risk
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {factors.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-sm">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[f.kind]}`} />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{f.label}</span>
                <span className="block text-xs text-slate-400">{f.detail}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-200">+{f.points}</span>
            </li>
          ))}
        </ul>
        {risk && (
          <p className="mt-2 flex justify-between border-t border-white/10 pt-2 text-sm">
            <span className="text-slate-400">Total</span>
            <span className="font-semibold tabular-nums">{risk.score}</span>
          </p>
        )}

        <div className="mt-3">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-rose-300">Observed reports here</p>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-400">No recent reports for this neighborhood.</p>
          ) : (
            <ul className="space-y-1">
              {reports.map((r) => (
                <li key={r.id} style={{ opacity: freshnessOpacity(r.createdAt, now) }}>
                  <button
                    onClick={() => onSelectReport(r)}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-white/5"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${r.source === "news" ? "bg-fuchsia-400" : "bg-rose-500"}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-200 underline decoration-white/20 underline-offset-2">
                      {r.summary}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {formatAge(r.createdAt, now)} · {r.source === "news" ? "news" : "X"} ↗
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 text-[11px] leading-snug text-slate-500">
          Risk estimate from modeled zones + forecast + reports. Not a prediction. No reports ≠ no flooding.
        </p>
      </div>
    </div>
  );
}
