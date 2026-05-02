import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  getListInvoicesQueryKey,
  getGetInvoiceQueryKey,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Download,
  Send,
  CheckCircle,
  Clock,
  XCircle,
  Pencil,
  Save,
  X,
  Trash2,
  RefreshCw,
  Plus,
} from "lucide-react";
import { generateInvoicePdf } from "@/lib/pdf-generator";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", className: "bg-amber-100 text-amber-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-200 text-slate-500" },
};

const TAX_TYPE_LABELS: Record<string, string> = {
  none: "No Tax",
  vat: "MwSt 19% (VAT)",
  cgst_sgst: "CGST+SGST 9%+9%",
  igst: "IGST 18%",
};

type LineItem = { description: string; quantity: string; unitPrice: string; timeEntryId?: number | null };

type InvoiceWithRelations = {
  id: number;
  invoiceNumber: string;
  title: string;
  notes?: string | null;
  issueDate: string;
  dueDate?: string | null;
  status: string;
  taxType: string;
  taxRate: string | number;
  subtotal: string | number;
  taxAmount: string | number;
  totalAmount: string | number;
  currency: string;
  isRecurring: boolean;
  recurringInterval?: string | null;
  nextInvoiceDate?: string | null;
  companyId: number;
  clientId?: number | null;
  projectId?: number | null;
  createdAt: string;
  updatedAt: string;
  company?: { id: number; name: string; taxNumber?: string | null; address?: string | null; bankDetails?: string | null; currency: string; taxRegime: string } | null;
  client?: { id: number; email: string; firstName?: string | null; lastName?: string | null } | null;
  project?: { id: number; name: string } | null;
  lineItems?: LineItem[];
};

function clientDisplayName(client?: { email: string; firstName?: string | null; lastName?: string | null } | null): string {
  if (!client) return "—";
  const full = [client.firstName, client.lastName].filter(Boolean).join(" ");
  return full || client.email;
}

function fmt(val: string | number | null | undefined): string {
  return parseFloat(String(val ?? 0)).toFixed(2);
}

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  function addItem() {
    onChange([...items, { description: "", quantity: "1", unitPrice: "0" }]);
  }
  function updateItem(idx: number, field: keyof LineItem, value: string) {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  const subtotal = items.reduce((sum, li) =>
    sum + parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0"), 0);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
        <span className="col-span-6">Description</span>
        <span className="col-span-2">Qty</span>
        <span className="col-span-3">Unit Price</span>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <Input className="col-span-6 h-8" placeholder="Description" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} />
          <Input className="col-span-2 h-8" placeholder="Qty" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
          <Input className="col-span-3 h-8" placeholder="Unit Price" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} />
          <Button type="button" variant="ghost" size="icon" className="col-span-1 h-8 w-8" onClick={() => removeItem(idx)}>
            <Trash2 className="h-3.5 w-3.5 text-slate-400" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Add Line Item
      </Button>
      {items.length > 0 && (
        <div className="text-right text-sm text-slate-600 font-medium pt-1 border-t border-slate-100">
          Subtotal (before tax): {fmt(subtotal)}
        </div>
      )}
    </div>
  );
}

export default function InvoiceDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: me } = useGetMe();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string;
    notes: string;
    issueDate: string;
    dueDate: string;
    lineItems: LineItem[];
  }>({ title: "", notes: "", issueDate: "", dueDate: "", lineItems: [] });

  const { data: invoice, isLoading, isError } = useGetInvoice(id);

  const { mutate: updateInvoice, isPending: isSaving } = useUpdateInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: "Invoice updated" });
        setEditing(false);
        qc.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const { mutate: deleteInvoice, isPending: isDeleting } = useDeleteInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: "Invoice deleted" });
        setLocation("/invoices");
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const inv = invoice as unknown as InvoiceWithRelations | undefined;
  const canEdit = me && ["admin", "project_manager", "germany_accountant", "india_accountant"].includes(me.role);
  const isDraft = inv?.status === "draft";

  function startEditing() {
    if (!inv) return;
    setEditForm({
      title: inv.title,
      notes: inv.notes ?? "",
      issueDate: inv.issueDate,
      dueDate: inv.dueDate ?? "",
      lineItems: (inv.lineItems ?? []).map(li => ({
        description: li.description,
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
        timeEntryId: (li as { timeEntryId?: number | null }).timeEntryId ?? null,
      })),
    });
    setEditing(true);
  }

  function saveEdits() {
    updateInvoice({
      id,
      data: {
        title: editForm.title,
        notes: editForm.notes || null,
        issueDate: editForm.issueDate,
        dueDate: editForm.dueDate || null,
        lineItems: editForm.lineItems.filter(li => li.description.trim()),
      },
    });
  }

  function markStatus(status: "sent" | "paid" | "overdue" | "cancelled") {
    updateInvoice({ id, data: { status } });
  }

  function handleDownloadPdf() {
    if (!inv) return;
    generateInvoicePdf(inv as unknown as Parameters<typeof generateInvoicePdf>[0]);
    toast({ title: "PDF generated" });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !inv) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Invoices
        </Button>
        <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-sm text-destructive">
          Invoice not found.
        </div>
      </div>
    );
  }

  const status = STATUS_STYLES[inv.status] ?? { label: inv.status, className: "bg-slate-100 text-slate-600" };
  const taxLabel = TAX_TYPE_LABELS[inv.taxType] ?? inv.taxType;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/invoices")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Invoices
          </Button>
          <Separator orientation="vertical" className="h-5" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">{inv.title}</h1>
              <Badge variant="secondary" className={`text-xs ${status.className}`}>{status.label}</Badge>
              {inv.isRecurring && (
                <Badge variant="outline" className="text-xs">
                  <RefreshCw className="h-2.5 w-2.5 mr-1" />{inv.recurringInterval}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{inv.invoiceNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
          </Button>
          {canEdit && isDraft && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
          {editing && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={isSaving}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
              </Button>
              <Button size="sm" onClick={saveEdits} disabled={isSaving}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> {isSaving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
          {canEdit && !editing && (
            <Select
              value={inv.status}
              onValueChange={(val) => markStatus(val as "sent" | "paid" | "overdue" | "cancelled")}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {inv.status === "draft" && <SelectItem value="sent"><Send className="inline h-3 w-3 mr-1" />Mark Sent</SelectItem>}
                {inv.status === "sent" && <SelectItem value="paid"><CheckCircle className="inline h-3 w-3 mr-1" />Mark Paid</SelectItem>}
                {["draft", "sent"].includes(inv.status) && <SelectItem value="overdue"><Clock className="inline h-3 w-3 mr-1" />Mark Overdue</SelectItem>}
                {["draft", "sent", "overdue"].includes(inv.status) && <SelectItem value="cancelled"><XCircle className="inline h-3 w-3 mr-1" />Cancel</SelectItem>}
              </SelectContent>
            </Select>
          )}
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={isDeleting}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone. The invoice record will be permanently removed.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteInvoice({ id })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Company & Client */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">Parties</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">From</div>
              <div className="font-semibold text-slate-900">{inv.company?.name ?? "—"}</div>
              {inv.company?.taxNumber && <div className="text-sm text-slate-500">Tax: {inv.company.taxNumber}</div>}
              {inv.company?.address && <div className="text-sm text-slate-500 whitespace-pre-line">{inv.company.address}</div>}
              {inv.company?.bankDetails && <div className="text-sm text-slate-500">Bank: {inv.company.bankDetails}</div>}
              <div className="mt-1">
                <Badge variant="outline" className="text-xs">{inv.company?.taxRegime?.toUpperCase() ?? "—"}</Badge>
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Bill To</div>
              <div className="font-semibold text-slate-900">{clientDisplayName(inv.client)}</div>
              {inv.client?.email && <div className="text-sm text-slate-500">{inv.client.email}</div>}
              {inv.project && <div className="text-sm text-slate-500 mt-1">Project: {inv.project.name}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Dates & Meta */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div>
                  <Label className="text-xs">Issue Date</Label>
                  <Input type="date" className="h-8 mt-1" value={editForm.issueDate} onChange={e => setEditForm(f => ({ ...f, issueDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" className="h-8 mt-1" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-xs text-slate-400">Issue Date</div>
                  <div className="text-sm font-medium">{inv.issueDate}</div>
                </div>
                {inv.dueDate && (
                  <div>
                    <div className="text-xs text-slate-400">Due Date</div>
                    <div className="text-sm font-medium">{inv.dueDate}</div>
                  </div>
                )}
                {inv.nextInvoiceDate && (
                  <div>
                    <div className="text-xs text-slate-400">Next Invoice</div>
                    <div className="text-sm font-medium">{inv.nextInvoiceDate}</div>
                  </div>
                )}
              </>
            )}
            <Separator />
            <div>
              <div className="text-xs text-slate-400">Tax Treatment</div>
              <div className="text-sm font-medium">{taxLabel}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Currency</div>
              <div className="text-sm font-medium">{inv.currency}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Title & Notes */}
      {editing ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">Subject & Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input className="mt-1" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea className="mt-1" rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </CardContent>
        </Card>
      ) : inv.notes ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{inv.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Line Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wide">Line Items</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <LineItemsEditor items={editForm.lineItems} onChange={items => setEditForm(f => ({ ...f, lineItems: items }))} />
          ) : (
            <>
              {(inv.lineItems ?? []).length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 text-xs text-slate-400 font-medium">Description</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-medium w-16">Qty</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-medium w-28">Unit Price</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-medium w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(inv.lineItems ?? []).map((li, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="py-2 text-slate-700">{li.description}</td>
                        <td className="py-2 text-right text-slate-600">{li.quantity}</td>
                        <td className="py-2 text-right text-slate-600">{inv.currency} {fmt(li.unitPrice)}</td>
                        <td className="py-2 text-right text-slate-700 font-medium">{inv.currency} {fmt(String((parseFloat(String(li.quantity)) * parseFloat(String(li.unitPrice))).toFixed(2)))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-slate-400 italic">No line items.</p>
              )}
            </>
          )}

          {/* Totals */}
          <div className="mt-4 border-t border-slate-100 pt-4 space-y-1 max-w-xs ml-auto text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{inv.currency} {fmt(inv.subtotal)}</span>
            </div>
            {parseFloat(fmt(inv.taxAmount)) > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>{taxLabel}</span>
                <span>{inv.currency} {fmt(inv.taxAmount)}</span>
              </div>
            )}
            {inv.taxType === "cgst_sgst" && parseFloat(fmt(inv.taxAmount)) > 0 && (
              <>
                <div className="flex justify-between text-slate-500 text-xs pl-2">
                  <span>CGST (9%)</span>
                  <span>{inv.currency} {fmt(parseFloat(fmt(inv.taxAmount)) / 2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-xs pl-2">
                  <span>SGST (9%)</span>
                  <span>{inv.currency} {fmt(parseFloat(fmt(inv.taxAmount)) / 2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-2 mt-1">
              <span>Total Due</span>
              <span>{inv.currency} {fmt(inv.totalAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
