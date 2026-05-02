import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListContracts,
  useCreateContract,
  useUpdateContract,
  useDeleteContract,
  useListCompanies,
  useListUsers,
  useListProjects,
  getListContractsQueryKey,
  type Contract,
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
import { Plus, FileSignature, Trash2, Download, CheckCircle, Eye } from "lucide-react";
import { useAuth } from "@clerk/react";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  signed: { label: "Signed", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

const TYPE_LABELS: Record<string, string> = {
  client_service: "Client Service",
  freelancer_service: "Freelancer Service",
};

const DEFAULT_CLIENT_CONTRACT = `# Client Service Agreement

**Parties**
- Service Provider: [COMPANY NAME]
- Client: [CLIENT NAME]

**Scope of Services**
The Service Provider agrees to provide professional services as mutually agreed.

**Payment Terms**
Invoices are due within 30 days of issuance. Late payments may incur interest.

**Intellectual Property**
All work product shall be owned by the Client upon full payment.

**Confidentiality**
Both parties agree to maintain confidentiality of all proprietary information.

**Termination**
Either party may terminate with 30 days written notice.

**Governing Law**
This agreement is governed by applicable law.`;

const DEFAULT_FREELANCER_CONTRACT = `# Freelancer Service Agreement

**Parties**
- Company: [COMPANY NAME]
- Freelancer: [FREELANCER NAME]

**Scope of Work**
The Freelancer agrees to provide services as detailed in the work order.

**Compensation**
The Freelancer shall be compensated per agreed rates, paid within 30 days of invoice.

**Independent Contractor**
The Freelancer is an independent contractor, not an employee.

**Deliverables**
All deliverables shall be submitted as per the agreed timeline.

**Intellectual Property**
All work product created becomes property of the Company upon payment.

**Confidentiality**
The Freelancer agrees to maintain confidentiality of all company information.

**Termination**
Either party may terminate with 14 days written notice.`;

function CreateContractDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    type: "client_service",
    companyId: "", projectId: "", clientId: "",
    title: "", content: DEFAULT_CLIENT_CONTRACT,
    startDate: "", endDate: "",
  });
  const { toast } = useToast();
  const { data: companies } = useListCompanies();
  const { data: users } = useListUsers();
  const { data: projects } = useListProjects();
  const clients = (users ?? []).filter(u => u.role === "client" || u.role === "freelancer");

  const { mutate, isPending } = useCreateContract({
    mutation: {
      onSuccess: () => {
        toast({ title: "Contract created" });
        setOpen(false);
        onCreated();
      },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  function handleTypeChange(type: string) {
    setForm(f => ({
      ...f, type,
      content: type === "client_service" ? DEFAULT_CLIENT_CONTRACT : DEFAULT_FREELANCER_CONTRACT,
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.companyId || !form.title || !form.content) {
      toast({ title: "Company, title and content are required", variant: "destructive" });
      return;
    }
    mutate({
      data: {
        type: form.type as "client_service" | "freelancer_service",
        companyId: parseInt(form.companyId),
        projectId: form.projectId ? parseInt(form.projectId) : null,
        clientId: form.clientId ? parseInt(form.clientId) : null,
        title: form.title,
        content: form.content,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-2" /> New Contract</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Create Contract</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_service">Client Service Agreement</SelectItem>
                  <SelectItem value="freelancer_service">Freelancer Service Agreement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company *</Label>
              <Select value={form.companyId} onValueChange={v => setForm(f => ({ ...f, companyId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select company..." /></SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Title *</Label>
            <Input placeholder="Contract title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Client / Counterparty</Label>
              <Select value={form.clientId || "none"} onValueChange={v => setForm(f => ({ ...f, clientId: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>End Date</Label>
              <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label>Contract Content *</Label>
            <Textarea
              placeholder="Contract clauses and terms..."
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">Supports Markdown formatting.</p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Creating..." : "Create Contract"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type ContractType = Contract;

function ContractCard({ contract }: { contract: ContractType }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [viewOpen, setViewOpen] = useState(false);

  const { mutate: updateContract } = useUpdateContract({
    mutation: {
      onSuccess: () => { toast({ title: "Status updated" }); qc.invalidateQueries({ queryKey: getListContractsQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const { mutate: deleteContract } = useDeleteContract({
    mutation: {
      onSuccess: () => { toast({ title: "Contract deleted" }); qc.invalidateQueries({ queryKey: getListContractsQueryKey() }); },
      onError: (e: unknown) => toast({ title: "Error", description: String(e), variant: "destructive" }),
    },
  });

  const status = STATUS_STYLES[contract.status] ?? { label: contract.status, className: "bg-slate-100 text-slate-600" };
  const client = (contract as unknown as { client?: { email: string; firstName?: string | null; lastName?: string | null } | null }).client;
  const project = (contract as unknown as { project?: { id: number; name: string } | null }).project;
  const company = (contract as unknown as { company?: { name: string } | null }).company;
  const { getToken } = useAuth();

  async function handleDownloadPdf() {
    try {
      const token = await getToken();
      const res = await fetch(`/api/contracts/${contract.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href; a.download = `contract-${contract.contractNumber}.pdf`; a.click();
      URL.revokeObjectURL(href);
      toast({ title: "PDF downloaded" });
    } catch {
      toast({ title: "PDF download failed", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-slate-900">{contract.title}</span>
              <Badge variant="secondary" className={`text-xs ${status.className}`}>{status.label}</Badge>
              <Badge variant="outline" className="text-xs">{TYPE_LABELS[contract.type] ?? contract.type}</Badge>
              <span className="text-xs text-slate-400 font-mono">{contract.contractNumber}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 flex-wrap">
              <span>{company?.name ?? "—"}</span>
              {client && <span>Party: {client.firstName || client.lastName ? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim() : client.email}</span>}
              {project && <span>Project: {project.name}</span>}
              {contract.startDate && <span>{contract.startDate} → {contract.endDate ?? "ongoing"}</span>}
              {contract.signedAt && <span className="text-emerald-600">Signed: {new Date(contract.signedAt).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => setViewOpen(true)} title="View contract">
              <Eye className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleDownloadPdf} title="Download PDF">
              <Download className="h-4 w-4" />
            </Button>
            {contract.status !== "signed" && contract.status !== "cancelled" && (
              <Button variant="ghost" size="sm" onClick={() => updateContract({ id: contract.id, data: { status: "signed" } })}>
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark Signed
              </Button>
            )}
            {contract.status === "draft" && (
              <Button variant="ghost" size="sm" onClick={() => updateContract({ id: contract.id, data: { status: "sent" } })}>
                Mark Sent
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
                  <AlertDialogTitle>Delete Contract?</AlertDialogTitle>
                  <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteContract({ id: contract.id })}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardContent>
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{contract.title}</DialogTitle>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono bg-slate-50 p-4 rounded-lg">
            {(contract as unknown as { content: string }).content}
          </pre>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function Contracts() {
  const qc = useQueryClient();
  const { data: contracts, isLoading, isError } = useListContracts();
  const { data: me } = useGetMe();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const canCreate = me && ["admin", "project_manager"].includes(me.role);

  const filtered = (contracts ?? []).filter(c => {
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchType = typeFilter === "all" || c.type === typeFilter;
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.contractNumber.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchType && matchSearch;
  });

  function refresh() { qc.invalidateQueries({ queryKey: getListContractsQueryKey() }); }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Contracts</h1>
          <p className="text-sm text-slate-500">Client and freelancer service agreements.</p>
        </div>
        {canCreate && <CreateContractDialog onCreated={refresh} />}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search contracts..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_STYLES).map(([val, { label }]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="client_service">Client Service</SelectItem>
            <SelectItem value="freelancer_service">Freelancer Service</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : isError ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-sm text-destructive">Failed to load contracts.</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <FileSignature className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No contracts found</h3>
          <p className="mt-1 text-sm text-slate-500">{canCreate ? "Create a new contract or convert an offer." : "No contracts yet."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(contract => <ContractCard key={contract.id} contract={contract} />)}
        </div>
      )}
    </div>
  );
}
