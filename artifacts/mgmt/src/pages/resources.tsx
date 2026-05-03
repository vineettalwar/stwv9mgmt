import { Fragment, useState } from "react";
import { useGetResourcesCapacity } from "@workspace/api-client-react";
import { Gauge } from "lucide-react";

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function utilColour(pct: number): string {
  if (pct > 100) return "bg-red-100 text-red-800 border-red-200";
  if (pct >= 80) return "bg-amber-100 text-amber-800 border-amber-200";
  if (pct === 0) return "bg-slate-50 text-slate-400 border-slate-100";
  return "bg-emerald-100 text-emerald-800 border-emerald-200";
}

export default function Resources() {
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = getMondayOf(today);
  const defaultTo = addDays(defaultFrom, 27);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [expanded, setExpanded] = useState<{ userId: number; weekStart: string } | null>(null);

  const { data, isLoading, isError } = useGetResourcesCapacity({ from, to });

  const allUtils = (data?.freelancers ?? []).flatMap(f => f.weeks.map(w => w.utilization));
  const avgUtil = allUtils.length > 0 ? Math.round(allUtils.reduce((a, b) => a + b, 0) / allUtils.length) : null;
  const overbookedCount = (data?.freelancers ?? []).filter(f => f.weeks.some(w => w.utilization > 100)).length;

  function toggle(userId: number, weekStart: string) {
    setExpanded(prev =>
      prev?.userId === userId && prev?.weekStart === weekStart ? null : { userId, weekStart }
    );
  }

  function jumpToCurrentMonth() {
    const mon = getMondayOf(today);
    setFrom(mon);
    setTo(addDays(mon, 27));
    setExpanded(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Resources</h1>
        <p className="text-sm text-slate-500">Freelancer capacity and workload by week. Click a cell to see the project breakdown.</p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">From</label>
          <input
            type="date"
            value={from}
            onChange={e => { setFrom(getMondayOf(e.target.value)); setExpanded(null); }}
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-slate-700">To</label>
          <input
            type="date"
            value={to}
            onChange={e => { setTo(e.target.value); setExpanded(null); }}
            className="border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <button
          onClick={jumpToCurrentMonth}
          className="text-sm text-slate-500 hover:text-slate-900 underline"
        >
          Reset to current 4 weeks
        </button>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Active Freelancers</p>
            <p className="text-2xl font-bold text-slate-900">{data.freelancers.length}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Avg Utilization</p>
            <p className={`text-2xl font-bold ${avgUtil !== null && avgUtil > 100 ? "text-red-600" : avgUtil !== null && avgUtil >= 80 ? "text-amber-600" : "text-emerald-600"}`}>
              {avgUtil !== null ? `${avgUtil}%` : "—"}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-1">Overbooked This Range</p>
            <p className={`text-2xl font-bold ${overbookedCount > 0 ? "text-red-600" : "text-slate-900"}`}>
              {overbookedCount}
            </p>
          </div>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load capacity data.
        </div>
      ) : !data || data.freelancers.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Gauge className="mx-auto h-10 w-10 text-slate-200 mb-3" />
          <p className="text-slate-400 text-sm">No active freelancers found.</p>
          <p className="text-slate-400 text-xs mt-1">Invite freelancer users from the Users page.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full bg-white text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600 w-52">Freelancer</th>
                <th className="text-center px-3 py-3 font-medium text-slate-600 w-20">Cap/wk</th>
                {data.weeks.map(w => (
                  <th key={w} className="text-center px-3 py-3 font-medium text-slate-600 min-w-[110px]">
                    <div>{formatWeekLabel(w)}</div>
                    <div className="text-xs text-slate-400 font-normal">Mon</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.freelancers.map((f, fi) => {
                const name = f.firstName || f.lastName
                  ? `${f.firstName ?? ""} ${f.lastName ?? ""}`.trim()
                  : f.email;
                const isExpanded = expanded?.userId === f.userId;
                const expandedWeek = isExpanded
                  ? f.weeks.find(w => w.weekStart === expanded?.weekStart)
                  : null;

                return (
                  <Fragment key={f.userId}>
                    <tr className={`border-b border-slate-100 ${fi % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 truncate max-w-[180px]" title={name}>{name}</div>
                        <div className="text-xs text-slate-400 truncate">{f.email}</div>
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600 font-medium">
                        {f.weeklyCapacityHours}h
                      </td>
                      {f.weeks.map(w => {
                        const isThisExpanded = isExpanded && expanded?.weekStart === w.weekStart;
                        const cls = utilColour(w.loggedHours === 0 ? 0 : w.utilization);
                        return (
                          <td key={w.weekStart} className="px-2 py-2 text-center">
                            <button
                              onClick={() => toggle(f.userId, w.weekStart)}
                              className={`inline-flex flex-col items-center justify-center w-full rounded-md border px-2 py-2 text-xs font-medium transition-all hover:opacity-80 ${cls} ${isThisExpanded ? "ring-2 ring-slate-500 ring-offset-1" : ""}`}
                              title={
                                w.projects.length > 0
                                  ? w.projects.map(p => `${p.projectName}: ${p.hours}h`).join(", ")
                                  : "No hours logged this week"
                              }
                              data-testid={`cell-capacity-${f.userId}-${w.weekStart}`}
                            >
                              <span className="font-semibold">{w.loggedHours}h</span>
                              <span className="opacity-75 text-[10px]">{w.utilization}%</span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={2 + data.weeks.length} className="px-6 py-3">
                          {!expandedWeek || expandedWeek.projects.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">
                              No hours logged for week of {expanded?.weekStart ? formatWeekLabel(expanded.weekStart) : ""}.
                            </p>
                          ) : (
                            <div className="flex items-center gap-4 flex-wrap">
                              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                Week of {formatWeekLabel(expanded!.weekStart)}
                              </span>
                              {expandedWeek.projects.map(p => (
                                <span
                                  key={p.projectId}
                                  className="inline-flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700"
                                >
                                  <span className="font-medium">{p.projectName}</span>
                                  <span className="text-slate-400">{p.hours}h</span>
                                </span>
                              ))}
                              <span className="text-xs text-slate-500">
                                Total: <strong>{expandedWeek.loggedHours}h</strong> / {f.weeklyCapacityHours}h ({expandedWeek.utilization}%)
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-200" />
          &lt;80% utilized
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-200" />
          80–100% (near capacity)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-200" />
          &gt;100% (overbooked)
        </span>
      </div>
    </div>
  );
}
