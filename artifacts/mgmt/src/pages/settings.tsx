import { useGetMe } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogOut, User, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { RoleBadge } from "@/pages/users";

export default function Settings() {
  const { data: me, isLoading } = useGetMe();
  const { signOut } = useClerk();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Your account and profile information.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <User className="h-4 w-4" /> Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading ? (
              <>
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </>
            ) : me ? (
              <>
                {[
                  { label: "Name", value: [me.firstName, me.lastName].filter(Boolean).join(" ") || "—" },
                  { label: "Email", value: me.email },
                  { label: "Status", value: me.isActive ? "Active" : "Inactive" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium text-slate-800" data-testid={`setting-${label.toLowerCase()}`}>
                      {value}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Role</span>
                  <RoleBadge role={me.role} />
                </div>
              </>
            ) : (
              <div className="text-slate-400 text-sm italic">Profile not available.</div>
            )}
          </CardContent>
        </Card>

        {me && me.companies && me.companies.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Your Companies
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {me.companies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0"
                  data-testid={`setting-company-${company.id}`}
                >
                  <span className="text-sm text-slate-700">{company.name}</span>
                  <Badge variant="outline" className="text-xs text-slate-500">
                    {company.country}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600">Session</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => signOut()}
            data-testid="button-sign-out"
            className="w-full"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
