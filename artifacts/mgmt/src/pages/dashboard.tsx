import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboardStats();

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
    </div>
  );
}
