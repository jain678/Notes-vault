"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot";

const input = ui.input;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const origin = window.location.origin;
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/notes");
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${origin}/auth/callback?next=/notes` },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/notes");
          router.refresh();
        } else {
          setInfo("Check your inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/auth/callback?next=/reset-password`,
        });
        if (error) throw error;
        setInfo("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      {mode !== "forgot" && (
        <div className="mb-5 grid grid-cols-2 rounded-[10px] bg-side p-1 text-sm">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`min-h-10 rounded-lg ${mode === m ? "bg-white font-medium text-ink shadow-sm" : "text-muted"}`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      )}
      {mode === "forgot" && <h2 className="mb-4 font-serif text-2xl font-semibold">Reset password</h2>}

      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        {mode !== "forgot" && (
          <label className="block">
            <span className="mb-1 block text-[13px] text-muted">Password</span>
            <input
              type="password"
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
            {mode === "signup" && <span className="mt-1 block text-[13px] text-muted">At least 8 characters.</span>}
          </label>
        )}

        {error && <p className="rounded-[10px] bg-log px-3 py-2 text-sm text-log-ink">{error}</p>}
        {info && <p className="rounded-[10px] bg-accent-soft px-3 py-2 text-sm text-accent-ink">{info}</p>}

        <button
          type="submit"
          disabled={busy}
          className={`w-full ${ui.btnPrimary}`}
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>

      <div className="mt-4 text-center text-[13px] text-muted">
        {mode === "forgot" ? (
          <button onClick={() => setMode("signin")} className="min-h-9 text-accent underline">Back to sign in</button>
        ) : (
          mode === "signin" && (
            <button onClick={() => setMode("forgot")} className="min-h-9 text-accent underline">Forgot password?</button>
          )
        )}
      </div>
    </div>
  );
}
