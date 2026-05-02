import { Link, useLocation } from "wouter";
import { 
  Building2, 
  Users, 
  LayoutDashboard, 
  Settings,
  LogOut 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClerk } from "@clerk/react";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Companies", href: "/companies", icon: Building2 },
  { name: "Users", href: "/users", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();
  const { signOut } = useClerk();

  return (
    <div className="flex h-full w-64 flex-col bg-slate-900 text-slate-50 border-r border-slate-800">
      <div className="flex h-16 items-center px-6 border-b border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white font-mono font-bold mr-3 shadow-sm border border-slate-700">
          S
        </div>
        <span className="text-sm font-bold tracking-tight">STWV Mgmt</span>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = location.startsWith(item.href);
            return (
              <Link key={item.name} href={item.href}>
                <a
                  data-testid={`nav-${item.name.toLowerCase()}`}
                  className={cn(
                    isActive
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100",
                    "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors"
                  )}
                >
                  <item.icon
                    className={cn(
                      isActive ? "text-slate-300" : "text-slate-500 group-hover:text-slate-300",
                      "mr-3 h-5 w-5 flex-shrink-0 transition-colors"
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </a>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-slate-800">
        <button
          onClick={() => signOut()}
          data-testid="nav-signout"
          className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800/50 hover:text-slate-100 transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5 flex-shrink-0 text-slate-500 group-hover:text-slate-300 transition-colors" />
          Sign out
        </button>
      </div>
    </div>
  );
}
