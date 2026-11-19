"use client";

import {
  ADOPT_A_DRAIN,
  ALERTSF,
  FLOODWATER_GRANT,
  HAZARD_DASHBOARD,
  REPORT_FLOODING,
  SANDBAG_RULES,
  SANDBAG_SOURCE,
  SFPUC_FLOOD_MAP,
  type SandbagView,
} from "@/lib/resources";

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
          <dd className="text-slate-200">{site.location}</dd>
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
              <b>Official</b> <span className="text-slate-300">· NWS, NOAA and sf.gov: alerts, tides, sandbag sites.</span>
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
