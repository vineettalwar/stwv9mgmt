import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCompliance,
  useUpdateComplianceItem,
  useSeedCompliance,
  useListCompanies,
  useListUsers,
  getListComplianceQueryKey,
  type ComplianceItem,
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
import { CheckCircle2, Clock, AlertCircle, Plus, RefreshCw, Shield } from "lucide-react";

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

function ComplianceRow({ item, onUpdate }: { item: ComplianceItem; onUpdate: () => void }) {
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
                  <ComplianceRow key={item.id} item={item} onUpdate={refetch} />
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
                  <ComplianceRow key={item.id} item={item} onUpdate={refetch} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
