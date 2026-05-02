import { useParams, useLocation } from "wouter";
import {
  useGetCompany,
  useUpdateCompany,
  useDeleteCompany,
  getListCompaniesQueryKey,
  getGetCompanyQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Building2, Pencil, Trash2, Check, X } from "lucide-react";
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
import { TaxBadge } from "@/pages/companies";

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  legalForm: z.string().optional(),
  country: z.string().min(1, "Country is required"),
  taxRegime: z.enum(["vat", "gst", "none"]),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  bankDetails: z.string().optional(),
  currency: z.enum(["EUR", "INR"]),
  isActive: z.boolean(),
});

type EditFormValues = z.infer<typeof editSchema>;

export default function CompanyDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: company, isLoading, isError } = useGetCompany(id, {
    query: { enabled: !!id, queryKey: getGetCompanyQueryKey(id) },
  });

  const updateCompany = useUpdateCompany({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(id) });
        toast({ title: "Company updated", description: "Changes saved successfully." });
        setIsEditing(false);
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update company.", variant: "destructive" });
      },
    },
  });

  const deleteCompany = useDeleteCompany({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListCompaniesQueryKey() });
        toast({ title: "Company deleted" });
        setLocation("/companies");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete company.", variant: "destructive" });
      },
    },
  });

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: company?.name ?? "",
      legalForm: company?.legalForm ?? "",
      country: company?.country ?? "",
      taxRegime: (company?.taxRegime as "vat" | "gst" | "none") ?? "none",
      taxNumber: company?.taxNumber ?? "",
      address: company?.address ?? "",
      bankDetails: company?.bankDetails ?? "",
      currency: (company?.currency as "EUR" | "INR") ?? "INR",
      isActive: company?.isActive ?? true,
    },
  });

  function startEdit() {
    if (!company) return;
    form.reset({
      name: company.name,
      legalForm: company.legalForm ?? "",
      country: company.country,
      taxRegime: company.taxRegime as "vat" | "gst" | "none",
      taxNumber: company.taxNumber ?? "",
      address: company.address ?? "",
      bankDetails: company.bankDetails ?? "",
      currency: company.currency as "EUR" | "INR",
      isActive: company.isActive,
    });
    setIsEditing(true);
  }

  function onSubmit(values: EditFormValues) {
    updateCompany.mutate({
      id,
      data: {
        name: values.name,
        legalForm: values.legalForm || undefined,
        country: values.country,
        taxRegime: values.taxRegime,
        taxNumber: values.taxNumber || null,
        address: values.address || null,
        bankDetails: values.bankDetails || null,
        currency: values.currency,
        isActive: values.isActive,
      },
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !company) {
    return (
      <div className="space-y-4">
        <Link href="/companies">
          <a className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to Companies
          </a>
        </Link>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          Company not found or failed to load.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/companies">
            <a
              data-testid="link-back-companies"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </a>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{company.name}</h1>
              <TaxBadge regime={company.taxRegime} />
              {!company.isActive && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-500">Inactive</Badge>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{company.legalForm} &middot; {company.country}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={startEdit}
                data-testid="button-edit-company"
              >
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" data-testid="button-delete-company">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete company?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{company.name}</strong>. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteCompany.mutate({ id })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      {deleteCompany.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {isEditing ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Company</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name</FormLabel>
                        <FormControl>
                          <Input data-testid="input-company-name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="legalForm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Legal Form</FormLabel>
                        <FormControl>
                          <Input data-testid="input-legal-form" placeholder="e.g. UG, Pvt Ltd" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input data-testid="input-country" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="taxRegime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Regime</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tax-regime">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="vat">VAT</SelectItem>
                            <SelectItem value="gst">GST</SelectItem>
                            <SelectItem value="none">None</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="taxNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Number</FormLabel>
                        <FormControl>
                          <Input data-testid="input-tax-number" placeholder="VAT/GST number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Currency</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-currency">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="INR">INR</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input data-testid="input-address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Details</FormLabel>
                      <FormControl>
                        <Input data-testid="input-bank-details" placeholder="Account/IBAN, bank name" {...field} />
                      </FormControl>
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
                          data-testid="switch-is-active"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Active</FormLabel>
                    </FormItem>
                  )}
                />
                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={updateCompany.isPending}
                    data-testid="button-save-company"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    {updateCompany.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    data-testid="button-cancel-edit"
                  >
                    <X className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Company Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { label: "Legal Form", value: company.legalForm },
                { label: "Country", value: company.country },
                { label: "Currency", value: company.currency },
                { label: "Tax Regime", value: company.taxRegime.toUpperCase() },
                { label: "Tax Number", value: company.taxNumber },
                { label: "Status", value: company.isActive ? "Active" : "Inactive" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-medium text-slate-800" data-testid={`detail-${label.toLowerCase().replace(/ /g, "-")}`}>
                    {value ?? "—"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-slate-600">Contact &amp; Banking</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Address</div>
                <div className="text-slate-800" data-testid="detail-address">{company.address ?? "—"}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs uppercase tracking-wide mb-1">Bank Details</div>
                <div className="text-slate-800 font-mono text-xs leading-relaxed" data-testid="detail-bank-details">
                  {company.bankDetails ?? "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
