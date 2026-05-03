import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCompliance,
  useUpdateComplianceItem,
  useSeedCompliance,
  useListCompanies,
  useGetTaxSummary,
  getListComplianceQueryKey,
  GetTaxSummaryRegime,
  type ComplianceItem,
  type TaxSummaryReport,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, AlertCircle, Plus, RefreshCw, Shield, FileBarChart, Download, FileText, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { generateTaxSummaryPdf } from "@/lib/pdf-generator";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-amber-100 text-amber-800" },
  filed: { label: "Filed", icon: CheckCircle2, className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", icon: AlertCircle, className: "bg-red-100 text-red-800" },
};

function formatDeadline(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function isOverdue(deadline: string, status: string) {
  return status !== "filed" && new Date(deadline) < new Date();
}

/** Derive the filing period start/end from compliance item fields */
function getPeriod(item: ComplianceItem): { periodStart: string; periodEnd: string } | null {
  const { year, quarter, month } = item;
  if (!year) return null;

  if (month != null) {
    const m = String(month).padStart(2, "0");
    const lastDay = new Date(year, month, 0).getDate();
    return { periodStart: `${year}-${m}-01`, periodEnd: `${year}-${m}-${lastDay}` };
  }

  if (quarter != null) {
    const quarterMap: Record<number, [string, string]> = {
      1: [`${year}-01-01`, `${year}-03-31`],
      2: [`${year}-04-01`, `${year}-06-30`],
      3: [`${year}-07-01`, `${year}-09-30`],
      4: [`${year}-10-01`, `${year}-12-31`],
    };
    const range = quarterMap[quarter];
    if (!range) return null;
    return { periodStart: range[0], periodEnd: range[1] };
  }

  // Annual — full year
  return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
}

/** Check if this compliance item is tax-filing related (has a reportable period) */
function isTaxFiling(item: ComplianceItem): boolean {
  const key = item.itemKey.toLowerCase();
  return key.includes("vat") || key.includes("gstr") || key.includes("gst");
}

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Format a numeric delta as a signed % string suitable for CSV/PDF cells. Returns "" when prev is missing. */
function deltaCell(currentStr: string | number, prevStr: string | number | null | undefined): string {
  if (prevStr === null || prevStr === undefined || prevStr === "") return "";
  const cur = typeof currentStr === "number" ? currentStr : parseFloat(String(currentStr));
  const prev = typeof prevStr === "number" ? prevStr : parseFloat(String(prevStr));
  if (Number.isNaN(cur) || Number.isNaN(prev)) return "";
  if (prev === 0 && cur === 0) return "0.0%";
  if (prev === 0) return "+100.0%";
  const change = ((cur - prev) / Math.abs(prev)) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function downloadTaxSummaryCsv(report: TaxSummaryReport) {
  const isGermany = report.regime === "germany";
  const prev = report.previousPeriod;
  const withPrev = !!prev;

  // Build prev-row lookup for cell-level matching by taxType+taxRate
  const prevByKey = new Map<string, NonNullable<typeof prev>["breakdown"][number]>();
  if (prev) for (const b of prev.breakdown) prevByKey.set(`${b.taxType}|${b.taxRate}`, b);

  const header = isGermany
    ? (withPrev
      ? "Rate Band,Invoices,Prev Invoices,Δ Invoices,Net Amount,Prev Net,Δ Net,Tax Collected,Prev Tax,Δ Tax,Gross Amount,Prev Gross,Δ Gross"
      : "Rate Band,Invoices,Net Amount (Excl. Tax),Tax Collected,Gross Amount")
    : (withPrev
      ? "GST Component,Invoices,Prev Invoices,Δ Invoices,Taxable,Prev Taxable,Δ Taxable,CGST,Prev CGST,Δ CGST,SGST,Prev SGST,Δ SGST,IGST,Prev IGST,Δ IGST,Tax Total,Prev Tax,Δ Tax,Gross Total,Prev Gross,Δ Gross"
      : "GST Component,Invoices,Taxable Value,CGST,SGST,IGST,Tax Total,Gross Total");

  // Build row arrays — include all current rows plus any prev-only rows (taxType+rate present in prev but not current)
  const allRows: Array<{ cur: typeof report.breakdown[number] | null; prv: typeof report.breakdown[number] | null; label: string }> = [];
  for (const b of report.breakdown) {
    allRows.push({ cur: b, prv: prevByKey.get(`${b.taxType}|${b.taxRate}`) ?? null, label: b.label });
  }
  if (prev) {
    for (const pb of prev.breakdown) {
      if (!report.breakdown.some(b => b.taxType === pb.taxType && b.taxRate === pb.taxRate)) {
        allRows.push({ cur: null, prv: pb, label: `${pb.label} (prev only)` });
      }
    }
  }

  const rows = allRows.map(({ cur, prv, label }) => {
    if (isGermany) {
      if (!withPrev && cur) {
        return [csvCell(label), csvCell(cur.invoiceCount), csvCell(cur.netAmount), csvCell(cur.taxAmount), csvCell(cur.grossAmount)].join(",");
      }
      const inv = cur?.invoiceCount ?? 0;
      const net = cur?.netAmount ?? "0";
      const tax = cur?.taxAmount ?? "0";
      const gross = cur?.grossAmount ?? "0";
      return [
        csvCell(label),
        csvCell(inv), csvCell(prv?.invoiceCount ?? ""), csvCell(deltaCell(inv, prv?.invoiceCount)),
        csvCell(net), csvCell(prv?.netAmount ?? ""), csvCell(deltaCell(net, prv?.netAmount)),
        csvCell(tax), csvCell(prv?.taxAmount ?? ""), csvCell(deltaCell(tax, prv?.taxAmount)),
        csvCell(gross), csvCell(prv?.grossAmount ?? ""), csvCell(deltaCell(gross, prv?.grossAmount)),
      ].join(",");
    }
    if (!withPrev && cur) {
      return [
        csvCell(label), csvCell(cur.invoiceCount), csvCell(cur.netAmount),
        csvCell(cur.cgst ?? ""), csvCell(cur.sgst ?? ""), csvCell(cur.igst ?? ""),
        csvCell(cur.taxAmount), csvCell(cur.grossAmount),
      ].join(",");
    }
    const inv = cur?.invoiceCount ?? 0;
    const net = cur?.netAmount ?? "0";
    const cgst = cur?.cgst ?? "";
    const sgst = cur?.sgst ?? "";
    const igst = cur?.igst ?? "";
    const tax = cur?.taxAmount ?? "0";
    const gross = cur?.grossAmount ?? "0";
    return [
      csvCell(label),
      csvCell(inv), csvCell(prv?.invoiceCount ?? ""), csvCell(deltaCell(inv, prv?.invoiceCount)),
      csvCell(net), csvCell(prv?.netAmount ?? ""), csvCell(deltaCell(net, prv?.netAmount)),
      csvCell(cgst), csvCell(prv?.cgst ?? ""), csvCell(deltaCell(cgst || 0, prv?.cgst)),
      csvCell(sgst), csvCell(prv?.sgst ?? ""), csvCell(deltaCell(sgst || 0, prv?.sgst)),
      csvCell(igst), csvCell(prv?.igst ?? ""), csvCell(deltaCell(igst || 0, prv?.igst)),
      csvCell(tax), csvCell(prv?.taxAmount ?? ""), csvCell(deltaCell(tax, prv?.taxAmount)),
      csvCell(gross), csvCell(prv?.grossAmount ?? ""), csvCell(deltaCell(gross, prv?.grossAmount)),
    ].join(",");
  });

  let summary: string;
  if (isGermany) {
    summary = withPrev && prev
      ? `\n\nTotals,${report.invoiceCount},${prev.invoiceCount},${deltaCell(report.invoiceCount, prev.invoiceCount)},${report.totalNet},${prev.totalNet},${deltaCell(report.totalNet, prev.totalNet)},${report.totalTax},${prev.totalTax},${deltaCell(report.totalTax, prev.totalTax)},${report.totalGross},${prev.totalGross},${deltaCell(report.totalGross, prev.totalGross)}`
      : `\n\nTotals,${report.invoiceCount},${report.totalNet},${report.totalTax},${report.totalGross}`;
  } else {
    summary = withPrev && prev
      ? `\n\nTotals,${report.invoiceCount},${prev.invoiceCount},${deltaCell(report.invoiceCount, prev.invoiceCount)},${report.totalNet},${prev.totalNet},${deltaCell(report.totalNet, prev.totalNet)},,,,,,,,,,${report.totalTax},${prev.totalTax},${deltaCell(report.totalTax, prev.totalTax)},${report.totalGross},${prev.totalGross},${deltaCell(report.totalGross, prev.totalGross)}`
      : `\n\nTotals,${report.invoiceCount},${report.totalNet},,,,${report.totalTax},${report.totalGross}`;
  }

  // Prepend a comparison header line so spreadsheets clearly show which periods are involved.
  const meta = withPrev && prev
    ? `Period,${report.periodStart} to ${report.periodEnd}\nPrev Period,${prev.periodStart} to ${prev.periodEnd}\n\n`
    : "";

  const csv = meta + [header, ...rows].join("\n") + summary;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = report.companyName.replace(/\s+/g, "-").toLowerCase();
  const suffix = withPrev ? "-vs-prior" : "";
  a.href = url;
  a.download = `tax-summary-${safeName}-${report.periodStart}-to-${report.periodEnd}${suffix}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Compute the previous calendar period for monthly or quarterly compliance items. Returns null for annual items. */
function getPreviousPeriod(item: ComplianceItem): { periodStart: string; periodEnd: string } | null {
  const { year, quarter, month } = item;
  if (!year) return null;

  if (month != null) {
    let py = year;
    let pm = month - 1;
    if (pm === 0) { py -= 1; pm = 12; }
    const mm = String(pm).padStart(2, "0");
    const lastDay = new Date(py, pm, 0).getDate();
    return { periodStart: `${py}-${mm}-01`, periodEnd: `${py}-${mm}-${lastDay}` };
  }

  if (quarter != null) {
    let pq = quarter - 1;
    let py = year;
    if (pq === 0) { pq = 4; py -= 1; }
    const ranges: Record<number, [string, string]> = {
      1: [`${py}-01-01`, `${py}-03-31`],
      2: [`${py}-04-01`, `${py}-06-30`],
      3: [`${py}-07-01`, `${py}-09-30`],
      4: [`${py}-10-01`, `${py}-12-31`],
    };
    const r = ranges[pq];
    if (!r) return null;
    return { periodStart: r[0], periodEnd: r[1] };
  }

  return null; // annual — no comparison
}

/** Compute the same period in the prior year (year-1). Works for monthly, quarterly, and annual items. */
function getYoYPeriod(item: ComplianceItem): { periodStart: string; periodEnd: string } | null {
  const { year, quarter, month } = item;
  if (!year) return null;
  const py = year - 1;

  if (month != null) {
    const m = String(month).padStart(2, "0");
    const lastDay = new Date(py, month, 0).getDate();
    return { periodStart: `${py}-${m}-01`, periodEnd: `${py}-${m}-${lastDay}` };
  }

  if (quarter != null) {
    const ranges: Record<number, [string, string]> = {
      1: [`${py}-01-01`, `${py}-03-31`],
      2: [`${py}-04-01`, `${py}-06-30`],
      3: [`${py}-07-01`, `${py}-09-30`],
      4: [`${py}-10-01`, `${py}-12-31`],
    };
    const r = ranges[quarter];
    if (!r) return null;
    return { periodStart: r[0], periodEnd: r[1] };
  }

  // Annual — full prior calendar year
  return { periodStart: `${py}-01-01`, periodEnd: `${py}-12-31` };
}

type CompareMode = "off" | "prev" | "yoy";

/** Returns delta info or null if previous is unavailable. */
function computeDelta(current: number, previous: number | null | undefined): { pct: number; dir: "up" | "down" | "flat" } | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0 && current === 0) return { pct: 0, dir: "flat" };
  if (previous === 0) return { pct: 100, dir: "up" };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 0.05) return { pct: 0, dir: "flat" };
  return { pct: Math.abs(change), dir: change > 0 ? "up" : "down" };
}

function DeltaBadge({ delta, neutral = false }: { delta: { pct: number; dir: "up" | "down" | "flat" } | null; neutral?: boolean }) {
  if (!delta) return null;
  if (delta.dir === "flat") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400" title="No change vs prior period">
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const Icon = delta.dir === "up" ? TrendingUp : TrendingDown;
  const color = neutral
    ? "text-slate-500"
    : delta.dir === "up" ? "text-emerald-600" : "text-red-600";
  const arrow = delta.dir === "up" ? "▲" : "▼";
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${color}`} title={`${delta.dir === "up" ? "Up" : "Down"} ${delta.pct.toFixed(1)}% vs prior period`}>
      <Icon className="h-3 w-3" />
      {arrow} {delta.pct.toFixed(1)}%
    </span>
  );
}

function TaxReportModal({ item }: { item: ComplianceItem }) {
  const [open, setOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>("off");
  const period = getPeriod(item);
  const prevPeriodOpt = getPreviousPeriod(item);
  const yoyPeriodOpt = getYoYPeriod(item);
  const canPrev = !!prevPeriodOpt;
  const canYoY = !!yoyPeriodOpt;
  const canCompare = canPrev || canYoY;

  // Resolve the active comparison range based on the selected mode.
  const activePrev =
    compareMode === "prev" ? prevPeriodOpt :
    compareMode === "yoy" ? yoyPeriodOpt :
    null;
  const useCompare = !!activePrev;

  const { data: report, isLoading, isError } = useGetTaxSummary(
    {
      companyId: item.companyId,
      regime: item.regime as GetTaxSummaryRegime,
      periodStart: period?.periodStart ?? "",
      periodEnd: period?.periodEnd ?? "",
      ...(useCompare && activePrev ? { prevPeriodStart: activePrev.periodStart, prevPeriodEnd: activePrev.periodEnd } : {}),
    },
    {
      query: {
        enabled: open && !!period,
        queryKey: [
          "taxSummary",
          item.companyId,
          item.regime,
          period?.periodStart,
          period?.periodEnd,
          compareMode,
          useCompare ? activePrev?.periodStart : null,
          useCompare ? activePrev?.periodEnd : null,
        ],
      },
    },
  );

  const compareLabel =
    compareMode === "prev" ? "previous period" :
    compareMode === "yoy" ? "same period last year" :
    "previous period";

  if (!period) return null;

  const isGermany = item.regime === "germany";
  const cur = report?.currency ?? (isGermany ? "EUR" : "INR");
  const prev = report?.previousPeriod;

  // Build a lookup of prev breakdown rows keyed by "taxType|taxRate" for cell-level comparison.
  const prevByKey = new Map<string, NonNullable<typeof prev>["breakdown"][number]>();
  if (prev) {
    for (const b of prev.breakdown) prevByKey.set(`${b.taxType}|${b.taxRate}`, b);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" data-testid={`btn-generate-report-${item.id}`}>
          <FileBarChart className="h-3 w-3" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-slate-500" />
            {isGermany ? "VAT Summary" : "GST Summary"} — {item.itemLabel}
          </DialogTitle>
        </DialogHeader>

        {!period && (
          <p className="text-sm text-slate-500">Cannot determine period for this item.</p>
        )}

        {/* Comparison mode selector — segmented control with Off / Previous / YoY */}
        {canCompare && (
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-700">Compare to</div>
              <p className="text-xs text-slate-400 truncate">
                {activePrev
                  ? <>vs {compareLabel}: {activePrev.periodStart} → {activePrev.periodEnd}</>
                  : "Show only the current period"}
              </p>
            </div>
            <div
              role="radiogroup"
              aria-label="Comparison mode"
              className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 shrink-0"
              data-testid={`compare-mode-${item.id}`}
            >
              {([
                { val: "off" as const, label: "Off", enabled: true },
                { val: "prev" as const, label: "Previous period", enabled: canPrev },
                { val: "yoy" as const, label: "Last year", enabled: canYoY },
              ]).map(opt => {
                const active = compareMode === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!opt.enabled}
                    onClick={() => opt.enabled && setCompareMode(opt.val)}
                    title={opt.enabled ? undefined : "Not available for this filing period"}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                      active
                        ? "bg-slate-900 text-white"
                        : opt.enabled
                          ? "text-slate-600 hover:bg-slate-100"
                          : "text-slate-300 cursor-not-allowed"
                    }`}
                    data-testid={`compare-mode-${opt.val}-${item.id}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3 py-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {isError && !isLoading && (
          <div className="py-6 text-center">
            <AlertCircle className="h-8 w-8 mx-auto text-red-400 mb-2" />
            <p className="text-sm text-red-600 font-medium">Failed to load tax summary</p>
            <p className="text-xs text-slate-400 mt-1">Check that the company and period are correct.</p>
          </div>
        )}

        {report && !isLoading && (
          <div className="space-y-5 pt-1">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Invoices</div>
                <div className="flex items-baseline gap-2">
                  <div className="text-xl font-bold text-slate-900">{report.invoiceCount}</div>
                  {prev && <DeltaBadge delta={computeDelta(report.invoiceCount, prev.invoiceCount)} />}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{report.periodStart} → {report.periodEnd}</div>
                {prev && <div className="text-[10px] text-slate-400">prev: {prev.invoiceCount}</div>}
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Net Revenue</div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-xl font-bold text-slate-900">{cur} {parseFloat(report.totalNet).toFixed(2)}</div>
                  {prev && <DeltaBadge delta={computeDelta(parseFloat(report.totalNet), parseFloat(prev.totalNet))} />}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Excl. tax</div>
                {prev && <div className="text-[10px] text-slate-400">prev: {cur} {parseFloat(prev.totalNet).toFixed(2)}</div>}
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Tax Collected</div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <div className="text-xl font-bold text-blue-800">{cur} {parseFloat(report.totalTax).toFixed(2)}</div>
                  {prev && <DeltaBadge delta={computeDelta(parseFloat(report.totalTax), parseFloat(prev.totalTax))} neutral />}
                </div>
                <div className="text-xs text-blue-400 mt-0.5">Output {isGermany ? "VAT" : "GST"}</div>
                {prev && <div className="text-[10px] text-blue-400/80">prev: {cur} {parseFloat(prev.totalTax).toFixed(2)}</div>}
              </div>
            </div>

            {/* Breakdown table */}
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                {isGermany ? "VAT Breakdown by Rate Band" : "GST Breakdown by Component"}
              </h3>
              {report.breakdown.length === 0 ? (
                <div className="rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
                  No invoices found in this period for this company.
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      {isGermany ? (
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rate Band</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoices</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Net (Excl. Tax)</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tax (MwSt)</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross Total</th>
                        </tr>
                      ) : (
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">GST Component</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Inv.</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Taxable</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">CGST</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">SGST</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">IGST</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tax Total</th>
                          <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Gross</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {report.breakdown.map((b, idx) => {
                        const pb = prevByKey.get(`${b.taxType}|${b.taxRate}`);
                        const renderAmt = (cur: string, val: string, prevVal?: string | null, opts?: { neutral?: boolean }) => {
                          const main = `${cur} ${parseFloat(val).toFixed(2)}`;
                          if (!prev) return main;
                          const prevNum = prevVal != null ? parseFloat(prevVal) : 0;
                          return (
                            <div className="flex flex-col items-end leading-tight">
                              <span>{main}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-slate-400">prev: {cur} {prevNum.toFixed(2)}</span>
                                <DeltaBadge delta={computeDelta(parseFloat(val), prevNum)} neutral={opts?.neutral} />
                              </div>
                            </div>
                          );
                        };
                        const renderCount = (val: number, prevVal?: number) => {
                          if (!prev) return val;
                          const pv = prevVal ?? 0;
                          return (
                            <div className="flex flex-col items-end leading-tight">
                              <span>{val}</span>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-slate-400">prev: {pv}</span>
                                <DeltaBadge delta={computeDelta(val, pv)} />
                              </div>
                            </div>
                          );
                        };
                        return (
                          <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 align-top">
                            {isGermany ? (
                              <>
                                <td className="px-3 py-2.5 font-medium text-slate-800">{b.label}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{renderCount(b.invoiceCount, pb?.invoiceCount)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{renderAmt(cur, b.netAmount, pb?.netAmount)}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-blue-700">{renderAmt(cur, b.taxAmount, pb?.taxAmount, { neutral: true })}</td>
                                <td className="px-3 py-2.5 text-right text-slate-800 font-semibold">{renderAmt(cur, b.grossAmount, pb?.grossAmount)}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 font-medium text-slate-800">{b.label}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{renderCount(b.invoiceCount, pb?.invoiceCount)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{renderAmt(cur, b.netAmount, pb?.netAmount)}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{b.cgst ? renderAmt(cur, b.cgst, pb?.cgst, { neutral: true }) : "—"}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{b.sgst ? renderAmt(cur, b.sgst, pb?.sgst, { neutral: true }) : "—"}</td>
                                <td className="px-3 py-2.5 text-right text-slate-600">{b.igst ? renderAmt(cur, b.igst, pb?.igst, { neutral: true }) : "—"}</td>
                                <td className="px-3 py-2.5 text-right font-medium text-blue-700">{renderAmt(cur, b.taxAmount, pb?.taxAmount, { neutral: true })}</td>
                                <td className="px-3 py-2.5 text-right text-slate-800 font-semibold">{renderAmt(cur, b.grossAmount, pb?.grossAmount)}</td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      {/* Rows that exist in previous period only (no current activity) */}
                      {prev && prev.breakdown
                        .filter(pb => !report.breakdown.some(b => b.taxType === pb.taxType && b.taxRate === pb.taxRate))
                        .map((pb, idx) => (
                          <tr key={`prev-only-${idx}`} className="border-b border-slate-100 last:border-0 bg-slate-50/40 italic align-top">
                            {isGermany ? (
                              <>
                                <td className="px-3 py-2.5 font-medium text-slate-500">{pb.label} <span className="text-[10px] not-italic">(prev only)</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">0 <span className="text-[10px] block text-slate-400">prev: {pb.invoiceCount}</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block text-slate-400">prev: {cur} {parseFloat(pb.netAmount).toFixed(2)}</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block text-slate-400">prev: {cur} {parseFloat(pb.taxAmount).toFixed(2)}</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block text-slate-400">prev: {cur} {parseFloat(pb.grossAmount).toFixed(2)}</span></td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-2.5 font-medium text-slate-500">{pb.label} <span className="text-[10px] not-italic">(prev only)</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">0</td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.netAmount).toFixed(2)}</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">{pb.cgst ? <>— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.cgst).toFixed(2)}</span></> : "—"}</td>
                                <td className="px-3 py-2.5 text-right text-slate-400">{pb.sgst ? <>— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.sgst).toFixed(2)}</span></> : "—"}</td>
                                <td className="px-3 py-2.5 text-right text-slate-400">{pb.igst ? <>— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.igst).toFixed(2)}</span></> : "—"}</td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.taxAmount).toFixed(2)}</span></td>
                                <td className="px-3 py-2.5 text-right text-slate-400">— <span className="text-[10px] block">prev: {cur} {parseFloat(pb.grossAmount).toFixed(2)}</span></td>
                              </>
                            )}
                          </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                      {isGermany ? (
                        <tr>
                          <td className="px-3 py-2.5 font-bold text-slate-900">Total</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{report.invoiceCount}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{cur} {parseFloat(report.totalNet).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-800">{cur} {parseFloat(report.totalTax).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{cur} {parseFloat(report.totalGross).toFixed(2)}</td>
                        </tr>
                      ) : (
                        <tr>
                          <td className="px-3 py-2.5 font-bold text-slate-900">Total</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{report.invoiceCount}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{cur} {parseFloat(report.totalNet).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">—</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">—</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">—</td>
                          <td className="px-3 py-2.5 text-right font-bold text-blue-800">{cur} {parseFloat(report.totalTax).toFixed(2)}</td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">{cur} {parseFloat(report.totalGross).toFixed(2)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Note */}
            <p className="text-xs text-slate-400 italic">
              {isGermany
                ? "Output VAT on sales invoices only. Input tax credits (Vorsteuer) are not included. Excludes draft and cancelled invoices."
                : "Output GST on sales invoices only. Input Tax Credit (ITC) is not included. Excludes draft and cancelled invoices."}
            </p>

            {/* Download buttons */}
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTaxSummaryCsv(report)}
                className="gap-1.5"
                data-testid={`btn-download-csv-${item.id}`}
              >
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
              <Button
                size="sm"
                onClick={() => generateTaxSummaryPdf(report as Parameters<typeof generateTaxSummaryPdf>[0])}
                className="gap-1.5"
                data-testid={`btn-download-pdf-${item.id}`}
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ComplianceRow({ item, onUpdate, isAccountant }: { item: ComplianceItem; onUpdate: () => void; isAccountant: boolean }) {
  const { toast } = useToast();
  const { mutate: updateItem, isPending } = useUpdateComplianceItem({
    mutation: {
      onSuccess: () => { toast({ title: "Status updated" }); onUpdate(); },
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    },
  });

  const statusConfig = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending!;
  const StatusIcon = statusConfig.icon;
  const effectiveOverdue = isOverdue(item.deadline, item.status);
  const showReport = isAccountant && isTaxFiling(item);

  function toggleFiled() {
    if (item.status === "filed") {
      updateItem({ id: item.id, data: { status: "pending", filedAt: null } });
    } else {
      updateItem({ id: item.id, data: { status: "filed" } });
    }
  }

  return (
    <div className={`flex items-center gap-3 py-3 px-4 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${effectiveOverdue && item.status !== "filed" ? "bg-red-50/40" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{item.itemLabel}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-slate-500">Due: {formatDeadline(item.deadline)}</span>
          {item.responsibleUser && (
            <span className="text-xs text-slate-400">
              Responsible: {[item.responsibleUser.firstName, item.responsibleUser.lastName].filter(Boolean).join(" ") || item.responsibleUser.email}
            </span>
          )}
          {item.filedAt && (
            <span className="text-xs text-emerald-600">Filed: {new Date(item.filedAt).toLocaleDateString()}</span>
          )}
        </div>
        {item.notes && <p className="text-xs text-slate-400 mt-1 italic">{item.notes}</p>}
      </div>
      <Badge
        className={`text-xs shrink-0 ${effectiveOverdue && item.status !== "filed" ? "bg-red-100 text-red-800" : statusConfig.className}`}
      >
        <StatusIcon className="h-3 w-3 mr-1" />
        {effectiveOverdue && item.status !== "filed" ? "Overdue" : statusConfig.label}
      </Badge>
      {showReport && <TaxReportModal item={item} />}
      <Button
        size="sm"
        variant={item.status === "filed" ? "outline" : "default"}
        disabled={isPending}
        onClick={toggleFiled}
        className="shrink-0 h-7 text-xs"
        data-testid={`compliance-toggle-${item.id}`}
      >
        {item.status === "filed" ? "Unfile" : "Mark Filed"}
      </Button>
    </div>
  );
}

function SeedDialog({ onSeeded }: { onSeeded: () => void }) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState<string>("");
  const [regime, setRegime] = useState<string>("");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const { data: companies } = useListCompanies();
  const { toast } = useToast();

  const { mutate: seed, isPending } = useSeedCompliance({
    mutation: {
      onSuccess: (items) => {
        toast({ title: `Seeded ${items.length} compliance items` });
        setOpen(false);
        onSeeded();
      },
      onError: () => toast({ title: "Failed to seed", variant: "destructive" }),
    },
  });

  function handleSeed() {
    if (!companyId || !regime || !year) return;
    seed({ data: { companyId: parseInt(companyId), regime, year: parseInt(year) } });
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-seed-compliance">
          <Plus className="h-4 w-4 mr-2" /> Seed Checklist
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Seed Compliance Checklist</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Company *</label>
            <Select onValueChange={setCompanyId} value={companyId}>
              <SelectTrigger data-testid="select-compliance-company">
                <SelectValue placeholder="Select company..." />
              </SelectTrigger>
              <SelectContent>
                {(companies ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Regime *</label>
            <Select onValueChange={setRegime} value={regime}>
              <SelectTrigger data-testid="select-compliance-regime">
                <SelectValue placeholder="Select regime..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="germany">Germany (VAT + Körperschaftsteuer)</SelectItem>
                <SelectItem value="india">India (GSTR-3B + GSTR-1)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1.5">Year *</label>
            <Select onValueChange={setYear} value={year}>
              <SelectTrigger data-testid="select-compliance-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSeed} disabled={isPending || !companyId || !regime} data-testid="button-confirm-seed">
              {isPending ? "Seeding..." : "Seed"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Compliance() {
  const { data: me } = useGetMe();
  const { data: companies } = useListCompanies();
  const queryClient = useQueryClient();

  const [regime, setRegime] = useState<string>("all");
  const [companyId, setCompanyId] = useState<string>("all");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));

  const { data: items, isLoading } = useListCompliance({
    ...(regime !== "all" ? { regime } : {}),
    ...(companyId !== "all" ? { companyId: parseInt(companyId) } : {}),
    ...(year ? { year: parseInt(year) } : {}),
  });

  function refetch() {
    queryClient.invalidateQueries({ queryKey: getListComplianceQueryKey() });
  }

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const pending = (items ?? []).filter(i => i.status === "pending").length;
  const filed = (items ?? []).filter(i => i.status === "filed").length;
  const overdue = (items ?? []).filter(i => isOverdue(i.deadline, i.status)).length;

  const germanyItems = (items ?? []).filter(i => i.regime === "germany");
  const indiaItems = (items ?? []).filter(i => i.regime === "india");

  const isAccountant = me?.role === "germany_accountant" || me?.role === "india_accountant" || me?.role === "admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Compliance</h1>
          <p className="text-sm text-slate-500">Track tax deadlines and filing status.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch} data-testid="button-refresh-compliance">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <SeedDialog onSeeded={refetch} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900" data-testid="stat-compliance-pending">{pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Filed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900" data-testid="stat-compliance-filed">{filed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="stat-compliance-overdue">{overdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={regime} onValueChange={setRegime}>
          <SelectTrigger className="w-40" data-testid="filter-compliance-regime">
            <SelectValue placeholder="All regimes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regimes</SelectItem>
            <SelectItem value="germany">Germany</SelectItem>
            <SelectItem value="india">India</SelectItem>
          </SelectContent>
        </Select>

        <Select value={companyId} onValueChange={setCompanyId}>
          <SelectTrigger className="w-44" data-testid="filter-compliance-company">
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {(companies ?? []).map(c => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (items ?? []).length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-16 text-center">
          <Shield className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No compliance items</h3>
          <p className="mt-1 text-sm text-slate-500">Use "Seed Checklist" to populate items for a company and regime.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {regime !== "india" && germanyItems.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  🇩🇪 Germany — VAT &amp; Annual Filings
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-0">
                {germanyItems.map(item => (
                  <ComplianceRow key={item.id} item={item} onUpdate={refetch} isAccountant={isAccountant} />
                ))}
              </CardContent>
            </Card>
          )}

          {regime !== "germany" && indiaItems.length > 0 && (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  🇮🇳 India — GST Filings
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2 pb-0">
                {indiaItems.map(item => (
                  <ComplianceRow key={item.id} item={item} onUpdate={refetch} isAccountant={isAccountant} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
