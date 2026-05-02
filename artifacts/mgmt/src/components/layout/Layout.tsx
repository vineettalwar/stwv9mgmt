import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@clerk/react";

export function Layout({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <div className="flex h-screen items-center justify-center bg-slate-50">Loading...</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {isSignedIn && <Sidebar />}
      <main className="flex-1 overflow-y-auto focus:outline-none">
        <div className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
