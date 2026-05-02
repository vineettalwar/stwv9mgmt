import { useState } from "react";
import {
  useListOffers,
  useListContracts,
  useListInvoices,
  useListProjects,
  useListCompanies,
  useListUsers,
  type Offer,
  type Contract,
  type Invoice,
} from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "wouter";
import { FileText, FileSignature, Receipt, ArrowRight, Building2, FolderOpen, User } from "lucide-react";

const OFFER_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  expired: { label: "Expired", className: "bg-amber-100 text-amber-800" },
};

const CONTRACT_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  signed: { label: "Signed", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-200 text-slate-500" },
};

type DocType = "all" | "offers" | "contracts" | "invoices";

export default function DocumentCentre() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState<DocType>("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const { data: me } = useGetMe();
  const { data: offers, isLoading: offersLoading } = useListOffers();
  const { data: contracts, isLoading: contractsLoading } = useListContracts();
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices();
  const { data: companies } = useListCompanies();
  const { data: projects } = useListProjects();
  const { data: users } = useListUsers();

  const clients = (users ?? []).filter((u) => u.role === "client");
  const isLoading = offersLoading || contractsLoading || invoicesLoading;

  type OfferType = Offer;
  type ContractType = Contract;
  type InvoiceType = Invoice;

  function matchesFilters(
    doc: OfferType | ContractType | InvoiceType,
    searchStr: string,
    companyId: string,
    projectId: string,
    clientId: string,
  ) {
    const d = doc as unknown as {
      title?: string;
      offerNumber?: string;
      contractNumber?: string;
      invoiceNumber?: string;
      companyId?: number;
      projectId?: number | null;
      clientId?: number | null;
    };
    const num = d.offerNumber ?? d.contractNumber ?? d.invoiceNumber ?? "";
    const title = (d.title ?? "").toLowerCase();
    const matchSearch = !searchStr || title.includes(searchStr.toLowerCase()) || num.toLowerCase().includes(searchStr.toLowerCase());
    const matchCompany = companyId === "all" || String(d.companyId) === companyId;
    const matchProject = projectId === "all" || String(d.projectId) === projectId;
    const matchClient = clientId === "all" || String(d.clientId) === clientId;
    return matchSearch && matchCompany && matchProject && matchClient;
  }

  const filteredOffers = (docType === "all" || docType === "offers")
    ? (offers ?? []).filter((o) => matchesFilters(o, search, companyFilter, projectFilter, clientFilter))
    : [];

  const filteredContracts = (docType === "all" || docType === "contracts")
    ? (contracts ?? []).filter((c) => matchesFilters(c, search, companyFilter, projectFilter, clientFilter))
    : [];

  const filteredInvoices = (docType === "all" || docType === "invoices")
    ? (invoices ?? []).filter((i) => matchesFilters(i, search, companyFilter, projectFilter, clientFilter))
    : [];

  const totalDocs = filteredOffers.length + filteredContracts.length + filteredInvoices.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Document Centre</h1>
        <p className="text-sm text-slate-500">Unified view of all offers, contracts, and invoices across entities.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search documents..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="offers">Offers</SelectItem>
            <SelectItem value="contracts">Contracts</SelectItem>
            <SelectItem value="invoices">Invoices</SelectItem>
          </SelectContent>
        </Select>
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All companies" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {(companies ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All projects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All clients" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.firstName || u.lastName ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() : u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : totalDocs === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-slate-300" />
          <h3 className="mt-4 text-lg font-medium text-slate-900">No documents found</h3>
          <p className="mt-1 text-sm text-slate-500">Adjust your filters or create new offers, contracts, or invoices.</p>
          <div className="flex justify-center gap-3 mt-4">
            <Link href="/offers"><Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" /> Offers</Button></Link>
            <Link href="/contracts"><Button variant="outline" size="sm"><FileSignature className="h-4 w-4 mr-1" /> Contracts</Button></Link>
            <Link href="/invoices"><Button variant="outline" size="sm"><Receipt className="h-4 w-4 mr-1" /> Invoices</Button></Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOffers.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Offers ({filteredOffers.length})
                </h2>
                <Link href="/offers">
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                    View all <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="space-y-2">
                {filteredOffers.map((offer) => {
                  const o = offer as unknown as {
                    id: number; offerNumber: string; title: string; status: string;
                    totalAmount: string; currency: string;
                    company?: { name: string } | null;
                    project?: { id: number; name: string } | null;
                    client?: { email: string; firstName?: string | null; lastName?: string | null } | null;
                  };
                  const st = OFFER_STATUS[o.status] ?? { label: o.status, className: "bg-slate-100 text-slate-600" };
                  return (
                    <Card key={o.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-slate-900 truncate">{o.title}</span>
                                <span className="text-xs text-slate-400 font-mono">{o.offerNumber}</span>
                                <Badge variant="secondary" className={`text-xs ${st.className}`}>{st.label}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap mt-0.5">
                                {o.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{o.company.name}</span>}
                                {o.project && <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{o.project.name}</span>}
                                {o.client && <span className="flex items-center gap-1"><User className="h-3 w-3" />{o.client.firstName || o.client.lastName ? `${o.client.firstName ?? ""} ${o.client.lastName ?? ""}`.trim() : o.client.email}</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-slate-900">{o.currency} {parseFloat(String(o.totalAmount)).toFixed(2)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {filteredContracts.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <FileSignature className="h-4 w-4" /> Contracts ({filteredContracts.length})
                </h2>
                <Link href="/contracts">
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                    View all <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="space-y-2">
                {filteredContracts.map((contract) => {
                  const c = contract as unknown as {
                    id: number; contractNumber: string; title: string; status: string; type: string;
                    company?: { name: string } | null;
                    project?: { id: number; name: string } | null;
                    client?: { email: string; firstName?: string | null; lastName?: string | null } | null;
                  };
                  const st = CONTRACT_STATUS[c.status] ?? { label: c.status, className: "bg-slate-100 text-slate-600" };
                  return (
                    <Card key={c.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <FileSignature className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-slate-900 truncate">{c.title}</span>
                                <span className="text-xs text-slate-400 font-mono">{c.contractNumber}</span>
                                <Badge variant="secondary" className={`text-xs ${st.className}`}>{st.label}</Badge>
                                <Badge variant="outline" className="text-xs capitalize">{c.type.replace(/_/g, " ")}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap mt-0.5">
                                {c.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{c.company.name}</span>}
                                {c.project && <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{c.project.name}</span>}
                                {c.client && <span className="flex items-center gap-1"><User className="h-3 w-3" />{c.client.firstName || c.client.lastName ? `${c.client.firstName ?? ""} ${c.client.lastName ?? ""}`.trim() : c.client.email}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}

          {filteredInvoices.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Receipt className="h-4 w-4" /> Invoices ({filteredInvoices.length})
                </h2>
                <Link href="/invoices">
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400">
                    View all <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              <div className="space-y-2">
                {filteredInvoices.map((invoice) => {
                  const inv = invoice as unknown as {
                    id: number; invoiceNumber: string; title: string; status: string;
                    totalAmount: string; currency: string; taxType: string; issueDate: string;
                    company?: { name: string } | null;
                    project?: { id: number; name: string } | null;
                    client?: { email: string; firstName?: string | null; lastName?: string | null } | null;
                  };
                  const st = INVOICE_STATUS[inv.status] ?? { label: inv.status, className: "bg-slate-100 text-slate-600" };
                  return (
                    <Card key={inv.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Receipt className="h-4 w-4 text-slate-400 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-slate-900 truncate">{inv.title}</span>
                                <span className="text-xs text-slate-400 font-mono">{inv.invoiceNumber}</span>
                                <Badge variant="secondary" className={`text-xs ${st.className}`}>{st.label}</Badge>
                                <Badge variant="outline" className="text-xs">{inv.taxType.toUpperCase()}</Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap mt-0.5">
                                {inv.company && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{inv.company.name}</span>}
                                {inv.project && <span className="flex items-center gap-1"><FolderOpen className="h-3 w-3" />{inv.project.name}</span>}
                                {inv.client && <span className="flex items-center gap-1"><User className="h-3 w-3" />{inv.client.firstName || inv.client.lastName ? `${inv.client.firstName ?? ""} ${inv.client.lastName ?? ""}`.trim() : inv.client.email}</span>}
                                <span>{inv.issueDate}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-semibold text-slate-900">{inv.currency} {parseFloat(String(inv.totalAmount)).toFixed(2)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
