import { useState } from "react";
import { useListUsers } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users as UsersIcon, ChevronRight, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { getListUsersQueryKey } from "@workspace/api-client-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@clerk/react";

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

const createUserSchema = z.object({
  email: z.string().email("Valid email required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum([
    "admin",
    "germany_accountant",
    "india_accountant",
    "project_manager",
    "client",
    "freelancer",
  ]),
});

type CreateUserValues = z.infer<typeof createUserSchema>;

function CreateUserDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const form = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: "freelancer" },
  });

  async function onSubmit(values: CreateUserValues) {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: values.email,
          firstName: values.firstName || null,
          lastName: values.lastName || null,
          role: values.role,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? "Failed to create user");
      }
      toast({ title: "User pre-registered", description: `${values.email} will be assigned ${values.role} role on first sign-in.` });
      form.reset();
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to create user", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-user">
          <UserPlus className="h-4 w-4 mr-2" /> Create User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pre-register a User</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-500">
          Enter the user's email and role. They will be assigned this role automatically when they sign in.
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input data-testid="input-create-user-email" placeholder="user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-create-user-firstname" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input data-testid="input-create-user-lastname" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-create-user-role">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="germany_accountant">DE Accountant</SelectItem>
                      <SelectItem value="india_accountant">IN Accountant</SelectItem>
                      <SelectItem value="project_manager">Project Manager</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                      <SelectItem value="freelancer">Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading} data-testid="button-submit-create-user">
                {loading ? "Creating..." : "Create User"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Users() {
  const queryClient = useQueryClient();
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
        <CreateUserDialog onCreated={() => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() })} />
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
            {search ? "Try a different search term." : "Use the Create User button above to pre-register users, or they will appear here once they sign in."}
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
                          {user.clerkUserId?.startsWith("pending:") && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              Pending sign-in
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
                            <Badge key={c.id} variant="outline" className="text-xs text-slate-600" data-testid={`badge-company-${c.id}-user-${user.id}`}>
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
