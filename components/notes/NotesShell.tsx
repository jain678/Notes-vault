"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { Sidebar } from "./Sidebar";

export function NotesShell({ email, children }: { email: string; children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const [open, setOpen] = useState(false);
  const inNote = Boolean(params.id);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar: always visible on desktop; on mobile it's the home screen or a drawer. */}
      <div
        className={`${inNote && !open ? "hidden" : "flex"} w-full shrink-0 flex-col border-r border-zinc-200 md:flex md:w-80 dark:border-zinc-800 ${
          inNote && open ? "fixed inset-0 z-30 md:static" : ""
        }`}
      >
        <Sidebar email={email} onNavigate={() => setOpen(false)} />
      </div>
      <main className={`${inNote ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-y-auto`}>
        {inNote && (
          <div className="flex items-center border-b border-zinc-200 px-3 py-2 md:hidden dark:border-zinc-800">
            <button onClick={() => setOpen(true)} className="rounded px-2 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              ← All notes
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
