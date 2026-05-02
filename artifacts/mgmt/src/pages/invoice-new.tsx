import { useState } from "react";
import { useLocation } from "wouter";
import {
  useCreateInvoice,
  useListCompanies,
  useListUsers,
  useListProjects,
  useListProjectTimeEntries,
  type TimeEntry,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

type LineItem = { description: string; quantity: string; unitPrice: string; timeEntryId?: number | null };

function getTaxTypeForCompany(taxRegime: string): string {
  if (taxRegime === "vat") return "vat";
  if (taxRegime === "gst") return "cgst_sgst";
  return "none";
}

function LineItemsEditor({ items, onChange }: { items: LineItem[]; onChange: (items: LineItem[]) => void }) {
  function addItem() { onChange([...items, { description: "", quantity: "1", unitPrice: "0" }]); }
  function updateItem(idx: number, field: keyof LineItem, value: string) {
    onChange(items.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }
  function removeItem(idx: number) { onChange(items.filter((_, i) => i !== idx)); }
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
        <div className="text-right text-sm text-slate-600 font-medium pt-1 border-t border-slate-100">
          Subtotal (before tax): {subtotal.toFixed(2)}
        </div>
      )}
    </div>
  );
}

export default function InvoiceNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState({
    companyId: "", projectId: "", clientId: "",
    title: "", notes: "", issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "", taxType: "", currency: "",
    sellerState: "", buyerState: "",
    isRecurring: false, recurringInterval: "monthly",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<number[]>([]);

  const { data: companies } = useListCompanies();
  const { data: users } = useListUsers();
  const { data: projects } = useListProjects();
  const clients = (users ?? []).filter(u => u.role === "client");

  const selectedProjectId = form.projectId ? parseInt(form.projectId) : 0;
  const { data: projectTimeEntries } = useListProjectTimeEntries(selectedProjectId || 1);
  const selectedCompany = (companies ?? []).find(c => String(c.id) === form.companyId);

  const { mutate, isPending } = useCreateInvoice({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Invoice created" });
        setLocation(`/invoices/${(data as { id: number }).id}`);
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  function handleCompanyChange(companyId: string) {
    const company = (companies ?? []).find(c => String(c.id) === companyId);
    const autoTaxType = company?.taxRegime === "gst" ? "" : company ? getTaxTypeForCompany(company.taxRegime) : "";
    setForm(f => ({ ...f, companyId, taxType: autoTaxType, currency: company?.currency ?? "", sellerState: "", buyerState: "" }));
  }

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
      },
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/invoices")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Invoices
        </Button>
        <h1 className="text-xl font-bold text-slate-900">New Invoice</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoice Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
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
                    {clients.map(u => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedCompany && (
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-sm space-y-0.5">
                <div className="font-medium text-slate-700">{selectedCompany.name}</div>
                {selectedCompany.taxNumber && <div className="text-slate-500">Tax No: {selectedCompany.taxNumber}</div>}
                {selectedCompany.address && <div className="text-slate-500 whitespace-pre-line">{selectedCompany.address}</div>}
                <div className="text-slate-500">
                  Tax regime: <span className="font-medium text-slate-700">{selectedCompany.taxRegime.toUpperCase()}</span>
                </div>
              </div>
            )}

            {selectedCompany?.taxRegime === "gst" && !form.taxType && (
              <div className="grid grid-cols-2 gap-4">
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

            <div>
              <Label>Title *</Label>
              <Input placeholder="Invoice title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>

            <div className="grid grid-cols-3 gap-4">
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Project (optional)</Label>
                <Select value={form.projectId || "none"} onValueChange={v => setForm(f => ({ ...f, projectId: v === "none" ? "" : v }))}>
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

            {selectedProjectId > 0 && projectTimeEntries && projectTimeEntries.length > 0 && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">Import from project time entries</span>
                  <Button type="button" size="sm" variant="outline"
                    disabled={selectedTimeEntries.length === 0} onClick={importTimeEntries}>
                    Import selected ({selectedTimeEntries.length})
                  </Button>
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {(projectTimeEntries as TimeEntry[]).map(entry => (
                    <label key={entry.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-100 rounded px-1 py-0.5">
                      <input type="checkbox" checked={selectedTimeEntries.includes(entry.id)}
                        onChange={() => setSelectedTimeEntries(prev =>
                          prev.includes(entry.id) ? prev.filter(x => x !== entry.id) : [...prev, entry.id])}
                        className="rounded" />
                      <span className="text-slate-500 font-mono text-xs w-24 shrink-0">{entry.date}</span>
                      <span className="text-slate-700 flex-1 truncate">{entry.description || "—"}</span>
                      <span className="text-slate-500 text-xs shrink-0">{entry.hours}h</span>
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
              <Textarea placeholder="Additional notes..." value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <Button type="button" variant="outline" onClick={() => setLocation("/invoices")}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Creating…" : "Create Invoice"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
