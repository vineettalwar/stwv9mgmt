import { useState } from "react";
import { useGetMe, useListProjects, useListDeliverables, useListInvoices } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Building2, Download, FileText, FolderOpen, CheckCircle2, Circle, Clock, User } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  one_time: "One-Time",
  monthly_fixed: "Monthly Fixed",
  amc: "AMC",
  internal: "Internal",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-600" },
  on_hold: { label: "On Hold", className: "bg-amber-100 text-amber-800" },
};

const DELIVERABLE_ICONS: Record<string, React.ElementType> = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const DELIVERABLE_COLORS: Record<string, string> = {
  todo: "text-slate-400",
  in_progress: "text-amber-500",
  done: "text-emerald-500",
};

function ClientProjectCard({ project }: { project: { id: number; name: string; type: string; status: string; description?: string | null } }) {
  const { data: deliverables, isLoading } = useListDeliverables(project.id);

  const grouped = {
    todo: (deliverables ?? []).filter(d => d.status === "todo").length,
    in_progress: (deliverables ?? []).filter(d => d.status === "in_progress").length,
    done: (deliverables ?? []).filter(d => d.status === "done").length,
  };

  const statusInfo = STATUS_STYLES[project.status] ?? { label: project.status, className: "bg-slate-100 text-slate-600" };

  return (
    <Card data-testid={`client-project-${project.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
            </div>
            {project.description && (
              <p className="text-xs text-slate-500">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className={statusInfo.className}>{statusInfo.label}</Badge>
            <Badge variant="outline" className="text-xs">{TYPE_LABELS[project.type] ?? project.type}</Badge>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (deliverables ?? []).length > 0 ? (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-2">Deliverables</p>
            <div className="flex items-center gap-4">
              {(["todo", "in_progress", "done"] as const).map(status => {
                const Icon = DELIVERABLE_ICONS[status]!;
                const count = grouped[status];
                return (
                  <div key={status} className={`flex items-center gap-1 text-xs ${DELIVERABLE_COLORS[status]} font-medium`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{count} {status.replace("_", " ")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const STATUS_INVOICE_STYLES: Record<string, { label: string; className: string }> = {
  draft:     { label: "Draft",     className: "bg-slate-100 text-slate-600" },
  sent:      { label: "Sent",      className: "bg-blue-100 text-blue-700" },
  paid:      { label: "Paid",      className: "bg-emerald-100 text-emerald-800" },
  overdue:   { label: "Overdue",   className: "bg-red-100 text-red-700" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-400" },
};

export default function ClientPortal() {
  const { toast } = useToast();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { data: me, isLoading: meLoading } = useGetMe();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices();

  const assignedCompanies = me?.companies ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Client Portal
        </h1>
        <p className="text-sm text-slate-500">
          Welcome back{me?.firstName ? `, ${me.firstName}` : ""}. Here's an overview of your projects and deliverables.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Your Companies</CardTitle>
            <Building2 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {meLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-assigned-companies">
                {assignedCompanies.length}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {projectsLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-active-projects">
                {(projects ?? []).filter(p => p.status === "active").length}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Role</CardTitle>
            <User className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {meLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Client</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Your Projects</h2>
        {projectsLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : (projects ?? []).length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
            <FolderOpen className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">No projects yet</h3>
            <p className="mt-1 text-sm text-slate-500">Your assigned projects will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(projects ?? []).map(p => (
              <ClientProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Your Assigned Companies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {meLoading ? (
            <div className="space-y-3">
              {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : assignedCompanies.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No companies assigned yet. Contact your administrator.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignedCompanies.map(company => (
                <div
                  key={company.id}
                  data-testid={`client-company-${company.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-md border border-slate-100 bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{company.name}</div>
                    <div className="text-xs text-slate-500">{company.legalForm} · {company.country}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{company.currency}</Badge>
                    <Badge
                      variant="secondary"
                      className={
                        company.taxRegime === "vat"
                          ? "bg-blue-100 text-blue-700"
                          : company.taxRegime === "gst"
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                      }
                    >
                      {company.taxRegime.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
            <FileText className="h-4 w-4" /> Your Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoicesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (invoices ?? []).length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No invoices issued to you yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...(invoices ?? [])].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).map(inv => {
                const info = STATUS_INVOICE_STYLES[inv.status] ?? { label: inv.status, className: "bg-slate-100 text-slate-600" };
                return (
                  <div
                    key={inv.id}
                    data-testid={`client-invoice-${inv.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-md border border-slate-100 bg-slate-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{inv.invoiceNumber}</p>
                      <p className="text-xs text-slate-500">{inv.title} · {inv.issueDate}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">
                        {inv.currency} {parseFloat(inv.totalAmount).toFixed(2)}
                      </span>
                      <Badge variant="secondary" className={info.className}>{info.label}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadingId === inv.id}
                        data-testid={`button-client-download-pdf-${inv.id}`}
                        onClick={async () => {
                          setDownloadingId(inv.id);
                          try {
                            const { getToken } = (window as unknown as { __clerk?: { session?: { getToken: () => Promise<string> } } }).__clerk?.session ?? {};
                            const token = getToken ? await getToken() : null;
                            const res = await fetch(`/api/invoices/${inv.id}/pdf`, {
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            if (!res.ok) throw new Error("Download failed");
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `invoice-${inv.invoiceNumber}.pdf`;
                            a.click();
                            URL.revokeObjectURL(url);
                            toast({ title: "PDF downloaded" });
                          } catch {
                            toast({ title: "PDF download failed", variant: "destructive" });
                          } finally {
                            setDownloadingId(null);
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        {downloadingId === inv.id ? "…" : "PDF"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
