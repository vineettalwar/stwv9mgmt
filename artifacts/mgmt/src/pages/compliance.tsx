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
import { CheckCircle2, Clock, AlertCircle, Plus, RefreshCw, Shield, FileBarChart, Download, FileText } from "lucide-react";
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

function downloadTaxSummaryCsv(report: TaxSummaryReport) {
  const isGermany = report.regime === "germany";
  const header = isGermany
    ? "Rate Band,Invoices,Net Amount (Excl. Tax),Tax Collected,Gross Amount"
    : "GST Component,Invoices,Taxable Value,CGST,SGST,IGST,Tax Total,Gross Total";

  const rows = report.breakdown.map(b => {
    if (isGermany) {
      return [csvCell(b.label), csvCell(b.invoiceCount), csvCell(b.netAmount), csvCell(b.taxAmount), csvCell(b.grossAmount)].join(",");
    }
    return [
      csvCell(b.label), csvCell(b.invoiceCount), csvCell(b.netAmount),
      csvCell(b.cgst ?? ""), csvCell(b.sgst ?? ""), csvCell(b.igst ?? ""),
      csvCell(b.taxAmount), csvCell(b.grossAmount),
    ].join(",");
  });

  const summary = isGermany
    ? `\n\nTotals,${report.invoiceCount},${report.totalNet},${report.totalTax},${report.totalGross}`
    : `\n\nTotals,${report.invoiceCount},${report.totalNet},,,,${report.totalTax},${report.totalGross}`;

  const csv = [header, ...rows].join("\n") + summary;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tax-summary-${report.companyName.replace(/\s+/g, "-").toLowerCase()}-${report.periodStart}-to-${report.periodEnd}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TaxReportModal({ item }: { item: ComplianceItem }) {
  const [open, setOpen] = useState(false);
  const period = getPeriod(item);

  const { data: report, isLoading, isError } = useGetTaxSummary(
    {
      companyId: item.companyId,
      regime: item.regime as GetTaxSummaryRegime,
      periodStart: period?.periodStart ?? "",
      periodEnd: period?.periodEnd ?? "",
    },
    {
      query: {
        enabled: open && !!period,
        queryKey: ["taxSummary", item.companyId, item.regime, period?.periodStart, period?.periodEnd],
      },
    },
  );

  if (!period) return null;

  const isGermany = item.regime === "germany";
  const cur = report?.currency ?? (isGermany ? "EUR" : "INR");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1" data-testid={`btn-generate-report-${item.id}`}>
          <FileBarChart className="h-3 w-3" />
          Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-slate-500" />
            {isGermany ? "VAT Summary" : "GST Summary"} — {item.itemLabel}
          </DialogTitle>
        </DialogHeader>

        {!period && (
          <p className="text-sm text-slate-500">Cannot determine period for this item.</p>
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
                <div className="text-xl font-bold text-slate-900">{report.invoiceCount}</div>
                <div className="text-xs text-slate-400">{report.periodStart} → {report.periodEnd}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">Net Revenue</div>
                <div className="text-xl font-bold text-slate-900">{cur} {parseFloat(report.totalNet).toFixed(2)}</div>
                <div className="text-xs text-slate-400">Excl. tax</div>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide mb-1">Tax Collected</div>
                <div className="text-xl font-bold text-blue-800">{cur} {parseFloat(report.totalTax).toFixed(2)}</div>
                <div className="text-xs text-blue-400">Output {isGermany ? "VAT" : "GST"}</div>
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
                      {report.breakdown.map((b, idx) => (
                        <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          {isGermany ? (
                            <>
                              <td className="px-3 py-2.5 font-medium text-slate-800">{b.label}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{b.invoiceCount}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{cur} {parseFloat(b.netAmount).toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-blue-700">{cur} {parseFloat(b.taxAmount).toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-800 font-semibold">{cur} {parseFloat(b.grossAmount).toFixed(2)}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-2.5 font-medium text-slate-800">{b.label}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{b.invoiceCount}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{cur} {parseFloat(b.netAmount).toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{b.cgst ? `${cur} ${parseFloat(b.cgst).toFixed(2)}` : "—"}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{b.sgst ? `${cur} ${parseFloat(b.sgst).toFixed(2)}` : "—"}</td>
                              <td className="px-3 py-2.5 text-right text-slate-600">{b.igst ? `${cur} ${parseFloat(b.igst).toFixed(2)}` : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-medium text-blue-700">{cur} {parseFloat(b.taxAmount).toFixed(2)}</td>
                              <td className="px-3 py-2.5 text-right text-slate-800 font-semibold">{cur} {parseFloat(b.grossAmount).toFixed(2)}</td>
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
