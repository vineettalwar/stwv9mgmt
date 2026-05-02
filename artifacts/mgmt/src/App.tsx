import React, { useEffect, type ReactNode } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, RedirectToSignIn, useAuth } from "@clerk/react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

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

const queryClient = new QueryClient();
const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ApiTokenBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      return await getToken();
    });
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

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function RedirectToDashboard() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/dashboard", { replace: true });
  }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/" component={RedirectToDashboard} />
      <Route path="/dashboard" component={() => <PrivateRoute component={Dashboard} />} />
      <Route path="/companies" component={() => <PrivateRoute component={Companies} />} />
      <Route path="/companies/:id" component={() => <PrivateRoute component={CompanyDetail} />} />
      <Route path="/users" component={() => <PrivateRoute component={Users} />} />
      <Route path="/users/:id" component={() => <PrivateRoute component={UserDetail} />} />
      <Route path="/settings" component={() => <PrivateRoute component={Settings} />} />
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
