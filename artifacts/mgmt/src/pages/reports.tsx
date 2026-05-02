import { useState, useMemo } from "react";
import {
  useGetRevenueTrend,
  useGetProjectProfitability,
  useGetTimeSummary,
  useListCompanies,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Download } from "lucide-react";

const PALETTE = [
  "#1e3a5f", "#2e7d6b", "#c0742a", "#7c3aed", "#dc2626",
  "#0ea5e9", "#16a34a", "#db2777", "#475569", "#f59e0b",
];

function formatNumber(v: string | number, fractionDigits = 2) {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("en", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgoIso(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(url: string, fallbackFilename: string) {
  void (async () => {
    try {
      const blob = await customFetch<Blob>(url, { responseType: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fallbackFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    } catch {
      // best-effort export — surface failure quietly
    }
  })();
}

function CompanyFilter({
  value,
  onChange,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const { data: companies } = useListCompanies();
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs font-medium text-slate-600">Company</Label>
      <Select
        value={value ? String(value) : "all"}
        onValueChange={(v) => onChange(v === "all" ? undefined : parseInt(v))}
      >
        <SelectTrigger className="h-9 w-[200px]" data-testid="select-company-filter">
          <SelectValue placeholder="All companies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All companies</SelectItem>
          {companies?.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-slate-600">From</Label>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          className="h-9 w-[160px]"
          data-testid="input-start-date"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs font-medium text-slate-600">To</Label>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          className="h-9 w-[160px]"
          data-testid="input-end-date"
        />
      </div>
    </div>
  );
}

function RevenueReport() {
  const [months, setMonths] = useState(12);
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const { data, isLoading, isError } = useGetRevenueTrend({ months, companyId });
  const { data: companies } = useListCompanies();

  // Pivot: rows are months, columns are companies
  const { chartData, companyNames } = useMemo(() => {
    if (!data) return { chartData: [], companyNames: [] as string[] };
    const monthMap = new Map<string, Record<string, number | string>>();
    const names = new Set<string>();
    for (const p of data.points) {
      names.add(p.companyName);
      const row = monthMap.get(p.month) ?? { month: p.month };
      row[p.companyName] = parseFloat(p.total);
      monthMap.set(p.month, row);
    }
    return {
      chartData: Array.from(monthMap.values()).sort((a, b) => String(a.month).localeCompare(String(b.month))),
      companyNames: Array.from(names),
    };
  }, [data]);

  const companyExportSuffix = companyId ? `&companyId=${companyId}` : "";
  const totalThisYear = useMemo(() => {
    if (!data) return 0;
    return data.points.reduce((sum, p) => sum + parseFloat(p.total), 0);
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-slate-600">Period</Label>
            <Select value={String(months)} onValueChange={(v) => setMonths(parseInt(v))}>
              <SelectTrigger className="h-9 w-[160px]" data-testid="select-months">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 months</SelectItem>
                <SelectItem value="6">Last 6 months</SelectItem>
                <SelectItem value="12">Last 12 months</SelectItem>
                <SelectItem value="24">Last 24 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CompanyFilter value={companyId} onChange={setCompanyId} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(`/reports/export?type=revenue-trend&months=${months}${companyExportSuffix}`, `revenue-trend-${months}m.csv`)}
          data-testid="button-export-revenue"
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">
            Invoiced Revenue ({months} months)
            {companyId && companies ? ` · ${companies.find((c) => c.id === companyId)?.name ?? ""}` : ""}
          </CardTitle>
          <p className="text-xs text-slate-500">Total: {formatNumber(totalThisYear)}</p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : isError ? (
            <div className="text-sm text-destructive">Failed to load revenue data.</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip
                  formatter={(v: number) => formatNumber(v)}
                  contentStyle={{ fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {companyNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="rev" fill={PALETTE[i % PALETTE.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfitabilityReport() {
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState(monthsAgoIso(12));
  const [endDate, setEndDate] = useState(todayIso());
  const { data, isLoading, isError } = useGetProjectProfitability({
    companyId,
    startDate,
    endDate,
  });

  const exportQs = `type=project-profitability${companyId ? `&companyId=${companyId}` : ""}&startDate=${startDate}&endDate=${endDate}`;

  const totals = useMemo(() => {
    if (!data) return { invoiced: 0, cost: 0, expenseCost: 0, margin: 0 };
    return data.rows.reduce(
      (acc, r) => ({
        invoiced: acc.invoiced + parseFloat(r.totalInvoiced),
        cost: acc.cost + parseFloat(r.totalCost),
        expenseCost: acc.expenseCost + parseFloat(r.totalExpenseCost ?? "0"),
        margin: acc.margin + parseFloat(r.margin),
      }),
      { invoiced: 0, cost: 0, expenseCost: 0, margin: 0 },
    );
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <CompanyFilter value={companyId} onChange={setCompanyId} />
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(`/reports/export?${exportQs}`, "project-profitability.csv")}
          data-testid="button-export-profitability"
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Total Invoiced</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-slate-900" data-testid="profit-invoiced">{formatNumber(totals.invoiced)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Time Cost</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-slate-900" data-testid="profit-cost">{formatNumber(totals.cost)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Expense Cost</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-700" data-testid="profit-expense-cost">{formatNumber(totals.expenseCost)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">Net Margin</CardTitle></CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totals.margin >= 0 ? "text-emerald-700" : "text-red-600"}`} data-testid="profit-margin">
              {formatNumber(totals.margin)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-600">Project Profitability</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : isError ? (
            <div className="text-sm text-destructive">Failed to load profitability data.</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="text-sm text-slate-500 italic">No project data in this range.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Invoiced</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead className="text-right">Time Cost</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r) => {
                  const margin = parseFloat(r.margin);
                  const expCost = parseFloat(r.totalExpenseCost ?? "0");
                  return (
                    <TableRow key={r.projectId} data-testid={`row-project-${r.projectId}`}>
                      <TableCell className="font-medium">{r.projectName}</TableCell>
                      <TableCell className="text-slate-600">{r.companyName ?? "—"}</TableCell>
                      <TableCell className="text-slate-500 capitalize">{r.status.replace("_", " ")}</TableCell>
                      <TableCell className="text-right">{r.currency} {formatNumber(r.totalInvoiced)}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.totalHours, 1)}</TableCell>
                      <TableCell className="text-right">{r.currency} {formatNumber(r.totalCost)}</TableCell>
                      <TableCell className="text-right text-amber-700">{expCost > 0 ? `${r.currency} ${formatNumber(expCost)}` : "—"}</TableCell>
                      <TableCell className={`text-right font-semibold ${margin >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {r.currency} {formatNumber(r.margin)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TimeSummaryReport() {
  const [companyId, setCompanyId] = useState<number | undefined>(undefined);
  const [startDate, setStartDate] = useState(monthsAgoIso(1));
  const [endDate, setEndDate] = useState(todayIso());
  const { data, isLoading, isError } = useGetTimeSummary({ startDate, endDate, companyId });

  const exportQs = `type=time-summary${companyId ? `&companyId=${companyId}` : ""}&startDate=${startDate}&endDate=${endDate}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <CompanyFilter value={companyId} onChange={setCompanyId} />
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChange={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(`/reports/export?${exportQs}`, `time-summary-${startDate}_to_${endDate}.csv`)}
          data-testid="button-export-time"
        >
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Hours by Project</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> :
              isError ? <div className="text-sm text-destructive">Failed to load.</div> :
              !data || data.byProject.length === 0 ? <div className="text-sm text-slate-500 italic">No hours logged in this range.</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProject.map((r) => (
                    <TableRow key={r.projectId} data-testid={`time-project-${r.projectId}`}>
                      <TableCell className="font-medium">{r.projectName}</TableCell>
                      <TableCell className="text-slate-600">{r.companyName ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.totalHours, 1)}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-slate-600">Hours by Person</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48 w-full" /> :
              isError ? <div className="text-sm text-destructive">Failed to load.</div> :
              !data || data.byUser.length === 0 ? <div className="text-sm text-slate-500 italic">No hours logged in this range.</div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byUser.map((r) => (
                    <TableRow key={r.userId} data-testid={`time-user-${r.userId}`}>
                      <TableCell className="font-medium">{[r.firstName, r.lastName].filter(Boolean).join(" ") || r.email}</TableCell>
                      <TableCell className="text-slate-600 capitalize">{r.role.replace("_", " ")}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.totalHours, 1)}h</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Revenue trends, project profitability, and time tracking summaries.
        </p>
      </div>

      <Tabs defaultValue="revenue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue</TabsTrigger>
          <TabsTrigger value="profitability" data-testid="tab-profitability">Profitability</TabsTrigger>
          <TabsTrigger value="time" data-testid="tab-time">Time</TabsTrigger>
        </TabsList>
        <TabsContent value="revenue"><RevenueReport /></TabsContent>
        <TabsContent value="profitability"><ProfitabilityReport /></TabsContent>
        <TabsContent value="time"><TimeSummaryReport /></TabsContent>
      </Tabs>
    </div>
  );
}
