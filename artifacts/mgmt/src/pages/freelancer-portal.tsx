import { useState } from "react";
import {
  useGetMe,
  useListProjects,
  useListMyTimeEntries,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  getListMyTimeEntriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Building2, Clock, FolderOpen, Plus, TrendingUp, Trash2, User } from "lucide-react";
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

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const logTimeSchema = z.object({
  projectId: z.number({ required_error: "Project required" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.string().min(1, "Hours required"),
  description: z.string().nullable().optional(),
});

type LogTimeValues = z.infer<typeof logTimeSchema>;

function LogTimeDialog({ projects, onCreated }: { projects: Array<{ id: number; name: string }>; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { mutate, isPending } = useCreateTimeEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Time logged" });
        form.reset({ date: new Date().toISOString().slice(0, 10), hours: "" });
        setOpen(false);
        onCreated();
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Failed";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  const form = useForm<LogTimeValues>({
    resolver: zodResolver(logTimeSchema),
    defaultValues: { date: new Date().toISOString().slice(0, 10), hours: "" },
  });

  function onSubmit(values: LogTimeValues) {
    mutate({
      id: values.projectId,
      data: { date: values.date, hours: values.hours, description: values.description ?? null },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-log-time-freelancer">
          <Plus className="h-4 w-4 mr-2" /> Log Time
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log Time</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField control={form.control} name="projectId" render={({ field }) => (
              <FormItem>
                <FormLabel>Project *</FormLabel>
                <Select onValueChange={v => field.onChange(parseInt(v))} value={field.value?.toString()}>
                  <FormControl>
                    <SelectTrigger data-testid="select-freelancer-log-project">
                      <SelectValue placeholder="Select project..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="date" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl><Input type="date" data-testid="input-freelancer-log-date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="hours" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hours *</FormLabel>
                  <FormControl><Input data-testid="input-freelancer-log-hours" placeholder="e.g. 2.5" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Input
                    data-testid="input-freelancer-log-description"
                    placeholder="What did you work on?"
                    {...field}
                    value={field.value ?? ""}
                    onChange={e => field.onChange(e.target.value || null)}
                  />
                </FormControl>
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-freelancer-log">
                {isPending ? "Logging..." : "Log Time"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function FreelancerPortal() {
  const { data: me, isLoading: meLoading } = useGetMe();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState(getCurrentMonth());

  const { data: entries, isLoading: entriesLoading } = useListMyTimeEntries({ month });

  const { mutate: deleteEntry } = useDeleteTimeEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyTimeEntriesQueryKey() });
        toast({ title: "Entry deleted" });
      },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    },
  });

  const assignedCompanies = me?.companies ?? [];
  const totalHours = (entries ?? []).reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);

  // Earnings: sum(hours × hourlyRate) for entries that have a rate set
  const { totalEarnings, hasRates } = (entries ?? []).reduce(
    (acc, e) => {
      if (e.hourlyRate) {
        acc.totalEarnings += parseFloat(e.hours || "0") * parseFloat(e.hourlyRate);
        acc.hasRates = true;
      }
      return acc;
    },
    { totalEarnings: 0, hasRates: false },
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Freelancer Portal
          </h1>
          <p className="text-sm text-slate-500">
            Welcome back{me?.firstName ? `, ${me.firstName}` : ""}. Track your work here.
          </p>
        </div>
        <LogTimeDialog
          projects={projects ?? []}
          onCreated={() => queryClient.invalidateQueries({ queryKey: getListMyTimeEntriesQueryKey() })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Assigned Companies</CardTitle>
            <Building2 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {meLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-assigned-companies">
                {assignedCompanies.length}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Hours This Month</CardTitle>
            <Clock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {entriesLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-hours-logged">
                {totalHours.toFixed(1)}h
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Est. Earnings</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {entriesLoading ? <Skeleton className="h-8 w-24" /> : hasRates ? (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-estimated-earnings">
                {totalEarnings.toFixed(2)}
              </div>
            ) : (
              <div className="text-sm text-slate-400 pt-1" data-testid="stat-estimated-earnings">
                No rates set
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
            {projectsLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-active-projects">
                {(projects ?? []).filter(p => p.status === "active").length}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
            <FolderOpen className="h-4 w-4" /> Your Projects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projectsLoading ? (
            <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (projects ?? []).length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FolderOpen className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No projects assigned yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(projects ?? []).map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 px-3 rounded-md border border-slate-100 bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.company?.name ?? ""}</p>
                  </div>
                  <Badge variant="secondary" className={p.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                    {p.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Time Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
            <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> Time Entries</span>
            <Input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-36 h-7 text-xs"
              data-testid="input-freelancer-month"
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entriesLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (entries ?? []).length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No time entries for this month. Use Log Time to add one.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {[...(entries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                <div key={e.id} data-testid={`row-freelancer-entry-${e.id}`} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                  <span className="text-xs text-slate-400 w-20 flex-shrink-0">{e.date}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{e.projectName}</p>
                    {e.description && <p className="text-xs text-slate-500">{e.description}</p>}
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{parseFloat(e.hours).toFixed(1)}h</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                    onClick={() => deleteEntry({ id: e.projectId, entryId: e.id })}
                    data-testid={`button-delete-freelancer-entry-${e.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
