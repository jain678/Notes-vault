"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/notes");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-3 rounded-2xl border border-line bg-white p-6 shadow-sm"
      >
        <h1 className="font-serif text-2xl font-semibold">Choose a new password</h1>
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (min 8 characters)"
          aria-label="New password"
          className={ui.input}
        />
        {error && <p className="text-sm text-log-ink">{error}</p>}
        <button
          disabled={busy}
          className={`w-full ${ui.btnPrimary}`}
        >
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
