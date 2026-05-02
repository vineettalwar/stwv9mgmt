import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListInvoices,
  useCreateInvoice,
  useUpdateInvoice,
  useDeleteInvoice,
  useSendInvoice,
  useListCompanies,
  useListUsers,
  useListProjects,
  useListProjectTimeEntries,
  useListUnbilledExpenses,
  useMarkExpensesInvoiced,
  getListInvoicesQueryKey,
  type Invoice,
  type TimeEntry,
  type Expense,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Receipt, Trash2, Download, CheckCircle, Send, RefreshCw, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@clerk/react";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-200 text-slate-500" },
};

const TAX_TYPE_LABELS: Record<string, string> = {
  none: "No Tax",
  vat: "MwSt 19% (VAT)",
  cgst_sgst: "CGST+SGST 9%+9%",
  igst: "IGST 18%",
};

type LineItem = { description: string; quantity: string; unitPrice: string; timeEntryId?: number | null };

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  function addItem() {
    onChange([...items, { description: "", quantity: "1", unitPrice: "0" }]);
  }
  function updateItem(idx: number, field: keyof LineItem, value: string) {
    const updated = items.map((item, i) => i === idx ? { ...item, [field]: value } : item);
    onChange(updated);
  }
  function removeItem(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  const subtotal = items.reduce((sum, li) => {
    return sum + parseFloat(li.quantity || "1") * parseFloat(li.unitPrice || "0");
  }, 0);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 text-xs text-slate-400 px-1">
        <span className="col-span-6">Description</span>
        <span className="col-span-2">Qty</span>
        <span className="col-span-3">Unit Price</span>
      </div>
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <Input className="col-span-6" placeholder="Description" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} />
          <Input className="col-span-2" placeholder="Qty" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
          <Input className="col-span-3" placeholder="Unit Price" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", e.target.value)} />
          <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(idx)}>
            <Trash2 className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Add Line Item
      </Button>
      {items.length > 0 && (
        <div className="text-right text-sm text-slate-600 font-medium pt-1">
          Subtotal (before tax): {subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}

function getTaxTypeForCompany(taxRegime: string): string {
  if (taxRegime === "vat") return "vat";
  if (taxRegime === "gst") return "cgst_sgst";
  return "none";
}

function CreateInvoiceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: "", projectId: "", clientId: "",
    title: "", notes: "", issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "", taxType: "", currency: "",
    sellerState: "", buyerState: "",
    isRecurring: false, recurringInterval: "monthly",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<number[]>([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<number[]>([]);
  const { toast } = useToast();
  const { data: companies } = useListCompanies();
  const { data: users } = useListUsers();
  const { data: projects } = useListProjects();
  const clients = (users ?? []).filter(u => u.role === "client");

  const selectedProjectId = form.projectId ? parseInt(form.projectId) : 0;
  const { data: projectTimeEntries } = useListProjectTimeEntries(selectedProjectId || 1);
  const { data: unbilledExpenses } = useListUnbilledExpenses(
    selectedProjectId || 1,
    { query: { enabled: selectedProjectId > 0, queryKey: ["listUnbilledExpenses", selectedProjectId] } },
  );

  const selectedCompany = (companies ?? []).find(c => String(c.id) === form.companyId);

  const { mutate, isPending } = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        toast({ title: "Invoice created" });
        setOpen(false);
        setSelectedExpenseIds([]);
        onCreated();
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  function importTimeEntries() {
    if (!projectTimeEntries || selectedTimeEntries.length === 0) return;
    const toImport = projectTimeEntries.filter((e: TimeEntry) => selectedTimeEntries.includes(e.id));
    const newItems: LineItem[] = toImport.map((e: TimeEntry) => ({
      description: e.description || `Time entry ${e.date}`,
      quantity: e.hours,
      unitPrice: "0",
      timeEntryId: e.id,
    }));
    setLineItems(prev => {
      const filtered = prev.filter(li => li.description.trim() || parseFloat(li.unitPrice) > 0);
      return [...filtered, ...newItems];
    });
    setSelectedTimeEntries([]);
    toast({ title: `${newItems.length} time ${newItems.length === 1 ? "entry" : "entries"} imported` });
  }

  function importExpenses() {
    if (!unbilledExpenses || selectedExpenseIds.length === 0) return;
    const toImport = (unbilledExpenses as Expense[]).filter(e => selectedExpenseIds.includes(e.id));
    const newItems: LineItem[] = toImport.map(e => ({
      description: `Expense (${e.category}): ${e.description} [${e.date}]`,
      quantity: "1",
      unitPrice: parseFloat(e.amount).toFixed(2),
    }));
    setLineItems(prev => {
      const filtered = prev.filter(li => li.description.trim() || parseFloat(li.unitPrice) > 0);
      return [...filtered, ...newItems];
    });
    toast({ title: `${newItems.length} expense${newItems.length !== 1 ? "s" : ""} imported as line items` });
  }

  function toggleExpense(id: number) {
    setSelectedExpenseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleTimeEntry(id: number) {
    setSelectedTimeEntries(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  }

  function handleCompanyChange(companyId: string) {
    const company = (companies ?? []).find(c => String(c.id) === companyId);
    // For GST companies keep taxType empty ("auto") so seller/buyer state fields appear
    // and backend can choose CGST+SGST vs IGST automatically. For others pre-fill.
    const autoTaxType = company?.taxRegime === "gst" ? "" : company ? getTaxTypeForCompany(company.taxRegime) : "";
    setForm(f => ({ ...f, companyId, taxType: autoTaxType, currency: company?.currency ?? "", sellerState: "", buyerState: "" }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyId || !form.title || !form.issueDate) {
      toast({ title: "Company, title and issue date are required", variant: "destructive" });
      return;
    }
    mutate({
      data: {
        companyId: parseInt(form.companyId),
        projectId: form.projectId ? parseInt(form.projectId) : null,
        clientId: form.clientId ? parseInt(form.clientId) : null,
        title: form.title,
        notes: form.notes || null,
        issueDate: form.issueDate,
        dueDate: form.dueDate || null,
        taxType: (form.taxType || undefined) as "none" | "vat" | "cgst_sgst" | "igst" | undefined,
        sellerState: form.sellerState || null,
        buyerState: form.buyerState || null,
        currency: form.currency || undefined,
        isRecurring: form.isRecurring,
        recurringInterval: form.isRecurring ? form.recurringInterval : null,
        lineItems: lineItems.filter(li => li.description.trim()),
        expenseIds: selectedExpenseIds.length > 0 ? selectedExpenseIds : undefined,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New Invoice</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Company *</Label>
              <Select value={form.companyId} onValueChange={handleCompanyChange}>
                <SelectTrigger><SelectValue placeholder="Select company..." /></SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} <span className="text-slate-400 text-xs ml-1">({c.taxRegime.toUpperCase()})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Client</Label>
              <Select value={form.clientId || "none"} onValueChange={v => setForm(f => ({ ...f, clientId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select client..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Title *</Label>
            <Input placeholder="Invoice title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          {selectedCompany && (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
              <div className="font-medium text-slate-700">{selectedCompany.name}</div>
              {selectedCompany.taxNumber && <div className="text-slate-500">Tax No: {selectedCompany.taxNumber}</div>}
              {selectedCompany.address && <div className="text-slate-500 whitespace-pre-line">{selectedCompany.address}</div>}
              {selectedCompany.bankDetails && <div className="text-slate-500">Bank: {selectedCompany.bankDetails}</div>}
              <div className="text-slate-500">Tax regime: <span className="font-medium text-slate-700">{selectedCompany.taxRegime.toUpperCase()}</span></div>
            </div>
          )}

          {selectedCompany?.taxRegime === "gst" && !form.taxType && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Seller State <span className="text-slate-400 text-xs">(for GST auto-detection)</span></Label>
                <Input placeholder="e.g. Maharashtra" value={form.sellerState} onChange={e => setForm(f => ({ ...f, sellerState: e.target.value }))} />
              </div>
              <div>
                <Label>Buyer State <span className="text-slate-400 text-xs">(same → CGST+SGST, different → IGST)</span></Label>
                <Input placeholder="e.g. Karnataka" value={form.buyerState} onChange={e => setForm(f => ({ ...f, buyerState: e.target.value }))} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Issue Date *</Label>
              <Input type="date" value={form.issueDate} onChange={e => setForm(f => ({ ...f, issueDate: e.target.value }))} />
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <Label>Tax Type</Label>
              <Select value={form.taxType || "auto"} onValueChange={v => setForm(f => ({ ...f, taxType: v === "auto" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (from company)</SelectItem>
                  <SelectItem value="none">No Tax</SelectItem>
                  <SelectItem value="vat">MwSt 19% (VAT)</SelectItem>
                  <SelectItem value="cgst_sgst">CGST+SGST 9%+9%</SelectItem>
                  <SelectItem value="igst">IGST 18%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project (optional)</Label>
              <Select value={form.projectId || "none"} onValueChange={v => setForm(f => ({ ...f, projectId: v === "none" ? "" : v, }))}>
                <SelectTrigger><SelectValue placeholder="Link to project..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {(projects ?? []).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Recurring</Label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={form.isRecurring}
                  onChange={e => setForm(f => ({ ...f, isRecurring: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="recurring" className="text-sm text-slate-700">Enable recurring</label>
                {form.isRecurring && (
                  <Select value={form.recurringInterval} onValueChange={v => setForm(f => ({ ...f, recurringInterval: v }))}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {selectedProjectId && projectTimeEntries && projectTimeEntries.length > 0 && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Import from project time entries</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={selectedTimeEntries.length === 0}
                  onClick={importTimeEntries}
                >
                  Import selected ({selectedTimeEntries.length})
                </Button>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {(projectTimeEntries as TimeEntry[]).map(entry => (
                  <label key={entry.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-100 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedTimeEntries.includes(entry.id)}
                      onChange={() => toggleTimeEntry(entry.id)}
                      className="rounded"
                    />
                    <span className="text-slate-500 font-mono text-xs w-24 shrink-0">{entry.date}</span>
                    <span className="text-slate-700 flex-1 truncate">{entry.description || "—"}</span>
                    <span className="text-slate-500 text-xs shrink-0">{entry.hours}h</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {selectedProjectId > 0 && unbilledExpenses && (unbilledExpenses as Expense[]).length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-800">
                  Unbilled billable expenses ({(unbilledExpenses as Expense[]).length})
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={selectedExpenseIds.length === 0}
                    onClick={importExpenses}
                    className="text-xs"
                  >
                    Import as line items ({selectedExpenseIds.length})
                  </Button>
                </div>
              </div>
              <p className="text-xs text-amber-600">Selected expenses will be marked as invoiced after the invoice is created.</p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {(unbilledExpenses as Expense[]).map(exp => (
                  <label key={exp.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-amber-100 rounded px-1 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedExpenseIds.includes(exp.id)}
                      onChange={() => toggleExpense(exp.id)}
                      className="rounded"
                    />
                    <span className="text-slate-500 font-mono text-xs w-24 shrink-0">{exp.date}</span>
                    <span className="text-slate-700 flex-1 truncate">{exp.description}</span>
                    <span className="text-xs text-slate-500 shrink-0 capitalize">{exp.category}</span>
                    <span className="text-slate-900 font-medium text-xs shrink-0">{exp.currency} {parseFloat(exp.amount).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label className="mb-2 block">Line Items</Label>
            <LineItemsEditor items={lineItems} onChange={setLineItems} />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea placeholder="Additional notes..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Creating..." : "Create Invoice"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type InvoiceType = Invoice;

function InvoiceCard({ invoice }: { invoice: InvoiceType }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { mutate: updateInvoice } = useUpdateInvoice({
    mutation: {
      onSuccess: () => { toast({ title: "Status updated" }); qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const { mutate: deleteInvoice } = useDeleteInvoice({
    mutation: {
      onSuccess: () => { toast({ title: "Invoice deleted" }); qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const status = STATUS_STYLES[invoice.status] ?? { label: invoice.status, className: "bg-slate-100 text-slate-600" };
  const client = (invoice as unknown as { client?: { email: string; firstName?: string | null; lastName?: string | null } | null }).client;
  const project = (invoice as unknown as { project?: { id: number; name: string } | null }).project;
  const company = (invoice as unknown as { company?: { name: string } | null }).company;
  const { getToken } = useAuth();
  const sendInvoiceMutation = useSendInvoice({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Invoice sent", description: `Email delivered to ${data.email}` });
        qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      },
      onError: (e: unknown) => toast({ title: "Send failed", description: String(e), variant: "destructive" }),
    },
  });

  async function handleDownloadPdf() {
    try {
      const token = await getToken();
      const res = await fetch(`/api/invoices/${invoice.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = `invoice-${invoice.invoiceNumber}.pdf`; a.click();
      URL.revokeObjectURL(href);
      toast({ title: "PDF downloaded" });
    } catch {
      toast({ title: "PDF download failed", variant: "destructive" });
    }
  }

  const taxLabel = TAX_TYPE_LABELS[invoice.taxType] ?? invoice.taxType;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="font-medium text-slate-900 hover:text-slate-600 hover:underline text-left"
                onClick={() => setLocation(`/invoices/${invoice.id}`)}
              >
                {invoice.title}
              </button>
              <Badge variant="secondary" className={`text-xs ${status.className}`}>{status.label}</Badge>
              <span className="text-xs text-slate-400 font-mono">{invoice.invoiceNumber}</span>
              {invoice.isRecurring && (
                <Badge variant="outline" className="text-xs">
                  <RefreshCw className="h-2.5 w-2.5 mr-1" />{invoice.recurringInterval}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
              <span>{company?.name ?? "—"}</span>
              {client && <span>Client: {client.firstName || client.lastName ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() : client.email}</span>}
              {project && <span>Project: {project.name}</span>}
              <span>Issued: {invoice.issueDate}</span>
              {invoice.dueDate && <span>Due: {invoice.dueDate}</span>}
            </div>
            <div className="flex items-center gap-4 text-sm mt-1">
              <span className="text-slate-500">Subtotal: <span className="font-medium text-slate-800">{invoice.currency} {parseFloat(String(invoice.subtotal)).toFixed(2)}</span></span>
              {parseFloat(String(invoice.taxAmount)) > 0 && (
                <span className="text-slate-500">
                  {taxLabel}: <span className="font-medium text-slate-800">{invoice.currency} {parseFloat(String(invoice.taxAmount)).toFixed(2)}</span>
                </span>
              )}
              <span className="text-slate-900 font-semibold">Total: {invoice.currency} {parseFloat(String(invoice.totalAmount)).toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={handleDownloadPdf} title="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
            {client?.email && (invoice.status === "draft" || invoice.status === "sent") && (
              <Button
                variant="ghost"
                size="sm"
                disabled={sendInvoiceMutation.isPending}
                onClick={() => sendInvoiceMutation.mutate({ id: invoice.id })}
                title={`Send to ${client.email}`}
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                {sendInvoiceMutation.isPending ? "Sending…" : "Send to Client"}
              </Button>
            )}
            {invoice.status === "draft" && (
              <Button variant="ghost" size="sm" onClick={() => updateInvoice({ id: invoice.id, data: { status: "sent" } })}>
                Mark Sent
              </Button>
            )}
            {invoice.status === "sent" && (
              <Button variant="ghost" size="sm" onClick={() => updateInvoice({ id: invoice.id, data: { status: "paid" } })}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark Paid
              </Button>
            )}
            {(invoice.status === "draft" || invoice.status === "sent") && (
              <Button variant="ghost" size="sm" onClick={() => updateInvoice({ id: invoice.id, data: { status: "overdue" } })}>
                Mark Overdue
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Invoice?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteInvoice({ id: invoice.id })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExportButtons() {
  const { data: me } = useGetMe();
  const { toast } = useToast();

  const canExportDatev = me && ["admin", "germany_accountant"].includes(me.role);
  const canExportTally = me && ["admin", "india_accountant"].includes(me.role);

  async function exportFile(url: string, filename: string) {
    try {
      const token = await (window as unknown as { __clerkGetToken?: () => Promise<string> }).__clerkGetToken?.();
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      toast({ title: "Export downloaded" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }

  if (!canExportDatev && !canExportTally) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {canExportDatev && (
        <Button variant="outline" size="sm" onClick={() => exportFile("/api/invoices/export/datev", "datev_export.csv")}>
          <Download className="h-3.5 w-3.5 mr-1" /> DATEV Export (CSV)
        </Button>
      )}
      {canExportTally && (
        <>
          <Button variant="outline" size="sm" onClick={() => exportFile("/api/invoices/export/tally?format=xml", "tally_export.xml")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Tally Export (XML)
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportFile("/api/invoices/export/tally?format=csv", "tally_export.csv")}>
            <Download className="h-3.5 w-3.5 mr-1" /> Tally Export (CSV)
          </Button>
        </>
      )}
    </div>
  );
}

export default function Invoices() {
  const qc = useQueryClient();
  const { data: invoices, isLoading, isError } = useListInvoices();
  const { data: me } = useGetMe();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const canCreate = me && ["admin", "project_manager", "germany_accountant", "india_accountant"].includes(me.role);

  const filtered = (invoices ?? []).filter(inv => {
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    const matchSearch = !search || inv.title.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  function refresh() { qc.invalidateQueries({ queryKey: getListInvoicesQueryKey() }); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Multi-entity invoicing with automatic tax calculation.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportButtons />
          {canCreate && <CreateInvoiceDialog onCreated={refresh} />}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_STYLES).map(([val, { label }]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">Failed to load invoices.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <Receipt className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No invoices found</h3>
          <p className="mt-1 text-sm text-slate-500">{canCreate ? "Create your first invoice using the button above." : "No invoices yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(invoice => <InvoiceCard key={invoice.id} invoice={invoice} />)}
        </div>
      )}
    </div>
  );
}
