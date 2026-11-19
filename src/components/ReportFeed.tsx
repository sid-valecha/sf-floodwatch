"use client";

import { formatAge, freshnessOpacity } from "@/lib/freshness";
import type { Report } from "@/lib/types";

export function ReportFeed({
  reports,
  now,
  open,
  onToggle,
  onSelect,
}: {
  reports: Report[]; // newest first
  now: number;
  open: boolean;
  onToggle: () => void;
  onSelect: (r: Report) => void;
}) {
  const label =
    reports.length === 0
      ? "No reports yet"
      : `${reports.length} report${reports.length === 1 ? "" : "s"} · latest ${formatAge(reports[0].createdAt, now)}`;
  return (
    <div className="pointer-events-auto mb-2 w-[min(22rem,100%)]">
      {open && (
        <div className="mb-2 max-h-[45vh] overflow-y-auto rounded-xl bg-slate-950/90 p-1 shadow-xl ring-1 ring-white/10 backdrop-blur">
          {reports.length === 0 ? (
            <p className="p-3 text-xs text-slate-300">No flood reports in the last 6h. That doesn&apos;t mean streets are dry.</p>
          ) : (
            reports.map((r) => (
              <button
                key={r.id}
                onClick={() => onSelect(r)}
                style={{ opacity: freshnessOpacity(r.createdAt, now) }}
                className="flex min-h-14 w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-white/5"
              >
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className={`h-12 w-1 shrink-0 rounded ${r.source === "news" ? "bg-fuchsia-400" : "bg-rose-500"}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-medium leading-snug">{r.summary}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {r.neighborhood} · {formatAge(r.createdAt, now)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${r.source === "news" ? "bg-fuchsia-500/25 text-fuchsia-200" : "bg-rose-500/25 text-rose-200"}`}
                >
                  {r.source === "news" ? "news" : "X"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-full bg-slate-950/85 px-4 text-sm font-semibold text-rose-300 shadow-lg ring-1 ring-rose-500/50 backdrop-blur"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
        {label}
        <span className="text-slate-400">{open ? "▾" : "▴"}</span>
      </button>
    </div>
  );
}
