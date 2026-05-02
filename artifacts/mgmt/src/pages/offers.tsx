import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOffers,
  useCreateOffer,
  useUpdateOffer,
  useDeleteOffer,
  useConvertOfferToContract,
  useListCompanies,
  useListUsers,
  useListProjects,
  getListOffersQueryKey,
  getListContractsQueryKey,
  type Offer,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, FileText, Trash2, RefreshCw, Download, ArrowRightLeft } from "lucide-react";
import { generateOfferPdf } from "@/lib/pdf-generator";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  expired: { label: "Expired", className: "bg-amber-100 text-amber-800" },
};

type LineItem = { description: string; quantity: string; unitPrice: string };

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

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
          <Input
            className="col-span-6"
            placeholder="Description"
            value={item.description}
            onChange={e => updateItem(idx, "description", e.target.value)}
          />
          <Input
            className="col-span-2"
            placeholder="Qty"
            value={item.quantity}
            onChange={e => updateItem(idx, "quantity", e.target.value)}
          />
          <Input
            className="col-span-3"
            placeholder="Unit Price"
            value={item.unitPrice}
            onChange={e => updateItem(idx, "unitPrice", e.target.value)}
          />
          <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => removeItem(idx)}>
            <Trash2 className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      ))}
      <div className="text-xs text-slate-400 grid grid-cols-12 gap-2 px-1">
        <span className="col-span-6">Description</span>
        <span className="col-span-2">Qty</span>
        <span className="col-span-3">Unit Price</span>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
        <Plus className="h-3 w-3 mr-1" /> Add Line Item
      </Button>
    </div>
  );
}

function CreateOfferDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    companyId: "", projectId: "", clientId: "", title: "",
    notes: "", validUntil: "", currency: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const { toast } = useToast();
  const { data: companies } = useListCompanies();
  const { data: users } = useListUsers();
  const { data: projects } = useListProjects();
  const clients = (users ?? []).filter(u => u.role === "client");

  const { mutate, isPending } = useCreateOffer({
    mutation: {
      onSuccess: () => {
        toast({ title: "Offer created" });
        setOpen(false);
        onCreated();
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyId || !form.title) {
      toast({ title: "Company and title are required", variant: "destructive" });
      return;
    }
    mutate({
      data: {
        companyId: parseInt(form.companyId),
        projectId: form.projectId ? parseInt(form.projectId) : null,
        clientId: form.clientId ? parseInt(form.clientId) : null,
        title: form.title,
        notes: form.notes || null,
        validUntil: form.validUntil || null,
        currency: form.currency || undefined,
        lineItems: lineItems.filter(li => li.description.trim()),
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New Offer</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Offer</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Company *</Label>
              <Select value={form.companyId} onValueChange={v => setForm(f => ({ ...f, companyId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select company..." /></SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
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
            <Input placeholder="Offer title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label>Valid Until</Label>
              <Input type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
            </div>
          </div>

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
            <Button type="submit" disabled={isPending}>{isPending ? "Creating..." : "Create Offer"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type OfferType = Offer;

function OfferCard({ offer, onRefresh }: { offer: OfferType; onRefresh: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { mutate: updateOffer } = useUpdateOffer({
    mutation: {
      onSuccess: () => { toast({ title: "Status updated" }); qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const { mutate: deleteOffer } = useDeleteOffer({
    mutation: {
      onSuccess: () => { toast({ title: "Offer deleted" }); qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const { mutate: convertOffer, isPending: converting } = useConvertOfferToContract({
    mutation: {
      onSuccess: () => {
        toast({ title: "Contract created from offer" });
        qc.invalidateQueries({ queryKey: getListOffersQueryKey() });
        qc.invalidateQueries({ queryKey: getListContractsQueryKey() });
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const status = STATUS_STYLES[offer.status] ?? { label: offer.status, className: "bg-slate-100 text-slate-600" };
  const lineItems = (offer as unknown as { lineItems?: LineItem[] }).lineItems ?? [];
  const client = (offer as unknown as { client?: { email: string; firstName?: string | null; lastName?: string | null } | null }).client;
  const project = (offer as unknown as { project?: { id: number; name: string } | null }).project;
  const company = (offer as unknown as { company?: { name: string } | null }).company;

  function handleDownloadPdf() {
    generateOfferPdf(offer as unknown as Parameters<typeof generateOfferPdf>[0]);
    toast({ title: "PDF generated" });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900">{offer.title}</span>
              <Badge variant="secondary" className={`text-xs ${status.className}`}>{status.label}</Badge>
              <span className="text-xs text-slate-400 font-mono">{offer.offerNumber}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
              <span>{company?.name ?? "—"}</span>
              {client && <span>Client: {client.firstName || client.lastName ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() : client.email}</span>}
              {project && <span>Project: {project.name}</span>}
              {offer.validUntil && <span>Valid until: {offer.validUntil}</span>}
            </div>
            <div className="flex items-center gap-4 text-sm mt-1">
              <span className="text-slate-500">Subtotal: <span className="font-medium text-slate-800">{offer.currency} {parseFloat(String(offer.subtotal)).toFixed(2)}</span></span>
              {parseFloat(String(offer.taxAmount)) > 0 && (
                <span className="text-slate-500">Tax: <span className="font-medium text-slate-800">{offer.currency} {parseFloat(String(offer.taxAmount)).toFixed(2)}</span></span>
              )}
              <span className="text-slate-700 font-semibold">Total: {offer.currency} {parseFloat(String(offer.totalAmount)).toFixed(2)}</span>
            </div>
            {lineItems.length > 0 && (
              <div className="mt-2 text-xs text-slate-400">{lineItems.length} line item{lineItems.length > 1 ? "s" : ""}</div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={handleDownloadPdf} title="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
            {offer.status === "draft" && (
              <Button variant="ghost" size="sm" onClick={() => updateOffer({ id: offer.id, data: { status: "sent" } })}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Mark Sent
              </Button>
            )}
            {(offer.status === "draft" || offer.status === "sent") && (
              <Button variant="ghost" size="sm" disabled={converting}
                onClick={() => convertOffer({ id: offer.id, data: { type: "client_service" } })}>
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> {converting ? "Converting..." : "To Contract"}
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
                  <AlertDialogTitle>Delete Offer?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteOffer({ id: offer.id })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Offers() {
  const qc = useQueryClient();
  const { data: offers, isLoading, isError } = useListOffers();
  const { data: me } = useGetMe();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const canCreate = me && ["admin", "project_manager"].includes(me.role);

  const filtered = (offers ?? []).filter(o => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchSearch = !search || o.title.toLowerCase().includes(search.toLowerCase()) ||
      o.offerNumber.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  function refresh() { qc.invalidateQueries({ queryKey: getListOffersQueryKey() }); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Offers</h1>
          <p className="text-sm text-slate-500">Proposals and offers for clients.</p>
        </div>
        {canCreate && <CreateOfferDialog onCreated={refresh} />}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search offers..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
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
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">Failed to load offers.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No offers found</h3>
          <p className="mt-1 text-sm text-slate-500">{canCreate ? "Create your first offer using the button above." : "No offers yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(offer => <OfferCard key={offer.id} offer={offer} onRefresh={refresh} />)}
        </div>
      )}
    </div>
  );
}
