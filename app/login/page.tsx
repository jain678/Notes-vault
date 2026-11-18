import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in · Notes Vault" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-4xl">🗒️</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Notes Vault</h1>
          <p className="mt-1 text-sm text-zinc-500">Dump anything. Read it back cleanly.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
