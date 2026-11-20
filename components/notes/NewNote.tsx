"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { payloadFromDataTransfer, type ClipboardPayload } from "@/components/editor/clipboard";
import { detectLanguage } from "@/components/editor/lowlight";
import { Icon, ui } from "@/components/ui";
import { canImport, importDocument } from "@/lib/importers";
import {
  MAX_FILE_BYTES,
  createCollection,
  createNote,
  listCollections,
  recordAttachments,
  removeFromStorage,
  uploadToStorage,
  type Collection,
} from "@/lib/notes";
import {
  analyze,
  blocksToDoc,
  docToText,
  fileToken,
  htmlToMarkdown,
  suggestTitle,
  withoutTitleLine,
  type Block,
  type BlockKind,
  type UploadedFile,
} from "@/lib/structure";
import { BlockCard } from "./BlockPreview";
import { emitNoteEvent, pendingPaste } from "./events";
import { CollectionSelect, parseTags } from "./fields";

const RICH_HTML = /<(h[1-6]|ul|ol|table|pre|img|blockquote|a\s|strong|b>|em>|code)/i;
type Override = { kind?: BlockKind; lang?: string };

export function NewNote() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [noteId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  // Opened from a collection ("New note in this collection") → file it there.
  const [collectionId, setCollectionId] = useState<string>(() => searchParams.get("collection") ?? "");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [tagsText, setTagsText] = useState("");
  const [raw, setRaw] = useState("");
  const [analysed, setAnalysed] = useState("");
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [files, setFiles] = useState<Map<string, UploadedFile>>(new Map());
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [keepFile, setKeepFile] = useState(true);
  const keepFileRef = useRef(keepFile);
  useEffect(() => {
    keepFileRef.current = keepFile;
  }, [keepFile]);
  const [importing, setImporting] = useState<string | null>(null);
  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  const importInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const saved = useRef(false);
  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  // Re-analyse shortly after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setAnalysed(raw), raw.length - analysed.length > 20 ? 0 : 200);
    return () => clearTimeout(t);
  }, [raw, analysed.length]);

  const blocks: Block[] = useMemo(() => {
    return analyze(analysed).map((b) => {
      const o = overrides.get(`${b.detected}\u0000${b.raw}`);
      return o ? { ...b, kind: o.kind ?? b.kind, lang: o.lang ?? b.lang } : b;
    });
  }, [analysed, overrides]);

  const setOverride = (b: Block, o: Override) =>
    setOverrides((prev) => {
      const next = new Map(prev);
      const key = `${b.detected}\u0000${b.raw}`;
      next.set(key, { ...prev.get(key), ...o });
      return next;
    });

  // ---- inserting into the paste box --------------------------------------------
  const insertText = useCallback((text: string) => {
    const el = textarea.current;
    const value = el?.value ?? "";
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const pre = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const insert = pre + text.replace(/\n+$/, "") + "\n\n";
    const next = before + insert + value.slice(end);
    setRaw(next);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = before.length + insert.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }, []);

  /** Starts uploading a file and returns the token that stands for it in the text. */
  const queueUpload = useCallback(
    (file: File, as?: "image" | "file") => {
      const key = crypto.randomUUID().slice(0, 8);
      const kind = as ?? (file.type.startsWith("image/") ? "image" : "file");
      setUploading((s) => new Set(s).add(key));
      uploadToStorage(noteId, file)
        .then((stored) => setFiles((m) => new Map(m).set(key, stored)))
        .catch((e) => setError(e instanceof Error ? e.message : `Upload failed: ${file.name}`))
        .finally(() =>
          setUploading((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          }),
        );
      return fileToken(kind, key, file.name || kind);
    },
    [noteId],
  );

  const addFiles = useCallback((list: File[]) => insertText(list.map((f) => queueUpload(f)).join("\n\n")), [insertText, queueUpload]);

  /** Documents (PDF, Word, Markdown, CSV, code…) become note content; anything else is attached. */
  const importFiles = useCallback(
    async (list: File[]) => {
      for (const file of list) {
        if (file.type.startsWith("image/") || !canImport(file)) {
          addFiles([file]);
          continue;
        }
        setImporting(file.name);
        try {
          const res = await importDocument(file, (img) => queueUpload(img, "image"));
          // The document's title becomes the note title, so drop it from the body.
          let body = res.text;
          const firstLine = body.split("\n").find((l) => l.trim()) ?? "";
          const useTitle = !titleRef.current.trim();
          if (useTitle && firstLine.replace(/^#{1,6}\s+/, "").trim() === res.title.trim()) body = body.slice(body.indexOf(firstLine) + firstLine.length);
          const parts = [body.trim()];
          if (keepFileRef.current && file.size <= MAX_FILE_BYTES) parts.push(queueUpload(file, "file"));
          insertText(parts.filter((x) => x.trim()).join("\n\n"));
          if (useTitle) setTitle(res.title);
          if (res.note) setError(res.note);
        } catch (e) {
          setError(`Couldn't read “${file.name}”: ${e instanceof Error ? e.message : "unknown error"}. It was attached instead.`);
          addFiles([file]);
        } finally {
          setImporting(null);
        }
      }
    },
    [addFiles, insertText, queueUpload],
  );

  /** Returns true if it handled the paste itself. */
  const handlePayload = useCallback(
    (p: ClipboardPayload): boolean => {
      if (p.files.length) {
        void importFiles(p.files);
        return true;
      }
      if (p.vscodeLanguage && p.text) {
        const lang = p.vscodeLanguage === "plaintext" ? detectLanguage(p.text) : p.vscodeLanguage;
        insertText("```" + lang + "\n" + p.text.replace(/\n$/, "") + "\n```");
        return true;
      }
      if (p.html && RICH_HTML.test(p.html)) {
        try {
          const md = htmlToMarkdown(p.html);
          if (md.trim()) {
            insertText(md);
            return true;
          }
        } catch {
          /* fall back to plain text */
        }
      }
      return false;
    },
    [importFiles, insertText],
  );

  // Content pasted on the home screen.
  useEffect(() => {
    const p = pendingPaste.take();
    if (!p) {
      textarea.current?.focus();
      return;
    }
    setTimeout(() => {
      if (!handlePayload(p) && p.text) insertText(p.text);
    }, 0);
  }, [handlePayload, insertText]);

  // Clean up uploads if the note is never saved.
  useEffect(
    () => () => {
      if (!saved.current) void removeFromStorage([...filesRef.current.values()].map((f) => f.path));
    },
    [],
  );

  // ---- save / discard -------------------------------------------------------------
  async function save() {
    if (!raw.trim()) {
      setError("Paste or type something first.");
      return;
    }
    if (uploading.size) {
      setError("Wait for uploads to finish.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const finalBlocks = analyze(raw).map((b) => {
        const o = overrides.get(`${b.detected}\u0000${b.raw}`);
        return o ? { ...b, kind: o.kind ?? b.kind, lang: o.lang ?? b.lang } : b;
      });
      const finalTitle = title.trim() || suggestTitle(finalBlocks);
      const doc = blocksToDoc(title.trim() ? finalBlocks : withoutTitleLine(finalBlocks, finalTitle), files);
      const usedKeys = new Set(finalBlocks.filter((b) => b.fileKey && (b.kind === "image" || b.kind === "file")).map((b) => b.fileKey!));
      const used = [...files].filter(([k]) => usedKeys.has(k)).map(([, f]) => f);
      const unused = [...files].filter(([k]) => !usedKeys.has(k)).map(([, f]) => f.path);

      const note = await createNote({
        id: noteId,
        title: finalTitle,
        content: doc,
        content_text: docToText(doc),
        tags: parseTags(tagsText),
        collection_id: collectionId || null,
        raw_paste: keepOriginal ? raw : null,
      });
      await recordAttachments(note.id, used);
      await removeFromStorage(unused);
      saved.current = true;
      emitNoteEvent({
        type: "upsert",
        note: {
          id: note.id,
          title: note.title,
          tags: note.tags,
          pinned: false,
          updated_at: note.updated_at,
          collection_id: note.collection_id,
          preview: note.content_text.slice(0, 200),
        },
      });
      router.push(`/notes/${note.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setSaving(false);
    }
  }

  function discard() {
    if (raw.trim() && !window.confirm("Discard this note?")) return;
    router.push("/notes");
  }

  async function onCollection(value: string) {
    if (value !== "__new") return setCollectionId(value);
    const name = window.prompt("Name the new collection");
    if (!name?.trim()) return;
    try {
      const c = await createCollection(name);
      setCollections((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCollectionId(c.id);
      emitNoteEvent({ type: "collections" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create collection");
    }
  }

  const suggested = suggestTitle(blocks);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-side px-5 py-3 md:px-12">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/notes" className="flex min-h-11 items-center gap-1.5 text-ink-2 no-underline hover:text-ink">
            <Icon.Back />
            <span>Back to vault</span>
          </Link>
          <h1 className="m-0 font-serif text-[28px] font-semibold">New note</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={discard} className={ui.btn}>
            Discard
          </button>
          <button type="button" onClick={save} disabled={saving} className={ui.btnPrimary}>
            {saving ? "Saving…" : "Save to vault"}
          </button>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-5 pb-16 pt-8 md:px-12">
        {error && (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-log px-4 py-3 text-sm text-log-ink">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0">
              <Icon.Close size={16} />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-1">
            <label htmlFor="nn-title" className={ui.label}>
              Title
            </label>
            <input id="nn-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggested || "Taken from your first line if left empty"} className={ui.input} />
          </div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
            <label htmlFor="nn-coll" className={ui.label}>
              Collection
            </label>
            <CollectionSelect id="nn-coll" value={collectionId} collections={collections} onChange={onCollection} />
          </div>
          <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-1">
            <label htmlFor="nn-tags" className={ui.label}>
              Tags
            </label>
            <input id="nn-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Comma separated, e.g. search, infra" className={ui.input} />
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-6">
          <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="nn-raw" className="font-semibold">
                  Paste anything
                </label>
                <div className="text-[13px] text-muted">No formatting needed. Text, code, logs, links, tables, screenshots, or a whole document.</div>
              </div>
              <button type="button" onClick={() => importInput.current?.click()} disabled={Boolean(importing)} className={ui.btn}>
                <Icon.File size={16} /> {importing ? "Reading…" : "Import a file"}
              </button>
              <input
                ref={importInput}
                type="file"
                multiple
                hidden
                aria-label="Import a file"
                onChange={(e) => {
                  void importFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            {importing && (
              <div role="status" className="flex items-center gap-2 rounded-[10px] bg-accent-soft px-3 py-2 text-[13px] text-accent-ink">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" /> Reading {importing}…
              </div>
            )}
            <textarea
              id="nn-raw"
              ref={textarea}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              onPaste={(e) => {
                if (handlePayload(payloadFromDataTransfer(e.clipboardData))) e.preventDefault();
              }}
              onDrop={(e) => {
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length) {
                  e.preventDefault();
                  void importFiles(dropped);
                }
              }}
              spellCheck={false}
              placeholder={"meeting w/ infra team thurs\n\ndef tokenize(text):\n    return text.lower().split()\n\ngraph LR\n  Paste --> Vault\n\nhttps://example.com/spec"}
              style={{ fontVariantLigatures: "none" }}
              className="box-border min-h-[420px] w-full resize-y rounded-xl border border-line-strong bg-white p-4 font-mono text-[13px] leading-[1.65] text-ink outline-none placeholder:text-[#a19d92] focus:border-accent lg:min-h-[640px]"
            />
          </section>

          <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-2" aria-labelledby="found-h">
            <div className="flex items-center justify-between gap-3">
              <h2 id="found-h" className="m-0 text-[15px] font-semibold">
                What the vault found
              </h2>
              <span className="text-[13px] text-muted" aria-live="polite">
                {blocks.length ? `${blocks.length} block${blocks.length === 1 ? "" : "s"}, no markdown needed` : "Waiting for a paste"}
              </span>
            </div>
            <div className="text-[13px] text-muted">Each block is read from its shape, not from markup. If one is wrong, change its type.</div>

            <div className="box-border flex flex-col gap-4 rounded-xl border border-line bg-white p-4">
              {blocks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-muted">
                  <Icon.Sparkle size={24} />
                  <p className="m-0 text-sm">Blocks appear here as you paste: text, headings, lists, tables, code, diagrams, logs, links and images.</p>
                </div>
              ) : (
                blocks.map((b, i) => (
                  <div key={`${i}-${b.detected}`} className={i ? "border-t border-line pt-4" : ""}>
                    <BlockCard
                      block={b}
                      index={i}
                      file={b.fileKey ? files.get(b.fileKey) : undefined}
                      uploading={Boolean(b.fileKey && uploading.has(b.fileKey))}
                      onKind={(k) => setOverride(b, { kind: k })}
                      onLang={(l) => setOverride(b, { lang: l })}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-tip p-4 text-sm leading-relaxed text-ink-2">
              <div>
                <b>Nothing is lost.</b> A block the vault can&apos;t place is kept as Plain text, exactly as pasted.
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <input id="nn-keep" type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} className="h-5 w-5 accent-accent" />
                <label htmlFor="nn-keep">Keep the original paste with the note</label>
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <input id="nn-keep-file" type="checkbox" checked={keepFile} onChange={(e) => setKeepFile(e.target.checked)} className="h-5 w-5 accent-accent" />
                <label htmlFor="nn-keep-file">Attach imported files (PDF, Word…) to the note</label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
