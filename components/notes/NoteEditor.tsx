"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyPayload } from "@/components/editor/clipboard";
import { buildExtensions } from "@/components/editor/extensions";
import { deleteNote, updateNote, uploadFile, type Note } from "@/lib/notes";
import { emitNoteEvent, pendingPaste } from "./events";
import { TagInput } from "./TagInput";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "saving" | "dirty" | "error";
const SAVE_DELAY_MS = 800;

export function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [tags, setTags] = useState(note.tags);
  const [pinned, setPinned] = useState(note.pinned);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [uploads, setUploads] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insertQueue = useRef<Promise<void>>(Promise.resolve());
  const inflight = useRef<Promise<void> | null>(null);
  const pendingPatch = useRef<Parameters<typeof updateNote>[1]>({});
  const meta = useRef({ title, tags, pinned });
  useEffect(() => {
    meta.current = { title, tags, pinned };
  }, [title, tags, pinned]);

  // ---- saving ---------------------------------------------------------------
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Never run two saves at once: an older request finishing last would
    // overwrite newer content.
    while (inflight.current) await inflight.current;
    const patch = pendingPatch.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatch.current = {};
    setSaveState("saving");
    const run = (async () => {
      try {
        await updateNote(note.id, patch);
        setSaveState(Object.keys(pendingPatch.current).length ? "dirty" : "saved");
        const text = editorRef.current?.getText({ blockSeparator: "\n" }) ?? "";
        emitNoteEvent({
          type: "upsert",
          note: {
            id: note.id,
            title: meta.current.title,
            tags: meta.current.tags,
            pinned: meta.current.pinned,
            updated_at: new Date().toISOString(),
            preview: text.slice(0, 160),
          },
        });
      } catch (e) {
        pendingPatch.current = { ...patch, ...pendingPatch.current };
        setSaveState("error");
        setError(e instanceof Error ? e.message : "Could not save");
      }
    })();
    inflight.current = run;
    try {
      await run;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
  }, [note.id]);

  const queueSave = useCallback(
    (patch: Parameters<typeof updateNote>[1], immediate = false) => {
      pendingPatch.current = { ...pendingPatch.current, ...patch };
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      if (immediate) void flush();
      else timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendingPatch.current).length) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      void flush();
    };
  }, [flush]);

  // ---- uploads --------------------------------------------------------------
  const handleFiles = useCallback(
    async (files: File[], pos: number | undefined, editor: Editor) => {
      if (files.length === 0) return;
      setUploads((n) => n + files.length);
      // Keep the drop/paste position valid while uploads are in flight and the
      // user (or other uploads) keep editing the document.
      let insertAt = pos ?? editor.state.selection.to;
      const track = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }) => {
        insertAt = transaction.mapping.map(insertAt);
      };
      editor.on("transaction", track);
      try {
        const uploaded = await Promise.all(
          files.map(async (file) => {
            try {
              const { path } = await uploadFile(note.id, file);
              return file.type.startsWith("image/")
                ? { type: "image", attrs: { path, alt: file.name } }
                : {
                    type: "fileAttachment",
                    attrs: { path, name: file.name, size: file.size, mime: file.type || "application/octet-stream" },
                  };
            } catch (e) {
              setError(e instanceof Error ? e.message : `Upload failed: ${file.name}`);
              return null;
            } finally {
              setUploads((n) => n - 1);
            }
          }),
        );
        const nodes = uploaded.filter((n) => n !== null);
        // Insert in paste order, even if a later upload finishes first.
        const previous = insertQueue.current;
        let release = () => {};
        insertQueue.current = new Promise<void>((r) => (release = r));
        await previous;
        try {
          if (nodes.length && !editor.isDestroyed) {
            let at = Math.min(insertAt, editor.state.doc.content.size);
            // Code blocks only hold text: put files after the block instead.
            const $at = editor.state.doc.resolve(at);
            if ($at.parent.type.spec.code) at = $at.after();
            // Don't select the inserted node: the next paste would replace it.
            editor.chain().insertContentAt(at, nodes, { updateSelection: false }).run();
            if (editor.state.selection instanceof NodeSelection) {
              const after = editor.state.selection.to;
              editor.commands.setTextSelection(Math.min(after + 1, editor.state.doc.content.size));
            }
          }
        } finally {
          release();
        }
      } finally {
        editor.off("transaction", track);
      }
    },
    [note.id],
  );

  // handleFiles only depends on note.id, and this component is keyed by note id.
  const extensions = useMemo(
    () => buildExtensions((files, pos, ed) => void handleFiles(files, pos, ed)),
    [handleFiles],
  );

  const editor = useEditor({
    extensions,
    content: note.content?.type ? note.content : undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-zinc dark:prose-invert max-w-none focus:outline-none min-h-[60vh] px-1 pb-32 prose-li:my-1 prose-li:marker:text-zinc-400 [&_li>p]:my-0.5 prose-img:my-0",
      },
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      const pending = pendingPaste.take(note.id);
      if (pending) {
        editor.commands.focus("end");
        applyPayload(editor, pending, (f, p) => void handleFiles(f, p, editor), {
          allowDefaultHtml: false,
        });
      } else if (editor.isEmpty) {
        editor.commands.focus();
      }
    },
    onUpdate: ({ editor }) => {
      queueSave({
        content: editor.getJSON(),
        content_text: editor.getText({ blockSeparator: "\n" }),
      });
    },
  });

  // ---- actions --------------------------------------------------------------
  async function onDelete() {
    if (!window.confirm("Delete this note and its files? This cannot be undone.")) return;
    try {
      pendingPatch.current = {};
      if (timer.current) clearTimeout(timer.current);
      await deleteNote(note.id);
      emitNoteEvent({ type: "delete", id: note.id });
      router.push("/notes");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  function onExport() {
    if (!editor) return;
    const heading = title ? `# ${title}\n\n` : "";
    const md = heading + editor.getMarkdown();
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || "note").replace(/[^\w\- ]+/g, "").trim() || "note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const status =
    uploads > 0
      ? `Uploading ${uploads} file${uploads > 1 ? "s" : ""}…`
      : { saved: "Saved ✓", saving: "Saving…", dirty: "Editing…", error: "Not saved — retrying on next edit" }[saveState];

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-8">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
          <span className={saveState === "error" ? "text-red-600" : ""} aria-live="polite">
            {status}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setPinned(!pinned);
                queueSave({ pinned: !pinned }, true);
              }}
              className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              title={pinned ? "Unpin" : "Pin to top"}
            >
              {pinned ? "★ Pinned" : "☆ Pin"}
            </button>
            <button onClick={onExport} className="rounded px-2 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Export .md
            </button>
            <button
              onClick={onDelete}
              className="rounded px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
            >
              Delete
            </button>
          </div>
        </div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            queueSave({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
          placeholder="Untitled"
          className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
          aria-label="Title"
        />
        <TagInput
          tags={tags}
          onChange={(t) => {
            setTags(t);
            queueSave({ tags: t }, true);
          }}
        />
        {error && (
          <div className="mt-2 flex items-start justify-between rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-3">✕</button>
          </div>
        )}
      </div>
      {editor && (
        <div className="mx-auto mt-3 w-full max-w-3xl px-2 sm:px-6">
          <Toolbar editor={editor} onFiles={(f) => void handleFiles(f, undefined, editor)} />
        </div>
      )}
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-4 sm:px-8">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
