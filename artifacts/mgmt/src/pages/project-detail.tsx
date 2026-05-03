import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetProject,
  useUpdateProject,
  useListProjectAssignments,
  useCreateProjectAssignment,
  useDeleteProjectAssignment,
  useListDeliverables,
  useCreateDeliverable,
  useUpdateDeliverable,
  useDeleteDeliverable,
  useListMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  useListProjectTimeEntries,
  useGetProjectBillingSummary,
  useListUsers,
  useListProjectExpenses,
  useCreateProjectExpense,
  useUpdateProjectExpense,
  useDeleteProjectExpense,
  useGetResourcesCapacity,
  getGetProjectQueryKey,
  getListProjectAssignmentsQueryKey,
  getListDeliverablesQueryKey,
  getListMilestonesQueryKey,
  getListProjectTimeEntriesQueryKey,
  getGetProjectBillingSummaryQueryKey,
  getListProjectExpensesQueryKey,
  getGetResourcesCapacityQueryKey,
} from "@workspace/api-client-react";
import type { Project, Expense } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Plus,
  Trash2,
  Users,
  CheckCircle2,
  Circle,
  Clock,
  BarChart2,
  Flag,
  Activity,
  DollarSign,
  Receipt,
} from "lucide-react";
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
import { useQuery } from "@tanstack/react-query";

const API_BASE = "/api";

interface AuditLogEntry {
  id: number;
  createdAt: string;
  actorId: number | null;
  actorRole: string;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: number;
  entityLabel: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  projectId: number | null;
  actor: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null;
}

const ACTION_LABELS: Record<string, string> = {
  status_changed: "Status Changed",
  signed: "Signed",
  filed: "Filed",
  role_changed: "Role Changed",
  sent: "Sent",
  accepted: "Accepted",
  rejected: "Rejected",
  paid: "Paid",
  archived: "Archived",
  created: "Created",
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  invoice: "bg-slate-100 text-slate-700",
  contract: "bg-indigo-100 text-indigo-700",
  offer: "bg-sky-100 text-sky-700",
  compliance: "bg-purple-100 text-purple-700",
  project: "bg-emerald-100 text-emerald-700",
};

function actorDisplayName(entry: AuditLogEntry): string {
  // Prefer the snapshot fields so historical entries remain accurate even if
  // the user's name/email later changes or the user is deleted.
  if (entry.actorName) return entry.actorName;
  if (entry.actorEmail) return entry.actorEmail;
  if (entry.actor) {
    const name = [entry.actor.firstName, entry.actor.lastName].filter(Boolean).join(" ");
    return name || entry.actor.email;
  }
  return entry.actorRole.replace(/_/g, " ");
}

const TYPE_LABELS: Record<string, string> = {
  one_time: "One-Time",
  monthly_fixed: "Monthly Fixed",
  amc: "AMC",
  internal: "Internal",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-600" },
  on_hold: { label: "On Hold", className: "bg-amber-100 text-amber-800" },
  archived: { label: "Archived", className: "bg-slate-200 text-slate-500" },
};

const DELIVERABLE_STATUS_COLUMNS = [
  { key: "todo", label: "To Do", icon: Circle, color: "text-slate-400" },
  { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-500" },
  { key: "done", label: "Done", icon: CheckCircle2, color: "text-emerald-500" },
] as const;

type Tab = "overview" | "deliverables" | "milestones" | "time" | "billing" | "expenses" | "activity";

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-slate-900 text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Deliverables Tab ─────────────────────────────────────────────────────────

const deliverableSchema = z.object({
  title: z.string().min(1, "Title required"),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  assigneeId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

function DeliverableCard({
  d,
  canEdit,
  projectId,
}: {
  d: { id: number; title: string; description?: string | null; status: string; dueDate?: string | null; assignee?: { id: number; firstName?: string | null; lastName?: string | null; email: string } | null };
  canEdit: boolean;
  projectId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: update } = useUpdateDeliverable({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey(projectId) }),
    },
  });
  const { mutate: remove } = useDeleteDeliverable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey(projectId) });
        toast({ title: "Deliverable deleted" });
      },
    },
  });

  const nextStatus: Record<string, "todo" | "in_progress" | "done"> = {
    todo: "in_progress",
    in_progress: "done",
    done: "todo",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-md p-3 space-y-1 group">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-slate-900 leading-snug">{d.title}</p>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700"
              onClick={() => update({ id: projectId, deliverableId: d.id, data: { status: nextStatus[d.status] ?? "todo" } })}
              title="Move to next status"
            >
              →
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
              onClick={() => remove({ id: projectId, deliverableId: d.id })}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
      <div className="flex items-center gap-2">
        {d.dueDate && <span className="text-xs text-slate-400">{d.dueDate}</span>}
        {d.assignee && (
          <span className="text-xs text-slate-400">
            {d.assignee.firstName || d.assignee.lastName
              ? `${d.assignee.firstName ?? ""} ${d.assignee.lastName ?? ""}`.trim()
              : d.assignee.email}
          </span>
        )}
      </div>
    </div>
  );
}

function DeliverablesTab({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const { data: deliverables, isLoading } = useListDeliverables(projectId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users } = useListUsers();
  const [open, setOpen] = useState(false);

  const { mutate: create, isPending } = useCreateDeliverable({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeliverablesQueryKey(projectId) });
        toast({ title: "Deliverable added" });
        form.reset();
        setOpen(false);
      },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    },
  });

  const form = useForm<z.infer<typeof deliverableSchema>>({
    resolver: zodResolver(deliverableSchema),
    defaultValues: { title: "", status: "todo" },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const byStatus = Object.fromEntries(
    DELIVERABLE_STATUS_COLUMNS.map(col => [
      col.key,
      (deliverables ?? []).filter(d => d.status === col.key),
    ])
  );

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-deliverable">
                <Plus className="h-4 w-4 mr-2" /> Add Deliverable
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Deliverable</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(v => create({ id: projectId, data: v }))} className="space-y-3 mt-2">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title *</FormLabel>
                        <FormControl><Input data-testid="input-deliverable-title" {...field} /></FormControl>
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
                          <Input {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="todo">To Do</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="assigneeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assignee</FormLabel>
                        <Select onValueChange={v => field.onChange(v === "none" ? null : parseInt(v))} value={field.value?.toString() ?? "none"}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {(users ?? []).map(u => (
                              <SelectItem key={u.id} value={u.id.toString()}>
                                {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>Add</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {DELIVERABLE_STATUS_COLUMNS.map(col => {
          const Icon = col.icon;
          const items = byStatus[col.key] ?? [];
          return (
            <div key={col.key} className="space-y-2">
              <div className={`flex items-center gap-2 text-sm font-medium ${col.color}`}>
                <Icon className="h-4 w-4" />
                {col.label}
                <span className="ml-auto text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{items.length}</span>
              </div>
              <div className="space-y-2 min-h-[80px]">
                {items.map(d => (
                  <DeliverableCard key={d.id} d={d} canEdit={canEdit} projectId={projectId} />
                ))}
                {items.length === 0 && (
                  <div className="border border-dashed border-slate-200 rounded-md p-4 text-xs text-slate-400 text-center">
                    Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Milestones Tab ───────────────────────────────────────────────────────────

function MilestonesTab({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const { data: milestones, isLoading } = useListMilestones(projectId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const { mutate: create, isPending } = useCreateMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMilestonesQueryKey(projectId) });
        toast({ title: "Milestone added" });
        setOpen(false);
        mForm.reset();
      },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    },
  });

  const { mutate: update } = useUpdateMilestone({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListMilestonesQueryKey(projectId) }),
    },
  });

  const { mutate: remove } = useDeleteMilestone({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListMilestonesQueryKey(projectId) });
        toast({ title: "Milestone deleted" });
      },
    },
  });

  const milestoneSchema = z.object({
    title: z.string().min(1, "Title required"),
    description: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
  });

  const mForm = useForm<z.infer<typeof milestoneSchema>>({
    resolver: zodResolver(milestoneSchema),
    defaultValues: { title: "" },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-milestone">
                <Plus className="h-4 w-4 mr-2" /> Add Milestone
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Milestone</DialogTitle></DialogHeader>
              <Form {...mForm}>
                <form onSubmit={mForm.handleSubmit(v => create({ id: projectId, data: v }))} className="space-y-3 mt-2">
                  <FormField control={mForm.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title *</FormLabel>
                      <FormControl><Input data-testid="input-milestone-title" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={mForm.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <FormField control={mForm.control} name="dueDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                      </FormControl>
                    </FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={isPending}>Add</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      )}
      {(milestones ?? []).length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">No milestones yet.</div>
      ) : (
        <div className="space-y-2">
          {(milestones ?? []).map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-md bg-white group">
              <button
                onClick={() => canEdit && update({ id: projectId, milestoneId: m.id, data: { status: m.status === "completed" ? "pending" : "completed" } })}
                className={`flex-shrink-0 ${m.status === "completed" ? "text-emerald-500" : "text-slate-300"} hover:text-emerald-400 transition-colors`}
                data-testid={`button-toggle-milestone-${m.id}`}
              >
                {m.status === "completed" ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </button>
              <div className="flex-1">
                <p className={`text-sm font-medium ${m.status === "completed" ? "line-through text-slate-400" : "text-slate-900"}`}>{m.title}</p>
                {m.description && <p className="text-xs text-slate-500">{m.description}</p>}
                {m.dueDate && <p className="text-xs text-slate-400">{m.dueDate}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={m.status === "completed" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                  {m.status === "completed" ? "Completed" : "Pending"}
                </Badge>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100"
                    onClick={() => remove({ id: projectId, milestoneId: m.id })}
                    data-testid={`button-delete-milestone-${m.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Time Tab ─────────────────────────────────────────────────────────────────

function TimeTab({ projectId }: { projectId: number }) {
  const { data: entries, isLoading } = useListProjectTimeEntries(projectId, {});
  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const totalHours = (entries ?? []).reduce((sum, e) => sum + parseFloat(e.hours || "0"), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{(entries ?? []).length} entries</p>
        <p className="text-sm font-semibold text-slate-900">Total: {totalHours.toFixed(1)}h</p>
      </div>
      {(entries ?? []).length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">No time entries logged yet.</div>
      ) : (
        <div className="space-y-2">
          {[...(entries ?? [])].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
            <div key={e.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded bg-white text-sm">
              <span className="text-slate-400 w-24 flex-shrink-0">{e.date}</span>
              <span className="flex-1 text-slate-700">{e.description || <span className="text-slate-400 italic">No description</span>}</span>
              <span className="font-medium text-slate-800">{parseFloat(e.hours).toFixed(1)}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Billing Tab ─────────────────────────────────────────────────────────────

function BillingTab({ projectId, projectType }: { projectId: number; projectType: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data: summary, isLoading } = useGetProjectBillingSummary(projectId, { month });

  if (!["monthly_fixed", "amc"].includes(projectType)) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        Billing cycle view is only available for Monthly Fixed and AMC projects.
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!summary) return null;

  const loggedNum = parseFloat(summary.loggedHours);
  const allocationNum = summary.fixedAllocationHours ? parseFloat(summary.fixedAllocationHours) : null;
  const pct = allocationNum && allocationNum > 0 ? Math.min((loggedNum / allocationNum) * 100, 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Month</label>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Fixed Allocation</p>
            <p className="text-2xl font-bold text-slate-900">{summary.fixedAllocationHours ?? "—"}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Logged Hours</p>
            <p className="text-2xl font-bold text-slate-900">{summary.loggedHours}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500 mb-1">Remaining</p>
            <p className={`text-2xl font-bold ${summary.remainingHours != null && parseFloat(summary.remainingHours) < 0 ? "text-red-600" : "text-emerald-600"}`}>
              {summary.remainingHours !== null ? `${summary.remainingHours}h` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {pct !== null && (
        <div>
          <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
            <span>Usage</span>
            <span>{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {summary.memberBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-600">Hours by Team Member</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.memberBreakdown.map(member => (
                <div key={member.userId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{member.userName}</span>
                  <span className="font-medium text-slate-900">{parseFloat(member.loggedHours).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  travel: "Travel",
  software: "Software",
  hardware: "Hardware",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  travel: "bg-blue-100 text-blue-700",
  software: "bg-purple-100 text-purple-700",
  hardware: "bg-amber-100 text-amber-700",
  other: "bg-slate-100 text-slate-600",
};

const expenseSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Must be a positive number (e.g. 12.50)"),
  currency: z.string().min(1).max(10).default("EUR"),
  category: z.enum(["travel", "software", "hardware", "other"]).default("other"),
  description: z.string().min(1, "Description required"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date required"),
  isBillable: z.boolean().default(false),
});

function ExpensesTab({ projectId, canEdit }: { projectId: number; canEdit: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: expenses, isLoading } = useListProjectExpenses(projectId);

  const { mutate: create, isPending: creating } = useCreateProjectExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectExpensesQueryKey(projectId) });
        toast({ title: "Expense logged" });
        form.reset({ currency: "EUR", category: "other", isBillable: false, date: new Date().toISOString().slice(0, 10), amount: "", description: "" });
        setOpen(false);
      },
      onError: () => toast({ title: "Failed to log expense", variant: "destructive" }),
    },
  });

  const { mutate: deleteExpense } = useDeleteProjectExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectExpensesQueryKey(projectId) });
        toast({ title: "Expense deleted" });
      },
      onError: () => toast({ title: "Cannot delete this expense", variant: "destructive" }),
    },
  });

  const { mutate: toggleBillable } = useUpdateProjectExpense({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProjectExpensesQueryKey(projectId) }),
      onError: () => toast({ title: "Update failed", variant: "destructive" }),
    },
  });

  const form = useForm<z.infer<typeof expenseSchema>>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      currency: "EUR",
      category: "other",
      isBillable: false,
      date: new Date().toISOString().slice(0, 10),
      amount: "",
      description: "",
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const list = (expenses ?? []) as (Expense & { creatorEmail?: string | null; creatorFirstName?: string | null; creatorLastName?: string | null })[];
  const billableTotal = list.filter(e => e.isBillable).reduce((s, e) => s + parseFloat(e.amount), 0);
  const internalTotal = list.filter(e => !e.isBillable).reduce((s, e) => s + parseFloat(e.amount), 0);
  const unbilledCount = list.filter(e => e.isBillable && !e.invoicedAt).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-sm">
          <span className="text-slate-500">Billable: <span className="font-semibold text-slate-900">{billableTotal.toFixed(2)}</span></span>
          <span className="text-slate-500">Internal: <span className="font-semibold text-slate-900">{internalTotal.toFixed(2)}</span></span>
          {unbilledCount > 0 && (
            <span className="text-amber-600 font-medium">{unbilledCount} unbilled</span>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-expense">
              <Plus className="h-4 w-4 mr-2" /> Log Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Log Expense</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(v => create({ id: projectId, data: v }))} className="space-y-3 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount *</FormLabel>
                        <FormControl><Input placeholder="0.00" {...field} data-testid="input-expense-amount" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="currency" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="INR">INR</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl><Input placeholder="What was this expense for?" {...field} data-testid="input-expense-description" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="travel">Travel</SelectItem>
                            <SelectItem value="software">Software</SelectItem>
                            <SelectItem value="hardware">Hardware</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="date" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date *</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  {canEdit && (
                    <FormField control={form.control} name="isBillable" render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="isBillable"
                            checked={field.value}
                            onChange={e => field.onChange(e.target.checked)}
                            className="rounded"
                          />
                          <label htmlFor="isBillable" className="text-sm text-slate-700">Billable to client</label>
                        </div>
                      </FormItem>
                    )} />
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={creating}>Log Expense</Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-400">
          <DollarSign className="mx-auto h-10 w-10 text-slate-200 mb-2" />
          No expenses logged yet.
        </div>
      ) : (
        <div className="space-y-2">
          {[...list].sort((a, b) => b.date.localeCompare(a.date)).map(expense => {
            const catColor = CATEGORY_COLORS[expense.category] ?? "bg-slate-100 text-slate-600";
            const creator = expense.creatorFirstName || expense.creatorLastName
              ? `${expense.creatorFirstName ?? ""} ${expense.creatorLastName ?? ""}`.trim()
              : expense.creatorEmail ?? null;
            return (
              <div key={expense.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-md bg-white group text-sm">
                <div className="flex-shrink-0">
                  <Receipt className="h-4 w-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-900">{expense.currency} {parseFloat(expense.amount).toFixed(2)}</span>
                    <Badge className={`text-xs ${catColor}`}>{CATEGORY_LABELS[expense.category] ?? expense.category}</Badge>
                    {expense.isBillable && (
                      <Badge className="text-xs bg-emerald-100 text-emerald-700">
                        {expense.invoicedAt ? "Invoiced" : "Billable"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-slate-600 mt-0.5 truncate">{expense.description}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{expense.date}</span>
                    {creator && <span>· {creator}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEdit && !expense.invoicedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs px-2 text-slate-500"
                      onClick={() => toggleBillable({ id: projectId, expenseId: expense.id, data: { amount: expense.amount, description: expense.description, date: expense.date, isBillable: !expense.isBillable } })}
                      title={expense.isBillable ? "Mark as internal" : "Mark as billable"}
                    >
                      {expense.isBillable ? "Mark Internal" : "Mark Billable"}
                    </Button>
                  )}
                  {!expense.invoicedAt && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => deleteExpense({ id: projectId, expenseId: expense.id })}
                      data-testid={`button-delete-expense-${expense.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab({ projectId }: { projectId: number }) {
  const { data: entries, isLoading, error } = useQuery<AuditLogEntry[]>({
    queryKey: ["project-activity", projectId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/projects/${projectId}/activity`, { credentials: "include" });
      if (res.status === 403) throw Object.assign(new Error("Forbidden"), { status: 403 });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (error && (error as Error & { status?: number }).status === 403) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        You do not have permission to view this project's activity.
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-sm text-red-400">
        Failed to load activity. Please try again.
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-slate-400">
        No activity recorded for this project yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(entry => {
        const oldStatus = (entry.oldValue as { status?: string } | null)?.status;
        const newStatus = (entry.newValue as { status?: string } | null)?.status;
        const entityColor = ENTITY_TYPE_COLORS[entry.entityType] ?? "bg-slate-100 text-slate-700";

        return (
          <div key={entry.id} className="flex items-start gap-3 p-3 border border-slate-100 rounded-md bg-white text-sm">
            <Activity className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-900">{actorDisplayName(entry)}</span>
                <span className="text-slate-500">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                <Badge className={`text-xs ${entityColor}`}>
                  {entry.entityType} {entry.entityLabel ? `· ${entry.entityLabel}` : `#${entry.entityId}`}
                </Badge>
                {oldStatus && newStatus && (
                  <span className="text-slate-400 text-xs">
                    {oldStatus} → {newStatus}
                  </span>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
              {new Date(entry.createdAt).toLocaleString("en-GB", {
                day: "2-digit", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: assignments, isLoading: assignmentsLoading } = useListProjectAssignments(project.id);
  const { data: users } = useListUsers();
  const [assignOpen, setAssignOpen] = useState(false);

  const _today = new Date().toISOString().slice(0, 10);
  const _thisMonday = (() => {
    const d = new Date(_today + "T00:00:00Z");
    const day = d.getUTCDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().slice(0, 10);
  })();
  const _thisSunday = (() => {
    const d = new Date(_thisMonday + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const { data: capacityData } = useGetResourcesCapacity(
    { from: _thisMonday, to: _thisSunday },
    { query: { enabled: assignOpen, queryKey: getGetResourcesCapacityQueryKey({ from: _thisMonday, to: _thisSunday }) } }
  );

  const utilizationMap: Record<number, number> = Object.fromEntries(
    (capacityData?.freelancers ?? []).map(f => [f.userId, f.weeks[0]?.utilization ?? 0])
  );

  const { mutate: addAssignment, isPending: adding } = useCreateProjectAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectAssignmentsQueryKey(project.id) });
        toast({ title: "Member added" });
        setAssignOpen(false);
        aForm.reset();
      },
      onError: () => toast({ title: "Failed", variant: "destructive" }),
    },
  });

  const { mutate: removeAssignment } = useDeleteProjectAssignment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectAssignmentsQueryKey(project.id) });
        toast({ title: "Member removed" });
      },
    },
  });

  const aSchema = z.object({
    userId: z.number({ required_error: "User required" }),
    memberType: z.enum(["employee", "freelancer"]),
    hourlyRate: z.string().nullable().optional(),
    monthlyRate: z.string().nullable().optional(),
  });

  const aForm = useForm<z.infer<typeof aSchema>>({
    resolver: zodResolver(aSchema),
    defaultValues: { memberType: "employee" },
  });

  const assignedUserIds = new Set((assignments ?? []).map(a => a.userId));
  const availableUsers = (users ?? []).filter(u => !assignedUserIds.has(u.id));

  const statusInfo = STATUS_STYLES[project.status] ?? { label: project.status, className: "bg-slate-100 text-slate-600" };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-slate-600">Project Info</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-slate-400">Type</p>
              <p className="text-sm font-medium text-slate-900">{TYPE_LABELS[project.type] ?? project.type}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Billing Model</p>
              <p className="text-sm font-medium text-slate-900 capitalize">{project.billingModel}</p>
            </div>
            {project.fixedAllocationHours && (
              <div>
                <p className="text-xs text-slate-400">Fixed Allocation</p>
                <p className="text-sm font-medium text-slate-900">{project.fixedAllocationHours}h/month</p>
              </div>
            )}
            {project.startDate && (
              <div>
                <p className="text-xs text-slate-400">Start Date</p>
                <p className="text-sm font-medium text-slate-900">{project.startDate}</p>
              </div>
            )}
            {project.endDate && (
              <div>
                <p className="text-xs text-slate-400">End Date</p>
                <p className="text-sm font-medium text-slate-900">{project.endDate}</p>
              </div>
            )}
            {project.description && (
              <div>
                <p className="text-xs text-slate-400">Description</p>
                <p className="text-sm text-slate-700">{project.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center justify-between">
              <span className="flex items-center gap-2"><Users className="h-4 w-4" /> Team Members</span>
              {canEdit && (
                <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7">
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Add Team Member</DialogTitle></DialogHeader>
                    <Form {...aForm}>
                      <form onSubmit={aForm.handleSubmit(v => addAssignment({ id: project.id, data: v }))} className="space-y-3 mt-2">
                        <FormField control={aForm.control} name="userId" render={({ field }) => (
                          <FormItem>
                            <FormLabel>User *</FormLabel>
                            <Select onValueChange={v => field.onChange(parseInt(v))} value={field.value?.toString()}>
                              <FormControl><SelectTrigger data-testid="select-assign-user"><SelectValue placeholder="Select user..." /></SelectTrigger></FormControl>
                              <SelectContent>
                                {availableUsers.map(u => {
                                  const name = u.firstName || u.lastName
                                    ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                                    : u.email;
                                  const util = u.role === "freelancer" ? utilizationMap[u.id] : undefined;
                                  return (
                                    <SelectItem key={u.id} value={u.id.toString()}>
                                      {name} ({u.role}){util !== undefined ? ` · ${util}% this wk` : ""}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={aForm.control} name="memberType" render={({ field }) => (
                          <FormItem>
                            <FormLabel>Member Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value="employee">Employee</SelectItem>
                                <SelectItem value="freelancer">Freelancer</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormItem>
                        )} />
                        <div className="grid grid-cols-2 gap-2">
                          <FormField control={aForm.control} name="hourlyRate" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Hourly Rate</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 50" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                              </FormControl>
                            </FormItem>
                          )} />
                          <FormField control={aForm.control} name="monthlyRate" render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monthly Rate</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g. 3000" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value || null)} />
                              </FormControl>
                            </FormItem>
                          )} />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                          <Button type="submit" disabled={adding} data-testid="button-submit-assign">Add Member</Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignmentsLoading ? (
              <Skeleton className="h-20" />
            ) : (assignments ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">No team members yet.</p>
            ) : (
              <div className="space-y-2">
                {(assignments ?? []).map(a => (
                  <div key={a.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {a.user.firstName || a.user.lastName
                          ? `${a.user.firstName ?? ""} ${a.user.lastName ?? ""}`.trim()
                          : a.user.email}
                      </p>
                      <p className="text-xs text-slate-400 capitalize">{a.memberType}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.hourlyRate && <span className="text-xs text-slate-500">{a.hourlyRate}/h</span>}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                          onClick={() => removeAssignment({ id: project.id, userId: a.userId })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { data: project, isLoading, isError } = useGetProject(projectId);
  const { data: me } = useGetMe();

  const canEdit = !!me && ["admin", "project_manager"].includes(me.role);
  const isClient = !!me && me.role === "client";

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
        Project not found or failed to load.
      </div>
    );
  }

  const statusInfo = STATUS_STYLES[project.status] ?? { label: project.status, className: "bg-slate-100 text-slate-600" };
  const showBilling = ["monthly_fixed", "amc"].includes(project.type);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects">
          <a className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Projects
          </a>
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900" data-testid="text-project-detail-name">
              {project.name}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
              <Building2 className="h-4 w-4" />
              {project.company?.name}
              {project.startDate && (
                <>
                  <span>·</span>
                  <Calendar className="h-4 w-4" />
                  {project.startDate}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={statusInfo.className}>{statusInfo.label}</Badge>
            <Badge variant="outline">{TYPE_LABELS[project.type] ?? project.type}</Badge>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <div className="flex gap-0">
          <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
          <TabButton active={activeTab === "deliverables"} onClick={() => setActiveTab("deliverables")}>Deliverables</TabButton>
          <TabButton active={activeTab === "milestones"} onClick={() => setActiveTab("milestones")}>Milestones</TabButton>
          <TabButton active={activeTab === "time"} onClick={() => setActiveTab("time")}>Time Entries</TabButton>
          {!isClient && <TabButton active={activeTab === "expenses"} onClick={() => setActiveTab("expenses")}>Expenses</TabButton>}
          {showBilling && (
            <TabButton active={activeTab === "billing"} onClick={() => setActiveTab("billing")}>Billing Cycle</TabButton>
          )}
          <TabButton active={activeTab === "activity"} onClick={() => setActiveTab("activity")}>Activity</TabButton>
        </div>
      </div>

      <div>
        {activeTab === "overview" && <OverviewTab project={project} canEdit={canEdit} />}
        {activeTab === "deliverables" && <DeliverablesTab projectId={projectId} canEdit={canEdit} />}
        {activeTab === "milestones" && <MilestonesTab projectId={projectId} canEdit={canEdit} />}
        {activeTab === "time" && <TimeTab projectId={projectId} />}
        {activeTab === "expenses" && !isClient && <ExpensesTab projectId={projectId} canEdit={canEdit} />}
        {activeTab === "billing" && <BillingTab projectId={projectId} projectType={project.type} />}
        {activeTab === "activity" && <ActivityTab projectId={projectId} />}
      </div>
    </div>
  );
}
