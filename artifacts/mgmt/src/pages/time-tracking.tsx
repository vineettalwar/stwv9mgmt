import { useState } from "react";
import {
  useListMyTimeEntries,
  useListProjects,
  useCreateTimeEntry,
  useDeleteTimeEntry,
  getListMyTimeEntriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Clock, Plus, Trash2 } from "lucide-react";
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

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const logTimeSchema = z.object({
  projectId: z.number({ required_error: "Project is required" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  hours: z.string().min(1, "Hours are required"),
  description: z.string().nullable().optional(),
});

type LogTimeValues = z.infer<typeof logTimeSchema>;

function LogTimeDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: projects } = useListProjects();
  const queryClient = useQueryClient();

  const form = useForm<LogTimeValues>({
    resolver: zodResolver(logTimeSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      hours: "",
    },
  });

  const selectedProjectId = form.watch("projectId");

  const { mutate, isPending } = useCreateTimeEntry({
    mutation: {
      onSuccess: () => {
        toast({ title: "Time logged" });
        form.reset({ date: new Date().toISOString().slice(0, 10), hours: "" });
        setOpen(false);
        onCreated();
      },
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message ?? "Failed to log time";
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    },
  });

  function onSubmit(values: LogTimeValues) {
    mutate({
      id: values.projectId,
      data: {
        date: values.date,
        hours: values.hours,
        description: values.description ?? null,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-log-time">
          <Plus className="h-4 w-4 mr-2" /> Log Time
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Time</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project *</FormLabel>
                  <Select onValueChange={v => field.onChange(parseInt(v))} value={field.value?.toString()}>
                    <FormControl>
                      <SelectTrigger data-testid="select-log-project">
                        <SelectValue placeholder="Select project..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(projects ?? []).map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-log-date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours *</FormLabel>
                    <FormControl>
                      <Input data-testid="input-log-hours" placeholder="e.g. 2.5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Input
                      data-testid="input-log-description"
                      placeholder="What did you work on?"
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
              <Button type="submit" disabled={isPending} data-testid="button-submit-log-time">
                {isPending ? "Logging..." : "Log Time"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function TimeTracking() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [month, setMonth] = useState(getCurrentMonth());
  const { data: me } = useGetMe();

  const { data: entries, isLoading, isError } = useListMyTimeEntries({ month });

  const { mutate: deleteEntry } = useDeleteTimeEntry({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMyTimeEntriesQueryKey() });
        toast({ title: "Entry deleted" });
      },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    },
  });

  // Group by week
  const grouped: Record<string, typeof entries> = {};
  for (const entry of entries ?? []) {
    const date = new Date(entry.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay() + 1);
    const weekKey = weekStart.toISOString().slice(0, 10);
    if (!grouped[weekKey]) grouped[weekKey] = [];
    grouped[weekKey]!.push(entry);
  }

  const totalHours = (entries ?? []).reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);

  const canDelete = (entryUserId: number) => {
    if (!me) return false;
    return ["admin", "project_manager"].includes(me.role) || me.id === entryUserId;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Time Tracking</h1>
          <p className="text-sm text-slate-500">Log and review hours across projects.</p>
        </div>
        <LogTimeDialog onCreated={() => queryClient.invalidateQueries({ queryKey: getListMyTimeEntriesQueryKey() })} />
      </div>

      <div className="flex items-center gap-3">
        <div>
          <label className="text-sm font-medium text-slate-700 mr-2">Month</label>
          <Input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="w-40 inline-block"
            data-testid="input-month-filter"
          />
        </div>
        <div className="ml-auto">
          <Card className="inline-block">
            <CardContent className="px-4 py-2">
              <span className="text-sm text-slate-500">Total:</span>{" "}
              <span className="font-bold text-slate-900" data-testid="text-total-hours">{totalHours.toFixed(1)}h</span>
            </CardContent>
          </Card>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load time entries.
        </div>
      ) : (entries ?? []).length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Clock className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No time entries</h3>
          <p className="mt-1 text-sm text-slate-500">No hours logged for this month.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([weekStart, weekEntries]) => {
              const weekTotal = (weekEntries ?? []).reduce((s, e) => s + parseFloat(e.hours || "0"), 0);
              const weekDate = new Date(weekStart);
              const weekEnd = new Date(weekStart);
              weekEnd.setDate(weekDate.getDate() + 6);

              return (
                <Card key={weekStart}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
                      <span>
                        Week of {weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {" – "}
                        {weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="text-slate-900 font-bold">{weekTotal.toFixed(1)}h</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(weekEntries ?? [])
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(entry => (
                          <div
                            key={entry.id}
                            data-testid={`row-entry-${entry.id}`}
                            className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-slate-400 w-20">{entry.date}</span>
                              <div>
                                <div className="text-sm font-medium text-slate-800">{entry.projectName}</div>
                                {entry.description && (
                                  <div className="text-xs text-slate-500">{entry.description}</div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-slate-700">{parseFloat(entry.hours).toFixed(1)}h</span>
                              {canDelete(entry.userId) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                                  onClick={() => deleteEntry({ id: entry.projectId, entryId: entry.id })}
                                  data-testid={`button-delete-entry-${entry.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}
    </div>
  );
}
