import { Suspense } from "react";
import { Icon } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Vault" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="inline-flex text-accent"><Icon.Logo size={40} /></span>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Vault</h1>
          <p className="mt-1 text-muted">Dump anything. Read it back as a tidy note.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
