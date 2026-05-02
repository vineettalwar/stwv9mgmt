import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListOffers,
  useListContracts,
  useListInvoices,
  useListProjects,
  useListCompanies,
  useConvertOfferToContract,
  useSendOffer,
  useSendContract,
  useSendInvoice,
  getListOffersQueryKey,
  getListContractsQueryKey,
  getListInvoicesQueryKey,
  type Offer,
  type Contract,
  type Invoice,
  type Project,
  type Company,
} from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  FileText,
  FileSignature,
  Receipt,
  Download,
  Send,
  ArrowRightLeft,
  RefreshCw,
  FolderOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

const OFFER_STATUS: Record<string, { label: string; cls: string }> = {
  draft:    { label: "Draft",    cls: "bg-slate-100 text-slate-600" },
  sent:     { label: "Sent",     cls: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", cls: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800" },
  expired:  { label: "Expired",  cls: "bg-amber-100 text-amber-800" },
};

const CONTRACT_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-600" },
  sent:      { label: "Sent",      cls: "bg-blue-100 text-blue-800" },
  signed:    { label: "Signed",    cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-800" },
};

const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Draft",     cls: "bg-slate-100 text-slate-600" },
  sent:      { label: "Sent",      cls: "bg-blue-100 text-blue-800" },
  paid:      { label: "Paid",      cls: "bg-emerald-100 text-emerald-800" },
  overdue:   { label: "Overdue",   cls: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", cls: "bg-slate-200 text-slate-500" },
};

function statusBadge(map: Record<string, { label: string; cls: string }>, status: string) {
  const s = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return <Badge className={`text-xs font-medium ${s.cls} border-0`}>{s.label}</Badge>;
}

function fmtAmount(amount: string, currency: string) {
  return `${currency} ${parseFloat(amount).toFixed(2)}`;
}

type PipelineGroup = {
  key: string;
  project: Project | null;
  company: Company | null;
  offers: Offer[];
  contracts: Contract[];
  invoices: Invoice[];
};

// Compact inline related-document link
function RelatedLink({ icon: Icon, label, href }: { icon: React.ElementType; label: string; href: string }) {
  return (
    <Link href={href}>
      <span className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-mono">
        <Icon className="h-3 w-3 flex-shrink-0" />
        {label}
        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
      </span>
    </Link>
  );
}

function OfferCard({
  offer,
  linkedContracts,
  relatedInvoices,
  onConvert,
  converting,
  onDownload,
  onSend,
}: {
  offer: Offer;
  linkedContracts: Contract[];
  relatedInvoices: Invoice[];
  onConvert: (offerId: number) => void;
  converting: boolean;
  onDownload: (type: "offer", id: number, number: string) => void;
  onSend: (type: "offer", id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canConvert = (offer.status === "draft" || offer.status === "sent") && linkedContracts.length === 0;
  const offerData = offer as unknown as { client?: { email: string } | null };
  const hasClientEmail = !!offerData.client?.email;

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Clickable header */}
      <button
        className="w-full text-left p-3 pb-2"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="text-xs font-mono text-slate-500">{offer.offerNumber}</span>
              {expanded ? <ChevronUp className="h-3 w-3 text-slate-300" /> : <ChevronRight className="h-3 w-3 text-slate-300" />}
            </div>
            <p className="text-sm font-medium text-slate-800 leading-tight line-clamp-2">{offer.title}</p>
          </div>
          {statusBadge(OFFER_STATUS, offer.status)}
        </div>
        <p className="text-sm font-semibold text-slate-700 mt-1">
          {fmtAmount(offer.totalAmount, offer.currency)}
        </p>
      </button>

      {/* Expanded: related documents */}
      {expanded && (
        <div className="px-3 pb-2 border-t border-slate-100 pt-2 space-y-1.5">
          {linkedContracts.length > 0 && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Contracts</span>
              {linkedContracts.map(c => (
                <RelatedLink key={c.id} icon={FileSignature} label={c.contractNumber} href="/contracts" />
              ))}
            </div>
          )}
          {relatedInvoices.length > 0 && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Invoices</span>
              {relatedInvoices.map(inv => (
                <RelatedLink key={inv.id} icon={Receipt} label={inv.invoiceNumber} href={`/invoices/${inv.id}`} />
              ))}
            </div>
          )}
          {linkedContracts.length === 0 && relatedInvoices.length === 0 && (
            <p className="text-xs text-slate-400 italic">No related documents yet</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <Link href="/offers">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800">
            <ExternalLink className="h-3 w-3 mr-1" /> View
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800"
          onClick={() => onDownload("offer", offer.id, offer.offerNumber)}
        >
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        {hasClientEmail && (offer.status === "draft" || offer.status === "sent") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => onSend("offer", offer.id)}
          >
            <Send className="h-3 w-3 mr-1" /> Send
          </Button>
        )}
        {canConvert && (
          <Button
            size="sm"
            className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
            disabled={converting}
            onClick={() => onConvert(offer.id)}
          >
            <ArrowRightLeft className="h-3 w-3 mr-1" />
            {converting ? "Converting…" : "→ Contract"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ContractCard({
  contract,
  sourceOffer,
  relatedInvoices,
  onDownload,
  onSend,
}: {
  contract: Contract;
  sourceOffer: Offer | undefined;
  relatedInvoices: Invoice[];
  onDownload: (type: "contract", id: number, number: string) => void;
  onSend: (type: "contract", id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Clickable header */}
      <button
        className="w-full text-left p-3 pb-2"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <FileSignature className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <span className="text-xs font-mono text-slate-500">{contract.contractNumber}</span>
              {expanded ? <ChevronUp className="h-3 w-3 text-slate-300" /> : <ChevronRight className="h-3 w-3 text-slate-300" />}
            </div>
            <p className="text-sm font-medium text-slate-800 leading-tight line-clamp-2">{contract.title}</p>
          </div>
          {statusBadge(CONTRACT_STATUS, contract.status)}
        </div>
        {contract.startDate && (
          <p className="text-xs text-slate-400 mt-0.5">
            {contract.startDate}{contract.endDate ? ` → ${contract.endDate}` : ""}
          </p>
        )}
      </button>

      {/* Expanded: related documents */}
      {expanded && (
        <div className="px-3 pb-2 border-t border-slate-100 pt-2 space-y-1.5">
          {sourceOffer && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Source offer</span>
              <RelatedLink icon={FileText} label={`${sourceOffer.offerNumber} — ${sourceOffer.title}`} href="/offers" />
            </div>
          )}
          {relatedInvoices.length > 0 && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Invoices in this project</span>
              {relatedInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between">
                  <RelatedLink icon={Receipt} label={inv.invoiceNumber} href={`/invoices/${inv.id}`} />
                  <span className="text-xs text-slate-500">{fmtAmount(inv.totalAmount, inv.currency)}</span>
                </div>
              ))}
            </div>
          )}
          {!sourceOffer && relatedInvoices.length === 0 && (
            <p className="text-xs text-slate-400 italic">No related documents</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <Link href="/contracts">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800">
            <ExternalLink className="h-3 w-3 mr-1" /> View
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800"
          onClick={() => onDownload("contract", contract.id, contract.contractNumber)}
        >
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        {(contract as unknown as { client?: { email: string } | null }).client?.email
          && (contract.status === "draft" || contract.status === "sent") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => onSend("contract", contract.id)}
          >
            <Send className="h-3 w-3 mr-1" /> Send
          </Button>
        )}
      </div>
    </div>
  );
}

function InvoiceCard({
  invoice,
  relatedContracts,
  project,
  onDownload,
  onSend,
}: {
  invoice: Invoice;
  relatedContracts: Contract[];
  project: Project | null;
  onDownload: (type: "invoice", id: number, number: string) => void;
  onSend: (type: "invoice", id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = invoice.status === "overdue";

  return (
    <div className={`rounded-lg border bg-white shadow-sm hover:shadow-md transition-shadow ${isOverdue ? "border-red-300" : "border-slate-200"}`}>
      {/* Clickable header → /invoices/:id */}
      <Link href={`/invoices/${invoice.id}`}>
        <div className="p-3 pb-2 cursor-pointer">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Receipt className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-mono text-slate-500 hover:underline">{invoice.invoiceNumber}</span>
                <ExternalLink className="h-2.5 w-2.5 text-slate-300" />
              </div>
              <p className="text-sm font-medium text-slate-800 leading-tight line-clamp-2 hover:text-blue-700">{invoice.title}</p>
            </div>
            {statusBadge(INVOICE_STATUS, invoice.status)}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            {fmtAmount(invoice.totalAmount, invoice.currency)}
          </p>
          {invoice.dueDate && (
            <p className={`text-xs mt-0.5 ${isOverdue ? "text-red-500 font-medium" : "text-slate-400"}`}>
              Due {invoice.dueDate}
            </p>
          )}
        </div>
      </Link>

      {/* Related documents toggle */}
      <button
        className="w-full px-3 py-1.5 border-t border-slate-100 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Related documents
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1.5">
          {project && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Project</span>
              <RelatedLink icon={FolderOpen} label={project.name} href={`/projects/${project.id}`} />
            </div>
          )}
          {relatedContracts.length > 0 && (
            <div>
              <span className="text-xs text-slate-400 block mb-0.5">Contracts</span>
              {relatedContracts.map(c => (
                <RelatedLink key={c.id} icon={FileSignature} label={`${c.contractNumber} (${c.status})`} href="/contracts" />
              ))}
            </div>
          )}
          {!project && relatedContracts.length === 0 && (
            <p className="text-xs text-slate-400 italic">No related documents</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 pb-3 flex flex-wrap gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-slate-500 hover:text-slate-800"
          onClick={() => onDownload("invoice", invoice.id, invoice.invoiceNumber)}
        >
          <Download className="h-3 w-3 mr-1" /> PDF
        </Button>
        {(invoice as unknown as { client?: { email: string } | null }).client?.email
          && (invoice.status === "draft" || invoice.status === "sent") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
            onClick={() => onSend("invoice", invoice.id)}
          >
            <Send className="h-3 w-3 mr-1" /> Send
          </Button>
        )}
      </div>
    </div>
  );
}

function PipelineColumn({
  title,
  icon: Icon,
  count,
  children,
  emptyLabel,
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
  emptyLabel: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2 px-1">
        <Icon className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{title}</span>
        <span className="ml-auto text-xs text-slate-400 font-medium bg-slate-100 px-1.5 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="space-y-2">
        {count === 0
          ? <p className="text-xs text-slate-400 italic px-1">{emptyLabel}</p>
          : children}
      </div>
    </div>
  );
}

function PipelineGroupCard({ group, onConvert, convertingId, onDownload, onSend }: {
  group: PipelineGroup;
  onConvert: (offerId: number) => void;
  convertingId: number | null;
  onDownload: (type: "offer" | "contract" | "invoice", id: number, number: string) => void;
  onSend: (type: "offer" | "contract" | "invoice", id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const totalDocs = group.offers.length + group.contracts.length + group.invoices.length;
  const invoiceTotal = group.invoices.reduce((sum, inv) => sum + parseFloat(inv.totalAmount), 0);
  const invoiceCurrency = group.invoices[0]?.currency ?? "";

  const contractByOfferId = new Map(
    group.contracts.filter(c => c.offerId != null).map(c => [c.offerId!, c])
  );
  const contractsByOfferId = useMemo(() => {
    const m = new Map<number, Contract[]>();
    for (const c of group.contracts) {
      if (c.offerId != null) {
        if (!m.has(c.offerId)) m.set(c.offerId, []);
        m.get(c.offerId)!.push(c);
      }
    }
    return m;
  }, [group.contracts]);
  const offerById = new Map(group.offers.map(o => [o.id, o]));

  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader
        className="py-3 px-4 cursor-pointer select-none"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <FolderOpen className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="font-semibold text-slate-800 truncate">
              {group.project?.name ?? "No Project"}
            </span>
            {group.project && (
              <Link href={`/projects/${group.project.id}`} onClick={e => e.stopPropagation()}>
                <span className="text-xs text-blue-500 hover:underline flex-shrink-0">
                  <ExternalLink className="h-3 w-3 inline" />
                </span>
              </Link>
            )}
            {group.company && (
              <span className="flex items-center gap-1 text-xs text-slate-500 flex-shrink-0">
                <Building2 className="h-3 w-3" />
                {group.company.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{totalDocs} doc{totalDocs !== 1 ? "s" : ""}</span>
              {invoiceTotal > 0 && (
                <span className="font-medium text-slate-700">
                  {invoiceCurrency} {invoiceTotal.toFixed(2)} invoiced
                </span>
              )}
            </div>
            {collapsed
              ? <ChevronDown className="h-4 w-4 text-slate-400" />
              : <ChevronUp className="h-4 w-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex gap-3 items-start">
            <PipelineColumn title="Offers" icon={FileText} count={group.offers.length} emptyLabel="No offers yet">
              {group.offers.map(offer => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  linkedContracts={contractsByOfferId.get(offer.id) ?? []}
                  relatedInvoices={group.invoices}
                  onConvert={onConvert}
                  converting={convertingId === offer.id}
                  onDownload={onDownload}
                  onSend={onSend}
                />
              ))}
            </PipelineColumn>

            <div className="flex-shrink-0 flex items-center justify-center mt-8">
              <ArrowRight className="h-5 w-5 text-slate-300" />
            </div>

            <PipelineColumn title="Contracts" icon={FileSignature} count={group.contracts.length} emptyLabel="No contracts yet">
              {group.contracts.map(contract => (
                <ContractCard
                  key={contract.id}
                  contract={contract}
                  sourceOffer={contract.offerId != null ? offerById.get(contract.offerId) : undefined}
                  relatedInvoices={group.invoices}
                  onDownload={onDownload}
                  onSend={onSend}
                />
              ))}
            </PipelineColumn>

            <div className="flex-shrink-0 flex items-center justify-center mt-8">
              <ArrowRight className="h-5 w-5 text-slate-300" />
            </div>

            <PipelineColumn title="Invoices" icon={Receipt} count={group.invoices.length} emptyLabel="No invoices yet">
              {group.invoices.map(invoice => (
                <InvoiceCard
                  key={invoice.id}
                  invoice={invoice}
                  relatedContracts={group.contracts}
                  project={group.project}
                  onDownload={onDownload}
                  onSend={onSend}
                />
              ))}
            </PipelineColumn>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Pipeline() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const { data: offersRaw, isLoading: offersLoading, refetch: refetchOffers } = useListOffers();
  const { data: contractsRaw, isLoading: contractsLoading, refetch: refetchContracts } = useListContracts();
  const { data: invoicesRaw, isLoading: invoicesLoading, refetch: refetchInvoices } = useListInvoices();
  const { data: projectsRaw, isLoading: projectsLoading } = useListProjects();
  const { data: companiesRaw } = useListCompanies();

  const convertMutation = useConvertOfferToContract();
  const sendOfferMutation = useSendOffer();
  const sendContractMutation = useSendContract();
  const sendInvoiceMutation = useSendInvoice();

  const offers: Offer[] = offersRaw ?? [];
  const contracts: Contract[] = contractsRaw ?? [];
  const invoices: Invoice[] = invoicesRaw ?? [];
  const projects: Project[] = projectsRaw ?? [];
  const companies: Company[] = companiesRaw ?? [];

  const isLoading = offersLoading || contractsLoading || invoicesLoading || projectsLoading;

  const companyMap = useMemo(
    () => new Map(companies.map(c => [c.id, c])),
    [companies]
  );
  const projectMap = useMemo(
    () => new Map(projects.map(p => [p.id, p])),
    [projects]
  );

  const filteredOffers = companyFilter === "all" ? offers : offers.filter(o => String(o.companyId) === companyFilter);
  const filteredContracts = companyFilter === "all" ? contracts : contracts.filter(c => String(c.companyId) === companyFilter);
  const filteredInvoices = companyFilter === "all" ? invoices : invoices.filter(i => String(i.companyId) === companyFilter);

  const pipelineGroups = useMemo((): PipelineGroup[] => {
    const groups = new Map<string, PipelineGroup>();

    function getOrCreate(projectId: number | null | undefined, companyId: number): PipelineGroup {
      const key = projectId != null ? `project:${projectId}` : `company:${companyId}`;
      if (!groups.has(key)) {
        const project = projectId != null ? (projectMap.get(projectId) ?? null) : null;
        const company = companyMap.get(companyId) ?? null;
        groups.set(key, { key, project, company, offers: [], contracts: [], invoices: [] });
      }
      return groups.get(key)!;
    }

    for (const offer of filteredOffers) {
      getOrCreate(offer.projectId, offer.companyId).offers.push(offer);
    }
    for (const contract of filteredContracts) {
      getOrCreate(contract.projectId, contract.companyId).contracts.push(contract);
    }
    for (const invoice of filteredInvoices) {
      getOrCreate(invoice.projectId, invoice.companyId).invoices.push(invoice);
    }

    return Array.from(groups.values()).sort((a, b) => {
      const na = a.project?.name ?? a.company?.name ?? "";
      const nb = b.project?.name ?? b.company?.name ?? "";
      return na.localeCompare(nb);
    });
  }, [filteredOffers, filteredContracts, filteredInvoices, projectMap, companyMap]);

  async function handleConvert(offerId: number) {
    setConvertingId(offerId);
    try {
      await convertMutation.mutateAsync({ id: offerId, data: {} });
      await queryClient.invalidateQueries({ queryKey: getListOffersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      toast({ title: "Contract created", description: "Offer converted to contract successfully." });
    } catch {
      toast({ title: "Conversion failed", description: "Could not convert offer to contract.", variant: "destructive" });
    } finally {
      setConvertingId(null);
    }
  }

  async function handleDownload(type: "offer" | "contract" | "invoice", id: number, docNumber: string) {
    try {
      const token = await getToken();
      const path = type === "offer" ? "offers" : type === "contract" ? "contracts" : "invoices";
      const apiBase = import.meta.env.VITE_API_BASE_URL ?? "/api";
      const res = await fetch(`${apiBase}/${path}/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-${docNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: `Could not download ${type} PDF.`, variant: "destructive" });
    }
  }

  async function handleSend(type: "offer" | "contract" | "invoice", id: number) {
    try {
      if (type === "offer") {
        await sendOfferMutation.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getListOffersQueryKey() });
      } else if (type === "contract") {
        await sendContractMutation.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      } else {
        await sendInvoiceMutation.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getListInvoicesQueryKey() });
      }
      toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} sent`, description: "Email delivered to client." });
    } catch {
      toast({ title: "Send failed", description: `Could not send ${type} email.`, variant: "destructive" });
    }
  }

  function handleRefresh() {
    refetchOffers();
    refetchContracts();
    refetchInvoices();
  }

  const hasData = pipelineGroups.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Offer → Contract → Invoice lifecycle per project. Click any card to see related documents.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="w-52 h-9 text-sm">
            <Building2 className="h-4 w-4 mr-2 text-slate-400" />
            <SelectValue placeholder="All companies" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map(c => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-slate-400">
          {pipelineGroups.length} pipeline group{pipelineGroups.length !== 1 ? "s" : ""}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : !hasData ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-slate-300 mb-4" />
            <p className="text-slate-600 font-medium">No pipeline data yet</p>
            <p className="text-slate-400 text-sm mt-1">
              Create an offer to start a deal pipeline
            </p>
            <div className="flex gap-2 mt-4">
              <Link href="/offers">
                <Button size="sm" variant="outline">Go to Offers</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {pipelineGroups.map(group => (
            <PipelineGroupCard
              key={group.key}
              group={group}
              onConvert={handleConvert}
              convertingId={convertingId}
              onDownload={handleDownload}
              onSend={handleSend}
            />
          ))}
        </div>
      )}
    </div>
  );
}
