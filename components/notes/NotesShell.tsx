"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { Sidebar } from "./Sidebar";

export function NotesShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const atHome = pathname === "/notes";

  return (
    <div className="flex h-dvh overflow-hidden bg-paper">
      {/* Desktop: fixed column. Mobile: the home screen, or a drawer over a note. */}
      <div
        className={`${atHome ? "flex" : open ? "fixed inset-0 z-40 flex" : "hidden"} w-full flex-col border-r border-line md:static md:flex md:w-[300px] md:shrink-0`}
      >
        {open && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="absolute right-3 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-lg text-ink-2 hover:bg-[#e9e5dc] md:hidden"
          >
            <Icon.Close />
          </button>
        )}
        <Sidebar email={email} onNavigate={() => setOpen(false)} />
      </div>
      <main className={`${atHome ? "hidden md:flex" : "flex"} min-w-0 flex-1 flex-col overflow-y-auto`} id="main">
        {!atHome && (
          <div className="flex items-center gap-2 border-b border-line bg-side px-3 py-1 md:hidden">
            <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-[#e9e5dc]">
              <Icon.Menu />
            </button>
            <span className="font-serif text-lg font-semibold">Vault</span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
