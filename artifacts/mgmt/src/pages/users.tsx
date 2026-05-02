import { useListUsers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const ROLE_STYLES: Record<string, { label: string; className: string }> = {
  admin: { label: "Admin", className: "bg-violet-100 text-violet-800 hover:bg-violet-100" },
  germany_accountant: { label: "DE Accountant", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
  india_accountant: { label: "IN Accountant", className: "bg-cyan-100 text-cyan-800 hover:bg-cyan-100" },
  project_manager: { label: "Project Manager", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  client: { label: "Client", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
  freelancer: { label: "Freelancer", className: "bg-rose-100 text-rose-800 hover:bg-rose-100" },
};

export function RoleBadge({ role }: { role: string }) {
  const info = ROLE_STYLES[role] ?? { label: role, className: "bg-slate-100 text-slate-800" };
  return (
    <Badge variant="secondary" className={info.className} data-testid={`badge-role-${role}`}>
      {info.label}
    </Badge>
  );
}

export default function Users() {
  const { data: users, isLoading, isError } = useListUsers();
  const [search, setSearch] = useState("");

  const filtered = (users ?? []).filter((u) => {
    const q = search.toLowerCase();
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    return (
      !q ||
      name.includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">All platform users and their roles.</p>
        </div>
      </div>

      <div className="max-w-sm">
        <Input
          data-testid="input-search-users"
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load users.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            {search ? "No users match your search" : "No users yet"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {search ? "Try a different search term." : "Users will appear here once they sign in."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map((user) => (
            <Link key={user.id} href={`/users/${user.id}`}>
              <a data-testid={`card-user-${user.id}`} className="block group">
                <Card className="transition-all duration-200 hover:border-slate-300 hover:shadow-sm">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-semibold text-sm flex-shrink-0">
                        {user.firstName?.[0] ?? user.email[0].toUpperCase()}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900" data-testid={`text-username-${user.id}`}>
                            {user.firstName || user.lastName
                              ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
                              : "—"}
                          </span>
                          <RoleBadge role={user.role} />
                          {!user.isActive && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-400 text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">{user.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {user.companies && user.companies.length > 0 && (
                        <div className="hidden sm:flex flex-wrap gap-1 max-w-xs justify-end">
                          {user.companies.slice(0, 2).map((c) => (
                            <Badge
                              key={c.id}
                              variant="outline"
                              className="text-xs text-slate-600"
                              data-testid={`badge-company-${c.id}-user-${user.id}`}
                            >
                              {c.name}
                            </Badge>
                          ))}
                          {user.companies.length > 2 && (
                            <Badge variant="outline" className="text-xs text-slate-400">
                              +{user.companies.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                      <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
