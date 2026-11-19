import type { NoteSummary } from "@/lib/notes";
import type { ClipboardPayload } from "@/components/editor/clipboard";

/** Lightweight cross-component events so the sidebar reflects edits immediately. */
export type NoteEvent =
  | { type: "upsert"; note: NoteSummary }
  | { type: "delete"; id: string };

const EVENT = "notes-vault:note";

export function emitNoteEvent(e: NoteEvent) {
  window.dispatchEvent(new CustomEvent<NoteEvent>(EVENT, { detail: e }));
}

export function onNoteEvent(fn: (e: NoteEvent) => void) {
  const h = (ev: Event) => fn((ev as CustomEvent<NoteEvent>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** Content pasted on the empty screen, handed to the freshly created note. */
const pending = new Map<string, ClipboardPayload>();
export const pendingPaste = {
  set: (noteId: string, p: ClipboardPayload) => pending.set(noteId, p),
  take: (noteId: string) => {
    const p = pending.get(noteId);
    pending.delete(noteId);
    return p;
  },
};
