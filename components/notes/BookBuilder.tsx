"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildExtensions } from "@/components/editor/extensions";
import { Icon, ui } from "@/components/ui";
import {
  displayTitle,
  getCollectionNotes,
  getNotes,
  listAllSummaries,
  listCollections,
  type Collection,
  type Note,
  type NoteSummary,
} from "@/lib/notes";
import { printHtml, snapshot, waitForRender } from "@/lib/print";

const noUploads = () => {};
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** One note rendered read-only, exactly as in the reading view. */
function ChapterBody({ note }: { note: Note }) {
  const extensions = useMemo(() => buildExtensions(noUploads), []);
  const editor = useEditor({
    extensions,
    content: note.content?.type ? note.content : undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "vault-doc" } },
  });
  if (!editor) return <div className="h-24 animate-pulse rounded-xl bg-placeholder" />;
  return <EditorContent editor={editor} />;
}

export function BookBuilder() {
  const params = useSearchParams();
  const [notes, setNotes] = useState<Note[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [allNotes, setAllNotes] = useState<NoteSummary[]>([]);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [withToc, setWithToc] = useState(true);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids = (params.get("ids") ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s));
    const collectionId = params.get("collection");
    Promise.all([collectionId ? getCollectionNotes(collectionId) : getNotes(ids), listCollections(), listAllSummaries()])
      .then(([n, c, all]) => {
        setNotes(n);
        setCollections(c);
        setAllNotes(all);
        const fromCollection = c.find((x) => x.id === collectionId);
        const shared = n.length && n.every((x) => x.collection_id && x.collection_id === n[0].collection_id) ? c.find((x) => x.id === n[0].collection_id) : undefined;
        // Defaults only fill fields the user hasn't typed in yet.
        const defaultTitle = (fromCollection ?? shared)?.name ?? (n.length === 1 ? displayTitle({ title: n[0].title, preview: n[0].content_text }) : "My notes");
        setTitle((prev) => prev || defaultTitle);
        setSubtitle((prev) => prev || `Compiled ${fmtDate(new Date().toISOString())}`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load notes"))
      .finally(() => setLoading(false));
  }, [params]);

  const collName = (id: string | null) => collections.find((c) => c.id === id)?.name;
  const move = (i: number, d: -1 | 1) =>
    setNotes((prev) => {
      const next = [...prev];
      const j = i + d;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const remove = (id: string) => setNotes((prev) => prev.filter((n) => n.id !== id));
  const addable = allNotes.filter((s) => !notes.some((n) => n.id === s.id));

  async function add(id: string) {
    if (!id) return;
    try {
      const [n] = await getNotes([id]);
      if (n) setNotes((prev) => [...prev, n]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add note");
    }
  }

  async function download() {
    if (!preview.current || !notes.length) return;
    setExporting(true);
    setError(null);
    try {
      await waitForRender(preview.current, 20000);
      await printHtml(snapshot(preview.current), title.trim() || "Book");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the PDF");
    } finally {
      setExporting(false);
    }
  }

  const bookTitle = title.trim() || "Untitled book";

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-side px-5 py-3 md:px-12">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/notes" className="flex min-h-11 items-center gap-1.5 text-ink-2 no-underline hover:text-ink">
            <Icon.Back />
            <span>Back to vault</span>
          </Link>
          <h1 className="m-0 font-serif text-[28px] font-semibold">Make a book</h1>
        </div>
        <button type="button" onClick={download} disabled={exporting || loading || !notes.length} className={ui.btnPrimary}>
          <Icon.Download /> {exporting ? "Preparing PDF…" : "Download PDF"}
        </button>
      </header>

      <div className="flex flex-wrap items-start gap-8 px-5 pb-16 pt-8 md:px-12">
        {/* Settings */}
        <section aria-label="Book settings" className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 lg:sticky lg:top-6 lg:max-w-[380px]">
          {error && (
            <div role="alert" className="rounded-xl bg-log px-4 py-3 text-sm text-log-ink">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="bk-title" className={ui.label}>
              Book title
            </label>
            <input id="bk-title" value={title} onChange={(e) => setTitle(e.target.value)} className={ui.input} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="bk-sub" className={ui.label}>
              Subtitle
            </label>
            <input id="bk-sub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Optional" className={ui.input} />
          </div>
          <div className="flex min-h-11 items-center gap-2">
            <input id="bk-toc" type="checkbox" checked={withToc} onChange={(e) => setWithToc(e.target.checked)} className="h-5 w-5 accent-accent" />
            <label htmlFor="bk-toc">Table of contents with page numbers</label>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className={`${ui.eyebrow} m-0`}>Chapters</h2>
              <span className="text-[13px] text-muted">{notes.length} note{notes.length === 1 ? "" : "s"}</span>
            </div>
            {loading ? (
              <div className="h-32 animate-pulse rounded-xl bg-placeholder" />
            ) : notes.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-line-strong p-4 text-sm text-muted">No notes yet. Add some below.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {notes.map((n, i) => (
                  <li key={n.id} className="flex items-center gap-1 rounded-[10px] border border-line bg-white py-1 pl-3 pr-1">
                    <span className="w-6 shrink-0 text-[13px] text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{displayTitle({ title: n.title, preview: n.content_text })}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${n.title || "note"} up`} className="flex h-10 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-side disabled:opacity-30">
                      <Icon.Chevron size={16} className="-rotate-90" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === notes.length - 1} aria-label={`Move ${n.title || "note"} down`} className="flex h-10 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-side disabled:opacity-30">
                      <Icon.Chevron size={16} className="rotate-90" />
                    </button>
                    <button type="button" onClick={() => remove(n.id)} aria-label={`Remove ${n.title || "note"}`} className="flex h-10 w-9 items-center justify-center rounded-lg text-muted hover:bg-log hover:text-log-ink">
                      <Icon.Close size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {addable.length > 0 && (
              <div className="flex flex-col gap-1 pt-2">
                <label htmlFor="bk-add" className={ui.label}>
                  Add a note
                </label>
                <select id="bk-add" value="" onChange={(e) => add(e.target.value)} className={ui.input}>
                  <option value="">Choose a note…</option>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {displayTitle(s)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <p className="m-0 text-[13px] leading-relaxed text-muted">
            Download PDF opens your browser&apos;s print dialog. Choose <b>Save as PDF</b> as the destination. Each note starts on a new page.
          </p>
        </section>

        {/* Preview: also the exact content of the PDF */}
        <section aria-label="Book preview" className="flex min-w-0 flex-[2_1_560px] flex-col gap-2">
          <div className={ui.eyebrow}>Preview</div>
          <div ref={preview} className="flex flex-col gap-6">
            <section className="cover book-sheet flex min-h-[420px] flex-col justify-center gap-4 rounded-xl border border-line bg-white p-12 shadow-sm">
              <span className="text-accent">
                <Icon.Logo size={36} />
              </span>
              <h1 className="book-title m-0 font-serif text-[44px] font-semibold leading-[1.1] tracking-[-0.01em]">{bookTitle}</h1>
              {subtitle.trim() && <p className="m-0 font-serif text-xl text-ink-2">{subtitle}</p>}
              <p className="m-0 text-sm text-muted">
                {notes.length} chapter{notes.length === 1 ? "" : "s"}
              </p>
            </section>

            {withToc && notes.length > 0 && (
              <nav aria-label="Contents" className="toc book-sheet rounded-xl border border-line bg-white p-12 shadow-sm">
                <h2 className="m-0 mb-6 font-serif text-[28px] font-semibold">Contents</h2>
                <ol className="m-0 flex list-none flex-col gap-3 p-0 font-serif text-[17px]">
                  {notes.map((n, i) => (
                    <li key={n.id}>
                      <a href={`#ch-${i + 1}`} className="flex gap-2 text-ink no-underline">
                        <span className="w-8 shrink-0 text-muted">{i + 1}.</span>
                        <span className="flex-1">{displayTitle({ title: n.title, preview: n.content_text })}</span>
                        <span className="toc-page-hint text-sm text-muted">p. –</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}

            {notes.map((n, i) => (
              <section key={n.id} id={`ch-${i + 1}`} className="chapter book-sheet rounded-xl border border-line bg-white p-12 shadow-sm">
                <div className="note-meta mb-2 text-[13px] uppercase tracking-[0.06em] text-muted">
                  Chapter {i + 1}
                  {collName(n.collection_id) ? ` · ${collName(n.collection_id)}` : ""}
                </div>
                <h1 className="chapter-title note-title m-0 font-serif text-[34px] font-semibold leading-tight">
                  {displayTitle({ title: n.title, preview: n.content_text })}
                </h1>
                <div className="note-meta mb-8 mt-2 text-sm text-muted">
                  Updated {fmtDate(n.updated_at)}
                  {n.tags.length ? ` · ${n.tags.map((t) => `#${t}`).join(" ")}` : ""}
                </div>
                <ChapterBody note={n} />
              </section>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
