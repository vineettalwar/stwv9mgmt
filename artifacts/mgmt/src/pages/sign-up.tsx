import { SignUp } from "@clerk/react";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 py-12">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
          <span className="text-xl font-bold font-mono">S</span>
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900 tracking-tight">Create an account</h1>
        <p className="mt-2 text-sm text-slate-500">Join STWV Management</p>
      </div>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </div>
  );
}
