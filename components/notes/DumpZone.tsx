"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { payloadFromDataTransfer } from "@/components/editor/clipboard";
import { Icon, ui } from "@/components/ui";
import { pendingPaste } from "./events";

/** Home screen: paste or drop anything to start a new note. */
export function DumpZone() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const inField = (t: EventTarget | null) =>
      t instanceof Element && Boolean(t.closest("input, textarea, select, [contenteditable=true]"));
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      const payload = payloadFromDataTransfer(e.clipboardData);
      if (!payload.files.length && !payload.text.trim() && !payload.html) return;
      e.preventDefault();
      pendingPaste.set(payload);
      router.push("/notes/new");
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [router]);

  return (
    <div
      className="flex flex-1 items-center justify-center px-6 py-16"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pendingPaste.set(payloadFromDataTransfer(e.dataTransfer));
        router.push("/notes/new");
      }}
    >
      <div
        className={`flex w-full max-w-xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-colors ${
          dragging ? "border-accent bg-accent-soft" : "border-line-strong"
        }`}
      >
        <span className="text-accent">
          <Icon.Logo size={40} />
        </span>
        <h1 className="m-0 font-serif text-[34px] font-semibold leading-tight">Dump anything</h1>
        <p className="m-0 max-w-md text-muted">
          Paste text, code, logs, links, tables or screenshots, in any mix. The vault splits it into blocks and lays each one out
          so it&apos;s easy to read later.
        </p>
        <p className="m-0 text-sm text-muted">
          Press <kbd className="rounded border border-line-strong bg-white px-1.5 py-0.5 font-mono text-xs">Ctrl/⌘ V</kbd> anywhere
          here, or drop files.
        </p>
        <Link href="/notes/new" className={`${ui.btnPrimary} mt-2`}>
          <Icon.Plus /> New note
        </Link>
      </div>
    </div>
  );
}
