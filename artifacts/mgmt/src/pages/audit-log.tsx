import { useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

interface AuditLogActor {
  id: number;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface AuditLogEntry {
  id: number;
  createdAt: string;
  actorId: number | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: number;
  entityLabel: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  projectId: number | null;
  actor: AuditLogActor | null;
}

function actorName(actor: AuditLogActor | null, role: string): string {
  if (!actor) return `System (${role})`;
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return name || actor.email;
}

const ACTION_LABELS: Record<string, string> = {
  status_changed: "Status Changed",
  signed: "Signed",
  filed: "Filed",
  role_changed: "Role Changed",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  invoice: "Invoice",
  contract: "Contract",
  offer: "Offer",
  compliance: "Compliance",
  project: "Project",
  user: "User",
};

const ACTION_BADGE_COLORS: Record<string, string> = {
  status_changed: "bg-blue-100 text-blue-800",
  signed: "bg-emerald-100 text-emerald-800",
  filed: "bg-purple-100 text-purple-800",
  role_changed: "bg-amber-100 text-amber-800",
};

const ENTITY_TYPE_COLORS: Record<string, string> = {
  invoice: "bg-slate-100 text-slate-700",
  contract: "bg-indigo-100 text-indigo-700",
  offer: "bg-sky-100 text-sky-700",
  compliance: "bg-purple-100 text-purple-700",
  project: "bg-emerald-100 text-emerald-700",
  user: "bg-amber-100 text-amber-700",
};

function JsonDiff({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-40 text-slate-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = entry.oldValue || entry.newValue;

  return (
    <div className="border border-slate-200 rounded-md bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => hasDiff && setExpanded(e => !e)}
      >
        <div className="flex-shrink-0 w-4">
          {hasDiff ? (
            expanded
              ? <ChevronDown className="h-4 w-4 text-slate-400" />
              : <ChevronRight className="h-4 w-4 text-slate-400" />
          ) : null}
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center">
          <div className="min-w-0">
            <span className="text-sm font-medium text-slate-900">
              {actorName(entry.actor, entry.actorRole)}
            </span>
            <span className="text-xs text-slate-400 ml-2">({entry.actorRole.replace(/_/g, " ")})</span>
            {entry.entityLabel && (
              <span className="block text-xs text-slate-500 truncate">{entry.entityLabel}</span>
            )}
          </div>

          <Badge className={`text-xs ${ACTION_BADGE_COLORS[entry.action] ?? "bg-slate-100 text-slate-700"}`}>
            {ACTION_LABELS[entry.action] ?? entry.action}
          </Badge>

          <Badge className={`text-xs ${ENTITY_TYPE_COLORS[entry.entityType] ?? "bg-slate-100 text-slate-700"}`}>
            {ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType} #{entry.entityId}
          </Badge>

          <span className="text-xs text-slate-400 whitespace-nowrap">
            {new Date(entry.createdAt).toLocaleString("en-GB", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {expanded && hasDiff && (
        <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 gap-4 bg-slate-50">
          <JsonDiff label="Before" value={entry.oldValue} />
          <JsonDiff label="After" value={entry.newValue} />
        </div>
      )}
    </div>
  );
}

export default function AuditLog() {
  const { data: me, isLoading: meLoading } = useGetMe();

  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState<{
    entityType: string; action: string; dateFrom: string; dateTo: string;
  }>({ entityType: "all", action: "all", dateFrom: "", dateTo: "" });

  const params = new URLSearchParams({ limit: "100" });
  if (applied.entityType !== "all") params.set("entity_type", applied.entityType);
  if (applied.action !== "all") params.set("action", applied.action);
  if (applied.dateFrom) params.set("date_from", applied.dateFrom);
  if (applied.dateTo) params.set("date_to", applied.dateTo);

  const { data: entries, isLoading, refetch } = useQuery<AuditLogEntry[]>({
    queryKey: ["audit-logs", applied],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load audit logs");
      return res.json();
    },
    enabled: me?.role === "admin",
  });

  if (meLoading) return <Skeleton className="h-40 w-full" />;

  if (me?.role !== "admin") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <ShieldAlert className="h-5 w-5" />
        You don't have permission to view the audit log. Admin access required.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Audit Log</h1>
        <p className="text-sm text-slate-500 mt-1">Append-only record of all financially significant actions</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Entity Type</label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Action</label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="status_changed">Status Changed</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                  <SelectItem value="filed">Filed</SelectItem>
                  <SelectItem value="role_changed">Role Changed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">From Date</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">To Date</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36" />
            </div>

            <Button
              onClick={() => {
                setApplied({ entityType, action, dateFrom, dateTo });
                refetch();
              }}
            >
              Apply Filters
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                setEntityType("all");
                setAction("all");
                setDateFrom("");
                setDateTo("");
                setApplied({ entityType: "all", action: "all", dateFrom: "", dateTo: "" });
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
        ) : !entries || entries.length === 0 ? (
          <div className="text-center py-16 text-sm text-slate-400">
            No audit log entries found.
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">{entries.length} entries</p>
            {entries.map(entry => (
              <AuditLogRow key={entry.id} entry={entry} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
