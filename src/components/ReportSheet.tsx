"use client";

import { formatAge } from "@/lib/freshness";
import type { Report } from "@/lib/types";

const LOCATED_BY: Record<Report["locationEvidence"], string> = {
  text: "Located from post text",
  image: "Located from photo",
  both: "Located from text + photo",
  neighborhood: "Neighborhood-level only",
};

export function ReportSheet({ report: r, onClose }: { report: Report; onClose: () => void }) {
  const isNews = r.source === "news";
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 p-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] sm:left-auto sm:right-3 sm:bottom-3 sm:w-96">
      <div className="max-h-[70vh] overflow-y-auto rounded-2xl bg-slate-950/95 shadow-2xl ring-1 ring-white/10 backdrop-blur">
        {r.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.imageUrl} alt="" className="max-h-64 w-full rounded-t-2xl object-cover" referrerPolicy="no-referrer" />
        )}
        <div className="space-y-2 p-4">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide">
            <span className={isNews ? "text-fuchsia-300" : "text-rose-300"}>
              Observed · {isNews ? "news report" : "X post"} · {r.severity} severity
            </span>
            <button onClick={onClose} className="-m-2 p-2 text-slate-400" aria-label="Close">
              ✕
            </button>
          </div>
          <p className="text-[15px] font-medium leading-snug">{r.summary}</p>
          <p className="text-sm text-slate-300">
            {r.crossStreet ? `${r.crossStreet}, ` : ""}
            {r.neighborhood}
          </p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">
            <dt>Age</dt>
            <dd className="text-slate-200">{formatAge(r.createdAt)}</dd>
            <dt>Location</dt>
            <dd className="text-slate-200">
              {LOCATED_BY[r.locationEvidence]}
              {r.approximate ? " (approx.)" : ""}
            </dd>
            {r.locationDetail && (
              <>
                <dt>How</dt>
                <dd className="text-slate-200">{r.locationDetail}</dd>
              </>
            )}
            {!isNews && (
              <>
                <dt>Confidence</dt>
                <dd className="text-slate-200">{Math.round(r.confidence * 100)}%</dd>
              </>
            )}
          </dl>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
          >
            Open source ↗{r.author ? ` @${r.author}` : ""}
          </a>
        </div>
      </div>
    </div>
  );
}
