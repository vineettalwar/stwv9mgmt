import { useState } from "react";
import {
  useListTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
  useListProjects,
  useListUsers,
  getListTodosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ClipboardList, Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
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

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  high: { label: "High", className: "bg-red-100 text-red-800" },
  medium: { label: "Medium", className: "bg-amber-100 text-amber-800" },
  low: { label: "Low", className: "bg-slate-100 text-slate-600" },
};

const createTodoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  projectId: z.number().nullable().optional(),
  assigneeId: z.number().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

type CreateTodoValues = z.infer<typeof createTodoSchema>;

function CreateTodoDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { data: projects } = useListProjects();
  const { data: users } = useListUsers();

  const { mutate, isPending } = useCreateTodo({
    mutation: {
      onSuccess: () => {
        toast({ title: "TODO created" });
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

  const form = useForm<CreateTodoValues>({
    resolver: zodResolver(createTodoSchema),
    defaultValues: { title: "", priority: "medium" },
  });

  function onSubmit(values: CreateTodoValues) {
    mutate({ data: values });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-create-todo">
          <Plus className="h-4 w-4 mr-2" /> Add TODO
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create TODO</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input data-testid="input-todo-title" placeholder="What needs to be done?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-todo-priority">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
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
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project (optional)</FormLabel>
                  <Select
                    onValueChange={v => field.onChange(v === "none" ? null : parseInt(v))}
                    value={field.value?.toString() ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-project">
                        <SelectValue placeholder="No specific project" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No specific project</SelectItem>
                      {(projects ?? []).map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assigneeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignee (optional)</FormLabel>
                  <Select
                    onValueChange={v => field.onChange(v === "none" ? null : parseInt(v))}
                    value={field.value?.toString() ?? "none"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-assignee">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {(users ?? []).map(u => (
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

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending} data-testid="button-submit-create-todo">
                {isPending ? "Creating..." : "Create TODO"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Todos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: todos, isLoading, isError } = useListTodos({});
  const { data: me } = useGetMe();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [search, setSearch] = useState("");

  const canCreate = me && !["client"].includes(me.role);

  const { mutate: updateTodo } = useUpdateTodo({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTodosQueryKey() }),
      onError: () => toast({ title: "Failed to update", variant: "destructive" }),
    },
  });

  const { mutate: deleteTodo } = useDeleteTodo({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTodosQueryKey() });
        toast({ title: "TODO deleted" });
      },
      onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
    },
  });

  const filtered = (todos ?? []).filter(t => {
    const q = search.toLowerCase();
    const matchSearch = !q || t.title.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const sortedTodos = [...filtered].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1) - (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1);
  });

  function toggleDone(id: number, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "open" : "done";
    updateTodo({ id, data: { status: newStatus } });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">TODOs</h1>
          <p className="text-sm text-slate-500">Tasks and action items across all projects.</p>
        </div>
        {canCreate && (
          <CreateTodoDialog onCreated={() => queryClient.invalidateQueries({ queryKey: getListTodosQueryKey() })} />
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search TODOs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
          data-testid="input-search-todos"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32" data-testid="select-todo-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load TODOs.
        </div>
      ) : sortedTodos.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No TODOs</h3>
          <p className="mt-1 text-sm text-slate-500">All clear! Add a new task above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTodos.map(todo => {
            const priority = PRIORITY_STYLES[todo.priority] ?? { label: todo.priority, className: "bg-slate-100 text-slate-600" };
            const isDone = todo.status === "done";
            return (
              <Card key={todo.id} data-testid={`card-todo-${todo.id}`} className={isDone ? "opacity-60" : ""}>
                <CardContent className="p-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleDone(todo.id, todo.status)}
                    data-testid={`checkbox-todo-${todo.id}`}
                    className={`flex-shrink-0 ${isDone ? "text-emerald-500" : "text-slate-300"} hover:text-emerald-400 transition-colors`}
                  >
                    {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-slate-900 ${isDone ? "line-through text-slate-400" : ""}`}>
                        {todo.title}
                      </span>
                      <Badge variant="secondary" className={priority.className}>
                        {priority.label}
                      </Badge>
                      {todo.dueDate && (
                        <span className="text-xs text-slate-400">{todo.dueDate}</span>
                      )}
                    </div>
                    {todo.description && (
                      <p className="text-sm text-slate-500 mt-0.5 truncate">{todo.description}</p>
                    )}
                    {todo.assignee && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Assigned to: {todo.assignee.firstName || todo.assignee.lastName
                          ? `${todo.assignee.firstName ?? ""} ${todo.assignee.lastName ?? ""}`.trim()
                          : todo.assignee.email}
                      </p>
                    )}
                  </div>
                  {me && ["admin", "project_manager"].includes(me.role) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-red-500 h-8 w-8 p-0"
                      onClick={() => deleteTodo({ id: todo.id })}
                      data-testid={`button-delete-todo-${todo.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
