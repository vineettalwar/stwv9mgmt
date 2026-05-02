import React, { useEffect, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, RedirectToSignIn, useAuth, AuthenticateWithRedirectCallback } from "@clerk/react";
import { setAuthTokenGetter, useGetMe } from "@workspace/api-client-react";

import { Layout } from "@/components/layout/Layout";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Companies from "@/pages/companies";
import CompanyDetail from "@/pages/company-detail";
import Users from "@/pages/users";
import UserDetail from "@/pages/user-detail";
import Settings from "@/pages/settings";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import ClientPortal from "@/pages/client-portal";
import FreelancerPortal from "@/pages/freelancer-portal";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import TimeTracking from "@/pages/time-tracking";
import Todos from "@/pages/todos";
import Offers from "@/pages/offers";
import Contracts from "@/pages/contracts";
import Invoices from "@/pages/invoices";
import InvoiceDetail from "@/pages/invoice-detail";
import DocumentCentre from "@/pages/document-centre";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const e = error as { status?: number };
        if (e?.status === 401 || e?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

type UserRole =
  | "admin"
  | "germany_accountant"
  | "india_accountant"
  | "project_manager"
  | "client"
  | "freelancer";

function ApiTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(async () => await getToken());
  }, [getToken]);
  return null;
}

function ClerkProviderWithRouter({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey!}
      routerPush={(to) => setLocation(to)}
      routerReplace={(to) => setLocation(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}

function PrivateRoute({
  component: Component,
  allowedRoles,
}: {
  component: React.ComponentType;
  allowedRoles?: UserRole[];
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe();

  if (!isLoaded || (isSignedIn && meLoading && !me)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (!isSignedIn) return <RedirectToSignIn />;

  if (allowedRoles && me) {
    const role = me.role as UserRole;
    if (!allowedRoles.includes(role)) {
      if (role === "client") return <Redirect to="/client-portal" replace />;
      if (role === "freelancer") return <Redirect to="/freelancer-portal" replace />;
      return <Redirect to="/settings" replace />;
    }
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function SmartRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const { data: me, isLoading: meLoading } = useGetMe();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoaded || meLoading) return;
    if (!isSignedIn) { setLocation("/sign-in", { replace: true }); return; }
    const role = me?.role as UserRole | undefined;
    if (role === "client") setLocation("/client-portal", { replace: true });
    else if (role === "freelancer") setLocation("/freelancer-portal", { replace: true });
    else setLocation("/dashboard", { replace: true });
  }, [isLoaded, isSignedIn, me, meLoading, setLocation]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400 text-sm">
      Loading…
    </div>
  );
}

const ADMIN_ONLY: UserRole[] = ["admin"];
const STAFF_ROLES: UserRole[] = ["admin", "germany_accountant", "india_accountant", "project_manager"];
const PM_ROLES: UserRole[] = ["admin", "project_manager"];
const WORKER_ROLES: UserRole[] = ["admin", "germany_accountant", "india_accountant", "project_manager", "freelancer"];
const CLIENT_ONLY: UserRole[] = ["client"];
const FREELANCER_ONLY: UserRole[] = ["freelancer"];
const ALL_ROLES: UserRole[] = ["admin", "germany_accountant", "india_accountant", "project_manager", "client", "freelancer"];

function Router() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-in/sso-callback" component={() => <AuthenticateWithRedirectCallback />} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/sso-callback" component={() => <AuthenticateWithRedirectCallback />} />
      <Route path="/" component={SmartRedirect} />
      <Route path="/dashboard" component={() => <PrivateRoute component={Dashboard} allowedRoles={STAFF_ROLES} />} />
      <Route path="/companies" component={() => <PrivateRoute component={Companies} allowedRoles={STAFF_ROLES} />} />
      <Route path="/companies/:id" component={() => <PrivateRoute component={CompanyDetail} allowedRoles={STAFF_ROLES} />} />
      <Route path="/users" component={() => <PrivateRoute component={Users} allowedRoles={ADMIN_ONLY} />} />
      <Route path="/users/:id" component={() => <PrivateRoute component={UserDetail} allowedRoles={ADMIN_ONLY} />} />
      <Route path="/projects" component={() => <PrivateRoute component={Projects} allowedRoles={ALL_ROLES} />} />
      <Route path="/projects/:id" component={() => <PrivateRoute component={ProjectDetail} allowedRoles={ALL_ROLES} />} />
      <Route path="/time-tracking" component={() => <PrivateRoute component={TimeTracking} allowedRoles={WORKER_ROLES} />} />
      <Route path="/todos" component={() => <PrivateRoute component={Todos} allowedRoles={STAFF_ROLES} />} />
      <Route path="/documents" component={() => <PrivateRoute component={DocumentCentre} allowedRoles={STAFF_ROLES} />} />
      <Route path="/offers" component={() => <PrivateRoute component={Offers} allowedRoles={STAFF_ROLES} />} />
      <Route path="/contracts" component={() => <PrivateRoute component={Contracts} allowedRoles={STAFF_ROLES} />} />
      <Route path="/invoices" component={() => <PrivateRoute component={Invoices} allowedRoles={STAFF_ROLES} />} />
      <Route path="/invoices/:id" component={() => <PrivateRoute component={InvoiceDetail} allowedRoles={STAFF_ROLES} />} />
      <Route path="/client-portal" component={() => <PrivateRoute component={ClientPortal} allowedRoles={CLIENT_ONLY} />} />
      <Route path="/freelancer-portal" component={() => <PrivateRoute component={FreelancerPortal} allowedRoles={FREELANCER_ONLY} />} />
      <Route path="/settings" component={() => <PrivateRoute component={Settings} allowedRoles={ALL_ROLES} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  if (!clerkPubKey) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-center text-sm p-4 text-slate-600">
        Missing VITE_CLERK_PUBLISHABLE_KEY environment variable
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <ClerkProviderWithRouter>
            <ApiTokenBridge />
            <Router />
          </ClerkProviderWithRouter>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
