import { useGetDashboardStats, useGetAdminDashboardStats, useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, Briefcase, Receipt, FileText, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

function formatCurrency(amount: string | number) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return n.toLocaleString("en", { minimumFractionDigits: 2 });
}

function AdminStatsSection() {
  const { data: stats, isLoading, isError } = useGetAdminDashboardStats();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      </div>
    );
  }

  if (isError || !stats) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-slate-700">Financial Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Pending Invoices</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900" data-testid="stat-pending-invoices">
              {stats.pendingInvoices.count}
            </div>
            <p className="text-xs text-slate-500 mt-1">€{formatCurrency(stats.pendingInvoices.totalAmount)} total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Overdue Invoices</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="stat-overdue-invoices">
              {stats.overdueInvoices.count}
            </div>
            <p className="text-xs text-slate-500 mt-1">€{formatCurrency(stats.overdueInvoices.totalAmount)} total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Open Offers</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900" data-testid="stat-open-offers">
              {stats.openOffers.count}
            </div>
            <p className="text-xs text-slate-500 mt-1">Awaiting response</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Hours This Month</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900" data-testid="stat-hours-month">
              {parseFloat(stats.hoursThisMonth || "0").toFixed(1)}h
            </div>
            <p className="text-xs text-slate-500 mt-1">Logged across all projects</p>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Alerts */}
      {(stats.upcomingCompliance > 0 || stats.overdueCompliance > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {stats.upcomingCompliance > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  {stats.upcomingCompliance} compliance deadline{stats.upcomingCompliance !== 1 ? "s" : ""} in the next 30 days
                </p>
                <Link href="/compliance" className="text-xs text-amber-700 underline">View compliance checklist →</Link>
              </div>
            </div>
          )}
          {stats.overdueCompliance > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-900">
                  {stats.overdueCompliance} compliance item{stats.overdueCompliance !== 1 ? "s" : ""} overdue
                </p>
                <Link href="/compliance" className="text-xs text-red-700 underline">View compliance checklist →</Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top pending invoices */}
      {stats.topPendingInvoices.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Receipt className="h-4 w-4" /> Outstanding Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="space-y-1">
              {(stats.topPendingInvoices as Record<string, unknown>[]).map((inv, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{String(inv.title ?? "")}</p>
                    <p className="text-xs text-slate-400">
                      {String(inv.invoice_number ?? "")}
                      {(inv.client_email || inv.client_first_name) ? ` · ${[inv.client_first_name, inv.client_last_name].filter(Boolean).join(" ") || inv.client_email}` : ""}
                      {inv.due_date ? ` · Due: ${String(inv.due_date)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{formatCurrency(String(inv.total_amount ?? "0"))}</span>
                    <Badge
                      className={
                        inv.status === "overdue"
                          ? "bg-red-100 text-red-800"
                          : "bg-blue-100 text-blue-800"
                      }
                    >
                      {String(inv.status ?? "")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: me } = useGetMe();
  const { data: stats, isLoading, isError } = useGetDashboardStats();

  const showAdminStats = me && ["admin", "germany_accountant", "india_accountant", "project_manager"].includes(me.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500">Overview of STWV platform statistics.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : isError || !stats ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load dashboard statistics.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total Companies</CardTitle>
                <Building2 className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900" data-testid="stat-companies">{stats.totalCompanies}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-slate-600">Total Users</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900" data-testid="stat-users">{stats.totalUsers}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Users by Role
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.usersByRole.map((roleStat) => (
                    <div key={roleStat.role} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700 capitalize">{roleStat.role.replace('_', ' ')}</span>
                      <span className="text-sm text-slate-500" data-testid={`stat-role-${roleStat.role}`}>{roleStat.count}</span>
                    </div>
                  ))}
                  {stats.usersByRole.length === 0 && (
                    <div className="text-sm text-slate-500 italic">No roles found.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Companies by Country
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.companiesByCountry.map((countryStat) => (
                    <div key={countryStat.country} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">{countryStat.country}</span>
                      <span className="text-sm text-slate-500" data-testid={`stat-country-${countryStat.country}`}>{countryStat.count}</span>
                    </div>
                  ))}
                  {stats.companiesByCountry.length === 0 && (
                    <div className="text-sm text-slate-500 italic">No companies found.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Admin / Accountant financial overview */}
      {showAdminStats && <AdminStatsSection />}
    </div>
  );
}
