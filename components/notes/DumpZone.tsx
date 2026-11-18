"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { payloadFromDataTransfer, type ClipboardPayload } from "@/components/editor/clipboard";
import { createNote } from "@/lib/notes";
import { emitNoteEvent, pendingPaste } from "./events";

/** Empty state: paste or drop anything to instantly start a new note. */
export function DumpZone() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(payload?: ClipboardPayload) {
    if (busy) return;
    setBusy(true);
    try {
      const note = await createNote();
      if (payload) pendingPaste.set(note.id, payload);
      emitNoteEvent({ type: "upsert", note: { ...note, preview: "" } });
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create note");
      setBusy(false);
    }
  }

  useEffect(() => {
    const inField = (t: EventTarget | null) =>
      t instanceof Element && Boolean(t.closest("input, textarea, select, [contenteditable=true]"));
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target)) return;
      const payload = payloadFromDataTransfer(e.clipboardData);
      if (!payload.files.length && !payload.text.trim() && !payload.html) return;
      e.preventDefault();
      void start(payload);
    };
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;
      if (e.key === "Enter" || (e.key.toLowerCase() === "n" && e.altKey)) {
        e.preventDefault();
        void start();
      }
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  });

  return (
    <div
      className="flex flex-1 items-center justify-center p-8"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void start(payloadFromDataTransfer(e.dataTransfer));
      }}
    >
      <div
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <div className="text-4xl">📥</div>
        <h1 className="mt-4 text-xl font-semibold">Dump anything here</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Press <kbd className="rounded border px-1.5 py-0.5 font-mono text-xs">Ctrl/⌘ + V</kbd> to paste
          text, code, screenshots or files — or drop them here. A new note is created instantly.
        </p>
        <button
          onClick={() => void start()}
          disabled={busy}
          className="mt-6 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {busy ? "Creating…" : "Start a blank note"}
        </button>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
