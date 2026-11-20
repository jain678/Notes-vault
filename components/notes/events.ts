import type { NoteSummary } from "@/lib/notes";
import type { ClipboardPayload } from "@/components/editor/clipboard";

/** Lightweight cross-component events so the sidebar reflects edits immediately. */
export type NoteEvent =
  | { type: "upsert"; note: NoteSummary }
  | { type: "delete"; id: string }
  | { type: "collections" };

const EVENT = "notes-vault:note";

export function emitNoteEvent(e: NoteEvent) {
  window.dispatchEvent(new CustomEvent<NoteEvent>(EVENT, { detail: e }));
}

export function onNoteEvent(fn: (e: NoteEvent) => void) {
  const h = (ev: Event) => fn((ev as CustomEvent<NoteEvent>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Content pasted on the home screen, handed to the New note screen. */
let pending: ClipboardPayload | null = null;
export const pendingPaste = {
  set: (p: ClipboardPayload) => {
    pending = p;
  },
  take: () => {
    const p = pending;
    pending = null;
    return p;
  },
};
