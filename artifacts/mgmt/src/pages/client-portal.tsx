import { useState } from "react";
import { useAuth } from "@clerk/react";
import {
  useGetMe,
  useListProjects,
  useListDeliverables,
  useListInvoices,
  useListOffers,
  useListContracts,
  useGetProjectThread,
  useSendProjectMessage,
  getGetProjectThreadQueryKey,
  type Offer,
  type Contract,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  FileText,
  FolderOpen,
  CheckCircle2,
  Circle,
  Clock,
  User,
  MessageSquare,
  Send,
  FileSignature,
  Receipt,
  Download,
} from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  one_time: "One-Time",
  monthly_fixed: "Monthly Fixed",
  amc: "AMC",
  internal: "Internal",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", className: "bg-slate-100 text-slate-600" },
  on_hold: { label: "On Hold", className: "bg-amber-100 text-amber-800" },
};

const DELIVERABLE_ICONS: Record<string, React.ElementType> = {
  todo: Circle,
  in_progress: Clock,
  done: CheckCircle2,
};

const DELIVERABLE_COLORS: Record<string, string> = {
  todo: "text-slate-400",
  in_progress: "text-amber-500",
  done: "text-emerald-500",
};

function formatCurrency(amount: string, currency: string) {
  return `${currency} ${parseFloat(amount).toLocaleString("en", { minimumFractionDigits: 2 })}`;
}

function ClientProjectCard({ project }: { project: { id: number; name: string; type: string; status: string; description?: string | null } }) {
  const { data: deliverables, isLoading } = useListDeliverables(project.id);

  const grouped = {
    todo: (deliverables ?? []).filter(d => d.status === "todo").length,
    in_progress: (deliverables ?? []).filter(d => d.status === "in_progress").length,
    done: (deliverables ?? []).filter(d => d.status === "done").length,
  };

  const statusInfo = STATUS_STYLES[project.status] ?? { label: project.status, className: "bg-slate-100 text-slate-600" };

  return (
    <Card data-testid={`client-project-${project.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">{project.name}</h3>
            </div>
            {project.description && (
              <p className="text-xs text-slate-500">{project.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className={statusInfo.className}>{statusInfo.label}</Badge>
            <Badge variant="outline" className="text-xs">{TYPE_LABELS[project.type] ?? project.type}</Badge>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : (deliverables ?? []).length > 0 ? (
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-2">Deliverables</p>
            <div className="flex items-center gap-4">
              {(["todo", "in_progress", "done"] as const).map(status => {
                const Icon = DELIVERABLE_ICONS[status]!;
                const count = grouped[status];
                return (
                  <div key={status} className={`flex items-center gap-1 text-xs ${DELIVERABLE_COLORS[status]} font-medium`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span>{count} {status.replace("_", " ")}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProjectThread({ projectId, projectName }: { projectId: number; projectName: string }) {
  const [body, setBody] = useState("");
  const { data: me } = useGetMe();
  const { data: thread, isLoading } = useGetProjectThread(projectId);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: sendMessage, isPending } = useSendProjectMessage({
    mutation: {
      onSuccess: () => {
        setBody("");
        queryClient.invalidateQueries({ queryKey: getGetProjectThreadQueryKey(projectId) });
      },
      onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
    },
  });

  const messages = thread?.messages ?? [];
  const currentUserId = me?.id ?? -1;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Messages for {projectName}. All project parties can see these.</p>
      {isLoading ? (
        <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : messages.length === 0 ? (
        <div className="text-center py-6 text-slate-400">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No messages yet. Send the first one below.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {messages.map(msg => {
            const isMine = msg.senderId === currentUserId;
            const senderName = [msg.senderFirstName, msg.senderLastName].filter(Boolean).join(" ") || msg.senderEmail;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg p-2.5 text-xs ${isMine ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-800"}`}>
                  {!isMine && <p className="font-semibold mb-1 text-slate-600">{senderName}</p>}
                  <p>{msg.body}</p>
                  <p className={`mt-1 text-[10px] ${isMine ? "text-slate-400" : "text-slate-400"}`}>
                    {new Date(msg.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a message..."
          className="resize-none text-xs min-h-[56px]"
          data-testid={`input-client-message-${projectId}`}
        />
        <Button
          size="sm"
          disabled={isPending || !body.trim()}
          onClick={() => {
            if (!body.trim()) return;
            sendMessage({ id: projectId, data: { body: body.trim() } });
          }}
          className="self-end"
          data-testid={`button-send-client-message-${projectId}`}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const INVOICE_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};

const OFFER_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  accepted: { label: "Accepted", className: "bg-emerald-100 text-emerald-800" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800" },
  expired: { label: "Expired", className: "bg-slate-100 text-slate-500" },
};

const CONTRACT_STATUS: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800" },
  signed: { label: "Signed", className: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500" },
};

type TabKey = "projects" | "invoices" | "offers" | "contracts" | "messages";

export default function ClientPortal() {
  const { toast } = useToast();
  const { getToken } = useAuth();
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const { data: me, isLoading: meLoading } = useGetMe();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices();
  const { data: offers, isLoading: offersLoading } = useListOffers();
  const { data: contracts, isLoading: contractsLoading } = useListContracts();
  const [activeTab, setActiveTab] = useState<TabKey>("projects");

  const assignedCompanies = me?.companies ?? [];
  const myInvoices = (invoices ?? []).filter(inv => inv.clientId === me?.id);
  const myOffers = (offers ?? []).filter(off => off.clientId === me?.id);
  const myContracts = (contracts ?? []).filter(c => c.clientId === me?.id);

  const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
    { key: "projects", label: "Projects", icon: FolderOpen },
    { key: "invoices", label: "Invoices", icon: Receipt },
    { key: "offers", label: "Offers", icon: FileText },
    { key: "contracts", label: "Contracts", icon: FileSignature },
    { key: "messages", label: "Messages", icon: MessageSquare },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Client Portal</h1>
        <p className="text-sm text-slate-500">
          Welcome back{me?.firstName ? `, ${me.firstName}` : ""}. Here's an overview of your projects and documents.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Companies</CardTitle>
            <Building2 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {meLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-assigned-companies">
                {assignedCompanies.length}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Active Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {projectsLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-active-projects">
                {(projects ?? []).filter(p => p.status === "active").length}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Invoices</CardTitle>
            <Receipt className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {invoicesLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-slate-900" data-testid="stat-invoices">
                {myInvoices.length}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Role</CardTitle>
            <User className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {meLoading ? <Skeleton className="h-6 w-20" /> : (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Client</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-4">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                data-testid={`tab-${tab.key}`}
                className={`flex items-center gap-1.5 pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-slate-800 text-slate-800"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === "projects" && (
        <div className="space-y-3">
          {projectsLoading ? (
            <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}</div>
          ) : (projects ?? []).length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
              <FolderOpen className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">No projects yet</h3>
              <p className="mt-1 text-sm text-slate-500">Your assigned projects will appear here.</p>
            </div>
          ) : (
            (projects ?? []).map(p => <ClientProjectCard key={p.id} project={p} />)
          )}
        </div>
      )}

      {activeTab === "invoices" && (
        <Card>
          <CardContent className="pt-4">
            {invoicesLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : myInvoices.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No invoices issued to you yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {[...myInvoices].sort((a, b) => b.issueDate.localeCompare(a.issueDate)).map(inv => {
                  const statusInfo = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.draft!;
                  return (
                    <div
                      key={inv.id}
                      data-testid={`client-invoice-${inv.id}`}
                      className="flex items-center justify-between py-2 px-3 rounded-md border border-slate-100 bg-slate-50"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inv.invoiceNumber}</p>
                        <p className="text-xs text-slate-500">{inv.title} · {inv.issueDate}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700">{formatCurrency(inv.totalAmount, inv.currency)}</span>
                        <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={downloadingId === inv.id}
                          onClick={async () => {
                            setDownloadingId(inv.id);
                            try {
                              const token = await getToken();
                              const res = await fetch(`/api/invoices/${inv.id}/pdf`, {
                                headers: { Authorization: `Bearer ${token}` },
                              });
                              if (!res.ok) throw new Error("Download failed");
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `${inv.invoiceNumber}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch {
                              toast({ title: "PDF download failed", variant: "destructive" });
                            } finally {
                              setDownloadingId(null);
                            }
                          }}
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          {downloadingId === inv.id ? "…" : "PDF"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "offers" && (
        <Card>
          <CardContent className="pt-4">
            {offersLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : myOffers.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No offers sent to you yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {myOffers.map(offer => {
                  const statusInfo = OFFER_STATUS[offer.status] ?? OFFER_STATUS.draft!;
                  return (
                    <div key={offer.id} data-testid={`row-client-offer-${offer.id}`} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{offer.title}</p>
                        <p className="text-xs text-slate-500">{offer.offerNumber}{offer.validUntil ? ` · Valid until: ${offer.validUntil}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700">{formatCurrency(offer.totalAmount, offer.currency)}</span>
                        <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "contracts" && (
        <Card>
          <CardContent className="pt-4">
            {contractsLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : myContracts.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileSignature className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No contracts assigned to you yet.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {myContracts.map(contract => {
                  const statusInfo = CONTRACT_STATUS[contract.status] ?? CONTRACT_STATUS.draft!;
                  return (
                    <div key={contract.id} data-testid={`row-client-contract-${contract.id}`} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{contract.title}</p>
                        <p className="text-xs text-slate-500">{contract.contractNumber} · {contract.type.replace("_", " ")}{contract.startDate ? ` · From: ${contract.startDate}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "messages" && (
        <div className="space-y-4">
          {projectsLoading ? (
            <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>
          ) : (projects ?? []).length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
              <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-4 text-lg font-medium text-slate-900">No projects</h3>
              <p className="mt-1 text-sm text-slate-500">You need to be assigned to a project to send messages.</p>
            </div>
          ) : (
            (projects ?? []).map(p => (
              <Card key={p.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-slate-700 flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" /> {p.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ProjectThread projectId={p.id} projectName={p.name} />
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
