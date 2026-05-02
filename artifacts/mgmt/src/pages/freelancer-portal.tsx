import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Clock, DollarSign, User } from "lucide-react";

export default function FreelancerPortal() {
  const { data: me, isLoading: meLoading } = useGetMe();

  const assignedCompanies = me?.companies ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Freelancer Portal
        </h1>
        <p className="text-sm text-slate-500">
          Welcome back{me?.firstName ? `, ${me.firstName}` : ""}. Track your work and earnings here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Assigned Companies</CardTitle>
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
            <CardTitle className="text-sm font-medium text-slate-600">Hours Logged</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-400" data-testid="stat-hours-logged">—</div>
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
              <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100">Freelancer</Badge>
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
                  data-testid={`freelancer-company-${company.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-md border border-slate-100 bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-800">{company.name}</div>
                    <div className="text-xs text-slate-500">{company.legalForm} · {company.country}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{company.currency}</Badge>
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
            <Clock className="h-4 w-4" /> Hours Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-slate-400">
            <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Hours tracking is coming soon. You will be able to log time against projects here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
