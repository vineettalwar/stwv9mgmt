import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import {
  useGetProjectThread,
  useSendProjectMessage,
  useListProjects,
  useGetMe,
  getGetProjectThreadQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Send, FolderOpen, User } from "lucide-react";
import { Link } from "wouter";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-100 text-purple-800",
  project_manager: "bg-blue-100 text-blue-800",
  germany_accountant: "bg-slate-100 text-slate-700",
  india_accountant: "bg-green-100 text-green-800",
  client: "bg-amber-100 text-amber-800",
  freelancer: "bg-cyan-100 text-cyan-800",
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg, currentUserId }: { msg: Message; currentUserId: number }) {
  const isMine = msg.senderId === currentUserId;
  const senderName = [msg.senderFirstName, msg.senderLastName].filter(Boolean).join(" ") || msg.senderEmail;
  const roleLabel = msg.senderRole.replace(/_/g, " ");
  const roleClass = ROLE_COLORS[msg.senderRole] ?? "bg-slate-100 text-slate-600";

  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {!isMine && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-medium text-slate-700">{senderName}</span>
            <Badge className={`text-[10px] px-1.5 py-0 h-4 ${roleClass}`}>{roleLabel}</Badge>
          </div>
        )}
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm ${
            isMine
              ? "bg-slate-800 text-white rounded-tr-sm"
              : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
          {msg.attachmentUrl && (
            <a
              href={msg.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 block text-xs underline ${isMine ? "text-slate-300" : "text-blue-600"}`}
            >
              📎 {msg.attachmentName ?? "Attachment"}
            </a>
          )}
        </div>
        <span className="text-[11px] text-slate-400 px-1">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

function ThreadView({ projectId, projectName }: { projectId: number; projectName: string }) {
  const { data: me } = useGetMe();
  const { data: thread, isLoading } = useGetProjectThread(projectId);
  const [body, setBody] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate: sendMessage, isPending } = useSendProjectMessage({
    mutation: {
      onSuccess: () => {
        setBody("");
        queryClient.invalidateQueries({ queryKey: getGetProjectThreadQueryKey(projectId) });
      },
      onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread?.messages]);

  function handleSend() {
    const trimmed = body.trim();
    if (!trimmed) return;
    sendMessage({ id: projectId, data: { body: trimmed } });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-3/4" />)}
        </div>
      </div>
    );
  }

  const messages = thread?.messages ?? [];
  const currentUserId = me?.id ?? -1;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-slate-200 px-4 py-3 bg-white">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-800">{projectName}</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">Project message thread — all parties can see these messages</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-16">
            <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
            <p className="text-sm">No messages yet. Be the first to start the conversation.</p>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} currentUserId={currentUserId} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="border-t border-slate-200 p-4 bg-white">
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message… (Ctrl+Enter to send)"
            className="resize-none min-h-[72px] text-sm"
            data-testid="input-message-body"
          />
          <Button
            onClick={handleSend}
            disabled={isPending || !body.trim()}
            className="self-end"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CommunicationHub() {
  const params = useParams<{ id?: string }>();
  const { data: projects, isLoading: projectsLoading } = useListProjects();
  const [selectedId, setSelectedId] = useState<number | null>(
    params.id ? parseInt(params.id) : null
  );

  const selectedProject = (projects ?? []).find(p => p.id === selectedId);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden -mx-6 -my-6">
      {/* Sidebar: project list */}
      <div className="w-64 border-r border-slate-200 bg-white flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-800">Communication Hub</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {projectsLoading ? (
            <div className="space-y-2 px-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (projects ?? []).length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-xs">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No projects available
            </div>
          ) : (
            (projects ?? []).map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                data-testid={`project-thread-${p.id}`}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  selectedId === p.id ? "bg-slate-100 border-l-2 border-l-slate-800" : ""
                }`}
              >
                <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{p.company?.name ?? ""}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main thread view */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedProject ? (
          <ThreadView projectId={selectedProject.id} projectName={selectedProject.name} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50">
            <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-sm">Select a project to open its message thread</p>
          </div>
        )}
      </div>
    </div>
  );
}
