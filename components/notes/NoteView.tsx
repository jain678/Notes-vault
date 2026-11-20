"use client";

import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditingContext } from "@/components/editor/editing";
import { buildExtensions } from "@/components/editor/extensions";
import { Icon, ui } from "@/components/ui";
import {
  createCollection,
  deleteNote,
  displayTitle,
  listCollections,
  updateNote,
  uploadFile,
  type Collection,
  type Note,
} from "@/lib/notes";
import { readingMinutes } from "@/lib/structure";
import { emitNoteEvent } from "./events";
import { CollectionSelect, parseTags } from "./fields";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "saving" | "dirty" | "error";
type Patch = Parameters<typeof updateNote>[1];
const SAVE_DELAY_MS = 800;

const isEmptyDoc = (c: Note["content"]) =>
  !c?.content?.length || (c.content.length === 1 && c.content[0].type === "paragraph" && !c.content[0].content?.length);

export function NoteView({ note }: { note: Note }) {
  const router = useRouter();
  const [editing, setEditing] = useState(() => isEmptyDoc(note.content));
  const [title, setTitle] = useState(note.title);
  const [tagsText, setTagsText] = useState(note.tags.join(", "));
  const [tags, setTags] = useState(note.tags);
  const [pinned, setPinned] = useState(note.pinned);
  const [collectionId, setCollectionId] = useState(note.collection_id ?? "");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [updatedAt, setUpdatedAt] = useState(note.updated_at);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [uploads, setUploads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const editorRef = useRef<Editor | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatch = useRef<Patch>({});
  const inflight = useRef<Promise<void> | null>(null);
  const insertQueue = useRef<Promise<void>>(Promise.resolve());
  const meta = useRef({ title, tags, pinned, collectionId });
  useEffect(() => {
    meta.current = { title, tags, pinned, collectionId };
  }, [title, tags, pinned, collectionId]);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  // ---- saving (one request at a time, so an older save never overwrites a newer one) ----
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    while (inflight.current) await inflight.current;
    const patch = pendingPatch.current;
    if (Object.keys(patch).length === 0) return;
    pendingPatch.current = {};
    setSaveState("saving");
    const run = (async () => {
      try {
        await updateNote(note.id, patch);
        const now = new Date().toISOString();
        setUpdatedAt(now);
        setSaveState(Object.keys(pendingPatch.current).length ? "dirty" : "saved");
        const text = editorRef.current?.getText({ blockSeparator: "\n" }) ?? "";
        emitNoteEvent({
          type: "upsert",
          note: {
            id: note.id,
            title: meta.current.title,
            tags: meta.current.tags,
            pinned: meta.current.pinned,
            collection_id: meta.current.collectionId || null,
            updated_at: now,
            preview: text.slice(0, 200),
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
    (patch: Patch, immediate = false) => {
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

  // ---- uploads while editing --------------------------------------------------------
  const handleFiles = useCallback(
    async (files: File[], pos: number | undefined, editor: Editor) => {
      if (files.length === 0) return;
      setUploads((n) => n + files.length);
      let insertAt = pos ?? editor.state.selection.to;
      const track = ({ transaction }: { transaction: { mapping: { map: (p: number) => number } } }) => {
        insertAt = transaction.mapping.map(insertAt);
      };
      editor.on("transaction", track);
      try {
        const uploaded = await Promise.all(
          files.map(async (file) => {
            try {
              const f = await uploadFile(note.id, file);
              return file.type.startsWith("image/")
                ? { type: "image", attrs: { path: f.path, alt: f.name } }
                : { type: "fileAttachment", attrs: { path: f.path, name: f.name, size: f.size, mime: f.mime } };
            } catch (e) {
              setError(e instanceof Error ? e.message : `Upload failed: ${file.name}`);
              return null;
            } finally {
              setUploads((n) => n - 1);
            }
          }),
        );
        const nodes = uploaded.filter((n) => n !== null);
        const previous = insertQueue.current;
        let release = () => {};
        insertQueue.current = new Promise<void>((r) => (release = r));
        await previous;
        try {
          if (nodes.length && !editor.isDestroyed) {
            let at = Math.min(insertAt, editor.state.doc.content.size);
            const $at = editor.state.doc.resolve(at);
            if ($at.parent.type.spec.code) at = $at.after();
            // Don't select the inserted node: the next paste would replace it.
            editor.chain().insertContentAt(at, nodes, { updateSelection: false }).run();
            if (editor.state.selection instanceof NodeSelection) {
              editor.commands.setTextSelection(Math.min(editor.state.selection.to + 1, editor.state.doc.content.size));
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

  const extensions = useMemo(() => buildExtensions((files, pos, ed) => void handleFiles(files, pos, ed)), [handleFiles]);

  const editor = useEditor({
    extensions,
    content: note.content?.type ? note.content : undefined,
    editable: editing,
    immediatelyRender: false,
    editorProps: { attributes: { class: "vault-doc", "aria-label": "Note content" } },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      if (editor.isEditable && editor.isEmpty) editor.commands.focus();
    },
    onUpdate: ({ editor }) => {
      queueSave({ content: editor.getJSON(), content_text: editor.getText({ blockSeparator: "\n" }) });
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editing, false);
    editor.view.dom.classList.toggle("is-editing", editing);
  }, [editor, editing]);

  // Outline + text, recomputed whenever the document changes.
  const [docVersion, setDocVersion] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const bump = () => setDocVersion((v) => v + 1);
    editor.on("update", bump);
    editor.on("create", bump);
    return () => {
      editor.off("update", bump);
      editor.off("create", bump);
    };
  }, [editor]);
  const outline = useMemo(() => {
    const headings: { level: number; text: string }[] = [];
    if (!editor || editor.isDestroyed) return { headings, text: note.content_text, v: docVersion };
    editor.state.doc.forEach((n) => {
      if (n.type.name === "heading" && n.attrs.level <= 3 && n.textContent.trim()) headings.push({ level: n.attrs.level, text: n.textContent.trim() });
    });
    return { headings, text: editor.state.doc.textContent, v: docVersion };
  }, [editor, docVersion, note.content_text]);

  // ---- actions ---------------------------------------------------------------------
  function done() {
    void flush();
    setEditing(false);
  }

  async function onDelete() {
    setMenuOpen(false);
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
    const name = displayTitle({ title, preview: outline.text });
    const md = `# ${name}\n\n${editor.getMarkdown()}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = `${name.replace(/[^\w\- ]+/g, "").trim() || "note"}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onCollection(value: string) {
    let id = value;
    if (value === "__new") {
      const name = window.prompt("Name the new collection");
      if (!name?.trim()) return;
      try {
        const c = await createCollection(name);
        setCollections((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
        emitNoteEvent({ type: "collections" });
        id = c.id;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not create collection");
        return;
      }
    }
    setCollectionId(id);
    queueSave({ collection_id: id || null }, true);
  }

  function scrollToHeading(i: number) {
    const el = editor?.view.dom.querySelectorAll(":scope > h1, :scope > h2, :scope > h3")[i];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const collectionName = collections.find((c) => c.id === collectionId)?.name ?? (collectionId ? "…" : "Unsorted");
  const shownTitle = displayTitle({ title, preview: outline.text });
  const status =
    uploads > 0
      ? `Uploading ${uploads} file${uploads > 1 ? "s" : ""}…`
      : { saved: "Saved", saving: "Saving…", dirty: "Editing…", error: "Not saved, will retry" }[saveState];
  const updatedLabel = new Date(updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-paper/95 px-5 py-3 backdrop-blur md:px-12">
        <div className="min-w-0 truncate text-sm text-muted">
          {collectionName} / <span className="font-medium text-ink">{shownTitle}</span>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <span className={`text-[13px] ${saveState === "error" ? "text-log-ink" : "text-muted"}`} aria-live="polite">
              {status}
            </span>
          )}
          {editing ? (
            <button type="button" onClick={done} className={ui.btnPrimary}>
              Done
            </button>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className={ui.btn}>
              <Icon.Pencil size={16} /> Edit
            </button>
          )}
          <button type="button" onClick={onExport} className={`${ui.btn} hidden sm:inline-flex`}>
            Export
          </button>
          <div className="relative">
            <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="More actions" aria-expanded={menuOpen} className={`${ui.btn} w-11 px-0`}>
              <Icon.More />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-30 flex w-56 flex-col rounded-xl border border-line bg-white p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setPinned(!pinned);
                    queueSave({ pinned: !pinned }, true);
                    setMenuOpen(false);
                  }}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-side"
                >
                  <Icon.Star size={16} /> {pinned ? "Unpin" : "Pin to top"}
                </button>
                <button type="button" onClick={() => { onExport(); setMenuOpen(false); }} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-side sm:hidden">
                  <Icon.Download size={16} /> Export Markdown
                </button>
                {note.raw_paste && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowOriginal((v) => !v);
                      setMenuOpen(false);
                    }}
                    className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-side"
                  >
                    <Icon.File size={16} /> {showOriginal ? "Hide original paste" : "View original paste"}
                  </button>
                )}
                <button type="button" onClick={onDelete} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-log-ink hover:bg-log">
                  <Icon.Trash size={16} /> Delete note
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-start gap-12 px-5 pb-24 pt-10 md:px-12">
        <article className="flex min-w-0 max-w-[720px] flex-[1_1_520px] flex-col gap-5">
          {error && (
            <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-log px-4 py-3 text-sm text-log-ink">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
                <Icon.Close size={16} />
              </button>
            </div>
          )}

          <header className="flex flex-col gap-3">
            {editing ? (
              <>
                <label htmlFor="note-title" className="sr-only">
                  Title
                </label>
                <input
                  id="note-title"
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
                  placeholder={shownTitle === "Untitled" ? "Untitled" : shownTitle}
                  className="w-full bg-transparent font-serif text-[40px] font-semibold leading-tight tracking-[-0.01em] text-ink outline-none placeholder:text-[#b9b4a8] md:text-[44px]"
                />
                <div className="flex flex-wrap gap-3">
                  <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
                    <label htmlFor="note-coll" className={ui.label}>
                      Collection
                    </label>
                    <CollectionSelect id="note-coll" value={collectionId} collections={collections} onChange={onCollection} />
                  </div>
                  <div className="flex min-w-0 flex-[2_1_260px] flex-col gap-1">
                    <label htmlFor="note-tags" className={ui.label}>
                      Tags
                    </label>
                    <input
                      id="note-tags"
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      onBlur={() => {
                        const t = parseTags(tagsText);
                        setTagsText(t.join(", "));
                        if (t.join() !== tags.join()) {
                          setTags(t);
                          queueSave({ tags: t }, true);
                        }
                      }}
                      placeholder="Comma separated"
                      className={ui.input}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <h1 className="m-0 font-serif text-[36px] font-semibold leading-[1.12] tracking-[-0.01em] md:text-[44px]">{shownTitle}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
                  <span>Updated {updatedLabel}</span>
                  <span>{readingMinutes(outline.text)} min read</span>
                  {pinned && (
                    <span className="flex items-center gap-1 text-accent-ink">
                      <Icon.Star size={14} /> Pinned
                    </span>
                  )}
                  {tags.length > 0 && (
                    <span className="flex flex-wrap gap-2">
                      {tags.map((t) => (
                        <span key={t} className={ui.pill}>
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </>
            )}
          </header>

          {editing && editor && <Toolbar editor={editor} onFiles={(f) => void handleFiles(f, undefined, editor)} />}

          <EditingContext.Provider value={editing}>
            <EditorContent editor={editor} className={editing ? "min-h-[50vh] pb-24" : ""} />
          </EditingContext.Provider>

          {showOriginal && note.raw_paste && (
            <section aria-label="Original paste" className="mt-6 flex flex-col gap-2 font-sans">
              <div className="flex items-center justify-between">
                <h2 className={ui.eyebrow}>Original paste</h2>
                <button type="button" onClick={() => setShowOriginal(false)} className="min-h-9 rounded px-2 text-[13px] text-accent hover:underline">
                  Hide
                </button>
              </div>
              <pre className="m-0 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-4 font-mono text-[13px] leading-relaxed text-ink-2">
                {note.raw_paste}
              </pre>
            </section>
          )}
        </article>

        {outline.headings.length > 1 && !editing && (
          <nav aria-label="On this page" className="sticky top-24 hidden max-w-[240px] min-w-[180px] flex-[1_1_200px] flex-col gap-1 text-sm lg:flex">
            <div className={`${ui.eyebrow} pb-2`}>On this page</div>
            {outline.headings.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => scrollToHeading(i)}
                className={`flex min-h-11 items-center text-left text-ink-2 hover:text-accent ${h.level === 3 ? "pl-4" : ""}`}
              >
                {h.text}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
