import { SignIn, useSignIn } from "@clerk/react";
import { useState } from "react";
import { useLocation } from "wouter";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <span className="text-xl font-bold font-mono">S</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900 tracking-tight">STWV Management</h1>
        <p className="mt-2 text-sm text-slate-500">Sign in to your account</p>
      </div>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      {import.meta.env.DEV && <DevLoginPanel />}
    </div>
  );
}

const DEV_ROLES: Array<{ key: "admin" | "project_manager" | "client" | "freelancer"; label: string }> = [
  { key: "admin", label: "Admin" },
  { key: "project_manager", label: "Project Manager" },
  { key: "client", label: "Client" },
  { key: "freelancer", label: "Freelancer" },
];

function DevLoginPanel() {
  const { signIn } = useSignIn();
  const [, setLocation] = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(role: (typeof DEV_ROLES)[number]["key"]) {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch("/api/dev/sign-in-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const { token } = (await res.json()) as { token: string };

      // Clerk v6 future flow: hand the ticket in, then finalize() activates
      // the resulting session (the v5 setActive equivalent).
      const ticketResult = await signIn.ticket({ ticket: token });
      if (ticketResult.error) throw new Error(ticketResult.error.message);

      const finalizeResult = await signIn.finalize();
      if (finalizeResult.error) throw new Error(finalizeResult.error.message);

      setLocation("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Dev login failed";
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-6 w-full max-w-md rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-4"
      data-testid="panel-dev-login"
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
        <span>Dev Only</span>
        <span className="font-normal normal-case text-amber-600">— hidden in production builds</span>
      </div>
      <p className="mb-3 text-xs text-amber-900">
        One-click login as a seeded test user. Skips Clerk verification.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DEV_ROLES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => loginAs(r.key)}
            disabled={busy !== null}
            className="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            data-testid={`button-dev-login-${r.key}`}
          >
            {busy === r.key ? "Signing in…" : r.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-700" data-testid="text-dev-login-error">
          {error}
        </p>
      )}
    </div>
  );
}
