import { useGetMe, useListCompanies } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, FileText, Clock, User } from "lucide-react";

export default function ClientPortal() {
  const { data: me, isLoading: meLoading } = useGetMe();

  const assignedCompanies = me?.companies ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Client Portal
        </h1>
        <p className="text-sm text-slate-500">
          Welcome back{me?.firstName ? `, ${me.firstName}` : ""}. Here's an overview of your account.
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
            <CardTitle className="text-sm font-medium text-slate-600">Invoices</CardTitle>
            <FileText className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-400" data-testid="stat-invoices">—</div>
            <p className="text-xs text-slate-400 mt-1">Coming soon</p>
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
            <FileText className="h-4 w-4" /> Recent Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-400">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Invoice management is coming soon.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
