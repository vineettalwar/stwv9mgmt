import { Link, useLocation } from "wouter";
import {
  Building2,
  Users,
  LayoutDashboard,
  Settings,
  LogOut,
  Briefcase,
  Clock,
  FolderOpen,
  ClipboardList,
  FileText,
  FileSignature,
  Receipt,
  Archive,
  MessageSquare,
  Shield,
  GitCommitHorizontal,
  ScrollText,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";
import { useGetMe } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

type UserRole =
  | "admin"
  | "germany_accountant"
  | "india_accountant"
  | "project_manager"
  | "client"
  | "freelancer";

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  testId: string;
  allowedRoles: UserRole[];
};

const navigation: NavItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    testId: "nav-dashboard",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Companies",
    href: "/companies",
    icon: Building2,
    testId: "nav-companies",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Users",
    href: "/users",
    icon: Users,
    testId: "nav-users",
    allowedRoles: ["admin"],
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderOpen,
    testId: "nav-projects",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager", "freelancer"],
  },
  {
    name: "Time Tracking",
    href: "/time-tracking",
    icon: Clock,
    testId: "nav-time-tracking",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager", "freelancer"],
  },
  {
    name: "TODOs",
    href: "/todos",
    icon: ClipboardList,
    testId: "nav-todos",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Documents",
    href: "/documents",
    icon: Archive,
    testId: "nav-documents",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Pipeline",
    href: "/pipeline",
    icon: GitCommitHorizontal,
    testId: "nav-pipeline",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Offers",
    href: "/offers",
    icon: FileText,
    testId: "nav-offers",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Contracts",
    href: "/contracts",
    icon: FileSignature,
    testId: "nav-contracts",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Invoices",
    href: "/invoices",
    icon: Receipt,
    testId: "nav-invoices",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager"],
  },
  {
    name: "Communication Hub",
    href: "/communication-hub",
    icon: MessageSquare,
    testId: "nav-communication-hub",
    allowedRoles: ["admin", "germany_accountant", "india_accountant", "project_manager", "client", "freelancer"],
  },
  {
    name: "Compliance",
    href: "/compliance",
    icon: Shield,
    testId: "nav-compliance",
    allowedRoles: ["admin", "germany_accountant", "india_accountant"],
  },
  {
    name: "Audit Log",
    href: "/audit-log",
    icon: ScrollText,
    testId: "nav-audit-log",
    allowedRoles: ["admin"],
  },
  {
    name: "Reports",
    href: "/reports",
    icon: BarChart3,
    testId: "nav-reports",
    allowedRoles: ["admin", "project_manager"],
  },
  {
    name: "My Portal",
    href: "/client-portal",
    icon: Briefcase,
    testId: "nav-client-portal",
    allowedRoles: ["client"],
  },
  {
    name: "My Portal",
    href: "/freelancer-portal",
    icon: Briefcase,
    testId: "nav-freelancer-portal",
    allowedRoles: ["freelancer"],
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
    testId: "nav-settings",
    allowedRoles: [
      "admin",
      "germany_accountant",
      "india_accountant",
      "project_manager",
      "client",
      "freelancer",
    ],
  },
];

export function Sidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { data: me, isLoading } = useGetMe();

  const role = (me?.role as UserRole | undefined) ?? null;

  const visibleNav = role
    ? navigation.filter((item) => item.allowedRoles.includes(role))
    : [];

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 text-slate-50 border-r border-slate-800">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-700 text-white font-mono font-bold mr-3 shadow-sm border border-slate-600">
          S
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight block">STWV Mgmt</span>
          {me && (
            <span className="text-xs text-slate-400 capitalize">
              {me.role.replace(/_/g, " ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        {isLoading ? (
          <div className="space-y-1 px-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full bg-slate-800" />
            ))}
          </div>
        ) : (
          <nav className="space-y-1 px-3">
            {visibleNav.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link
                  key={item.testId}
                  href={item.href}
                  data-testid={item.testId}
                  className={cn(
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100",
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  )}
                >
                  <item.icon
                    className={cn(
                      isActive
                        ? "text-slate-300"
                        : "text-slate-500 group-hover:text-slate-300",
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors",
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {me && (
        <div className="px-4 py-3 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-slate-200 font-semibold text-sm flex-shrink-0">
              {me.firstName?.[0] ?? me.email[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-200 truncate">
                {[me.firstName, me.lastName].filter(Boolean).join(" ") || me.email}
              </div>
              <div className="text-xs text-slate-400 truncate">{me.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            data-testid="nav-signout"
            className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5 flex-shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
