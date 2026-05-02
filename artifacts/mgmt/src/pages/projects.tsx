import { useState } from "react";
import { Link } from "wouter";
import {
  useListProjects,
  useCreateProject,
  useListCompanies,
  useListUsers,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Plus, ChevronRight, Building2, Calendar } from "lucide-react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetMe } from "@workspace/api-client-react";

const TYPE_LABELS: Record<string, string> = {
  one_time: "One-Time",
  monthly_fixed: "Monthly Fixed",
  amc: "AMC",
  internal: "Internal",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-600 hover:bg-slate-100" },
  on_hold: { label: "On Hold", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
};

const TYPE_STYLES: Record<string, string> = {
  one_time: "bg-violet-100 text-violet-800",
  monthly_fixed: "bg-blue-100 text-blue-800",
  amc: "bg-cyan-100 text-cyan-800",
  internal: "bg-slate-100 text-slate-600",
};

const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(["one_time", "monthly_fixed", "amc", "internal"]),
  companyId: z.number({ required_error: "Company is required" }),
  clientId: z.number().nullable().optional(),
  billingModel: z.enum(["hourly", "fixed", "retainer"]),
  status: z.enum(["active", "completed", "on_hold"]).default("active"),
  description: z.string().nullable().optional(),
  fixedAllocationHours: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

type CreateProjectValues = z.infer<typeof createProjectSchema>;

function CreateProjectDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: companies } = useListCompanies();
  const { data: users } = useListUsers();
  const clients = (users ?? []).filter(u => u.role === "client");

  const { mutate, isPending } = useCreateProject({
    mutation: {
      onSuccess: () => {
        toast({ title: "Project created" });
        form.reset();
        setOpen(false);
        onCreated();
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Failed";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const form = useForm<CreateProjectValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      type: "one_time",
      billingModel: "hourly",
      status: "active",
    },
  });

  function onSubmit(values: CreateProjectValues) {
    mutate({
      data: {
        ...values,
        companyId: values.companyId,
        clientId: values.clientId ?? null,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-project">
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name *</FormLabel>
                  <FormControl>
                    <Input data-testid="input-project-name" placeholder="Project name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="one_time">One-Time</SelectItem>
                        <SelectItem value="monthly_fixed">Monthly Fixed</SelectItem>
                        <SelectItem value="amc">AMC</SelectItem>
                        <SelectItem value="internal">Internal</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billingModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billing Model *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-billing-model">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="hourly">Hourly</SelectItem>
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="retainer">Retainer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="companyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company *</FormLabel>
                  <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-company">
                        <SelectValue placeholder="Select company..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(companies ?? []).map(c => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client (optional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "none" ? null : parseInt(v))}
                    value={field.value?.toString() ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-project-client">
                        <SelectValue placeholder="No client (internal)" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No client</SelectItem>
                      {clients.map(u => (
                        <SelectItem key={u.id} value={u.id.toString()}>
                          {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="fixedAllocationHours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fixed Hour Allocation (for Monthly/AMC)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. 80"
                      {...field}
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Brief description..."
                      {...field}
                      value={field.value ?? ""}
                      onChange={e => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-create-project">
                {isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Projects() {
  const queryClient = useQueryClient();
  const { data: projects, isLoading, isError } = useListProjects();
  const { data: me } = useGetMe();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const canCreate = me && ["admin", "project_manager"].includes(me.role);

  const filtered = (projects ?? []).filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.company?.name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Projects</h1>
          <p className="text-sm text-slate-500">All projects across company entities.</p>
        </div>
        {canCreate && (
          <CreateProjectDialog onCreated={() => queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() })} />
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          data-testid="input-search-projects"
          placeholder="Search projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load projects.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <FolderOpen className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">
            {search ? "No projects match your search" : "No projects yet"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {canCreate ? "Use the New Project button to create one." : "Projects assigned to you will appear here."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(project => {
            const status = STATUS_STYLES[project.status] ?? { label: project.status, className: "bg-slate-100 text-slate-600" };
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <a data-testid={`card-project-${project.id}`} className="block group">
                  <Card className="transition-all duration-200 hover:border-slate-300 hover:shadow-sm">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 flex-shrink-0">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-slate-900" data-testid={`text-project-name-${project.id}`}>
                              {project.name}
                            </span>
                            <Badge variant="secondary" className={TYPE_STYLES[project.type] ?? "bg-slate-100 text-slate-600"}>
                              {TYPE_LABELS[project.type] ?? project.type}
                            </Badge>
                            <Badge variant="secondary" className={status.className}>
                              {status.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3 text-sm text-slate-500">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {project.company?.name ?? "—"}
                            </span>
                            {project.startDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5" />
                                {project.startDate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
                    </CardContent>
                  </Card>
                </a>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
