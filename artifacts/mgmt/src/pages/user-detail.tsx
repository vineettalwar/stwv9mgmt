import { useParams, useLocation } from "wouter";
import {
  useGetUser,
  useUpdateUser,
  useDeleteUser,
  useListCompanies,
  useAssignUserToCompany,
  useRemoveUserFromCompany,
  getListUsersQueryKey,
  getGetUserQueryKey,
  getGetUserCompaniesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Pencil, Trash2, Check, X, Plus, Building2, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RoleBadge } from "@/pages/users";

const editSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: z.enum(["admin", "germany_accountant", "india_accountant", "project_manager", "client", "freelancer"]),
  isActive: z.boolean(),
  weeklyCapacityHours: z.number().int().min(1).max(168),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function UserDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: user, isLoading, isError } = useGetUser(id, {
    query: { enabled: !!id, queryKey: getGetUserQueryKey(id) },
  });

  const { data: allCompanies } = useListCompanies();

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        toast({ title: "User updated", description: "Changes saved successfully." });
        setIsEditing(false);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update user.", variant: "destructive" });
      },
    },
  });

  const deleteUser = useDeleteUser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
        toast({ title: "User deleted" });
        setLocation("/users");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete user.", variant: "destructive" });
      },
    },
  });

  const assignCompany = useAssignUserToCompany({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetUserCompaniesQueryKey(id) });
        toast({ title: "Company assigned" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to assign company.", variant: "destructive" });
      },
    },
  });

  const removeCompany = useRemoveUserFromCompany({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetUserQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetUserCompaniesQueryKey(id) });
        toast({ title: "Company removed" });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to remove company.", variant: "destructive" });
      },
    },
  });

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
      role: (user?.role as EditFormValues["role"]) ?? "client",
      isActive: user?.isActive ?? true,
      weeklyCapacityHours: user?.weeklyCapacityHours ?? 40,
    },
  });

  function startEdit() {
    if (!user) return;
    form.reset({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      role: user.role as EditFormValues["role"],
      isActive: user.isActive,
      weeklyCapacityHours: (user as typeof user & { weeklyCapacityHours?: number }).weeklyCapacityHours ?? 40,
    });
    setIsEditing(true);
  }

  function onSubmit(values: EditFormValues) {
    updateUser.mutate({
      id,
      data: {
        firstName: values.firstName || null,
        lastName: values.lastName || null,
        role: values.role,
        isActive: values.isActive,
        weeklyCapacityHours: values.weeklyCapacityHours,
      },
    });
  }

  const assignedCompanyIds = new Set(user?.companies?.map((c) => c.id) ?? []);
  const unassignedCompanies = (allCompanies ?? []).filter((c) => !assignedCompanyIds.has(c.id));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="space-y-4">
        <Link href="/users">
          <a className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to Users
          </a>
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          User not found or failed to load.
        </div>
      </div>
    );
  }

  const displayName =
    user.firstName || user.lastName
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim()
      : user.email;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/users">
            <a
              data-testid="link-back-users"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </a>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{displayName}</h1>
              <RoleBadge role={user.role} />
              {!user.isActive && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-500">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <Button variant="outline" size="sm" onClick={startEdit} data-testid="button-edit-user">
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" data-testid="button-delete-user">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete user?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{displayName}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteUser.mutate({ id })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      {deleteUser.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <UserCheck className="h-4 w-4" /> User Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input data-testid="input-first-name" {...field} />
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
                            <Input data-testid="input-last-name" {...field} />
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
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
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
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormControl>
                          <Switch
                            data-testid="switch-user-active"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Active</FormLabel>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="weeklyCapacityHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Weekly Capacity (hours)</FormLabel>
                        <FormControl>
                          <Input
                            data-testid="input-weekly-capacity"
                            type="number"
                            min={1}
                            max={168}
                            {...field}
                            value={field.value ?? 40}
                            onChange={e => field.onChange(parseInt(e.target.value) || 40)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={updateUser.isPending} data-testid="button-save-user">
                      <Check className="h-4 w-4 mr-2" />
                      {updateUser.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                      <X className="h-4 w-4 mr-2" /> Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            ) : (
              <div className="space-y-3 text-sm">
                {[
                  { label: "First Name", value: user.firstName },
                  { label: "Last Name", value: user.lastName },
                  { label: "Email", value: user.email },
                  { label: "Role", value: user.role.replace(/_/g, " ") },
                  { label: "Status", value: user.isActive ? "Active" : "Inactive" },
                  { label: "Weekly Capacity", value: `${(user as typeof user & { weeklyCapacityHours?: number }).weeklyCapacityHours ?? 40}h` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                    <span className="text-slate-500">{label}</span>
                    <span className="font-medium text-slate-800 capitalize" data-testid={`detail-user-${label.toLowerCase().replace(/ /g, "-")}`}>
                      {value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Assigned Companies
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {user.companies && user.companies.length > 0 ? (
              user.companies.map((company) => (
                <div
                  key={company.id}
                  className="flex items-center justify-between py-1 border-b border-slate-100 last:border-0"
                  data-testid={`assigned-company-${company.id}`}
                >
                  <span className="text-sm text-slate-700">{company.name}</span>
                  <button
                    onClick={() => removeCompany.mutate({ id, companyId: company.id })}
                    disabled={removeCompany.isPending}
                    data-testid={`button-remove-company-${company.id}`}
                    className="text-slate-400 hover:text-destructive transition-colors text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 italic">No companies assigned.</p>
            )}

            {unassignedCompanies.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Add Company</div>
                <div className="flex flex-wrap gap-2">
                  {unassignedCompanies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => assignCompany.mutate({ id, data: { companyId: company.id } })}
                      disabled={assignCompany.isPending}
                      data-testid={`button-assign-company-${company.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      {company.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
