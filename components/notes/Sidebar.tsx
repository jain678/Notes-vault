"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, ui } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  createCollection,
  deleteCollection,
  displayTitle,
  listAllSummaries,
  listCollections,
  listNotes,
  renameCollection,
  type Collection,
  type NoteSummary,
} from "@/lib/notes";
import { onNoteEvent, emitNoteEvent } from "./events";

function sortNotes(list: NoteSummary[]) {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
}

export function Sidebar({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const activeId = params.id;

  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [results, setResults] = useState<NoteSummary[] | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    Promise.all([listAllSummaries(), listCollections()])
      .then(([n, c]) => {
        setNotes(n);
        setCollections(c);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load your vault"))
      .finally(() => setLoading(false));
  }, []);

  // Search / tag filter.
  useEffect(() => {
    const q = search.trim();
    if (!q && !tag) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const res = await listNotes({ search: q, tag });
        if (id === reqId.current) setResults(res.notes);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : "Search failed");
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, tag]);
  const filtering = Boolean(search.trim() || tag);

  // Live updates from the editor and paste screen.
  useEffect(
    () =>
      onNoteEvent((e) => {
        if (e.type === "collections") {
          listCollections().then(setCollections).catch(() => {});
        } else if (e.type === "delete") {
          setNotes((prev) => prev.filter((n) => n.id !== e.id));
          setResults((prev) => prev?.filter((n) => n.id !== e.id) ?? null);
        } else {
          setNotes((prev) => sortNotes(prev.some((n) => n.id === e.note.id) ? prev.map((n) => (n.id === e.note.id ? e.note : n)) : [e.note, ...prev]));
          setResults((prev) => prev?.map((n) => (n.id === e.note.id ? e.note : n)) ?? null);
        }
      }),
    [],
  );

  const tags = useMemo(() => {
    const s = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [notes]);

  const pinned = notes.filter((n) => n.pinned);
  const byCollection = useMemo(() => {
    const m = new Map<string | null, NoteSummary[]>();
    notes.forEach((n) => {
      const key = n.collection_id && collections.some((c) => c.id === n.collection_id) ? n.collection_id : null;
      m.set(key, [...(m.get(key) ?? []), n]);
    });
    return m;
  }, [notes, collections]);
  const unsorted = byCollection.get(null) ?? [];

  async function newCollection() {
    const name = window.prompt("Name the new collection");
    if (!name?.trim()) return;
    try {
      await createCollection(name);
      emitNoteEvent({ type: "collections" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create collection");
    }
  }

  async function rename(c: Collection) {
    setMenuFor(null);
    const name = window.prompt("Rename collection", c.name);
    if (!name?.trim() || name.trim() === c.name) return;
    try {
      await renameCollection(c.id, name);
      emitNoteEvent({ type: "collections" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename collection");
    }
  }

  async function remove(c: Collection) {
    setMenuFor(null);
    if (!window.confirm(`Delete the collection “${c.name}”? Its notes are kept and move to Unsorted.`)) return;
    try {
      await deleteCollection(c.id);
      setNotes((prev) => prev.map((n) => (n.collection_id === c.id ? { ...n, collection_id: null } : n)));
      emitNoteEvent({ type: "collections" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete collection");
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const noteLink = (n: NoteSummary, nested: boolean) => {
    const active = activeId === n.id;
    return (
      <li key={n.id}>
        <Link
          href={`/notes/${n.id}`}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 items-center rounded-lg pr-3 ${nested ? "pl-9" : "pl-3"} ${
            active ? "bg-accent-soft font-semibold text-accent-ink" : "text-ink-2 hover:bg-[#e9e5dc]"
          }`}
        >
          <span className="truncate">{displayTitle(n)}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className="flex h-full flex-col gap-6 overflow-y-auto bg-side px-4 py-6">
      <Link href="/notes" onClick={onNavigate} className="flex items-center gap-2.5 px-2 text-ink">
        <span className="text-accent">
          <Icon.Logo />
        </span>
        <span className="font-serif text-2xl font-semibold">Vault</span>
      </Link>

      <div className="flex flex-col gap-3">
        <Link
          href="/notes/new"
          onClick={onNavigate}
          aria-current={pathname === "/notes/new" ? "page" : undefined}
          className={`${ui.btnPrimary} w-full`}
        >
          <Icon.Plus /> New note
        </Link>
        <div className="flex flex-col gap-1">
          <label htmlFor="vault-search" className="px-1 text-[13px] text-muted">
            Search the vault
          </label>
          <input
            id="vault-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Text, code, diagrams, tags"
            className={ui.input}
          />
        </div>
      </div>

      {error && <p className="rounded-lg bg-log px-3 py-2 text-sm text-log-ink">{error}</p>}

      {filtering ? (
        <nav aria-label="Search results" className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className={ui.eyebrow}>{tag && !search.trim() ? `Tagged #${tag}` : "Results"}</span>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setTag(null);
                setResults(null);
              }}
              className="min-h-9 rounded px-2 text-[13px] text-accent hover:underline"
            >
              Clear
            </button>
          </div>
          {results === null ? (
            <p className="px-3 text-sm text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 text-sm text-muted">Nothing matches.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {results.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    onClick={onNavigate}
                    className={`block rounded-lg px-3 py-2 ${activeId === n.id ? "bg-accent-soft text-accent-ink" : "hover:bg-[#e9e5dc]"}`}
                  >
                    <span className="block truncate font-medium">{displayTitle(n)}</span>
                    {n.title.trim() && n.preview && <span className="block truncate text-[13px] text-muted">{n.preview.replace(/\s+/g, " ")}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      ) : (
        <>
          {pinned.length > 0 && (
            <nav aria-label="Pinned" className="flex flex-col gap-1">
              <div className={`${ui.eyebrow} px-2 pb-1`}>Pinned</div>
              <ul className="flex flex-col gap-0.5">{pinned.map((n) => noteLink(n, false))}</ul>
            </nav>
          )}

          <nav aria-label="Collections" className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className={ui.eyebrow}>Collections</span>
              <button type="button" onClick={newCollection} aria-label="New collection" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-[#e9e5dc] hover:text-ink">
                <Icon.Plus size={16} />
              </button>
            </div>
            {loading && <div className="mx-2 h-24 animate-pulse rounded-lg bg-[#e9e5dc]" />}
            <ul className="flex flex-col gap-0.5">
              {collections.map((c) => {
                const list = byCollection.get(c.id) ?? [];
                const open = !collapsed.has(c.id) || list.some((n) => n.id === activeId);
                return (
                  <li key={c.id} className="flex flex-col gap-0.5">
                    <div className="group relative flex items-center">
                      <button
                        type="button"
                        onClick={() => toggle(c.id)}
                        aria-expanded={open}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left font-semibold text-ink hover:bg-[#e9e5dc]"
                      >
                        <Icon.Folder />
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto text-[13px] font-normal text-muted">{list.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                        aria-label={`Options for ${c.name}`}
                        aria-expanded={menuFor === c.id}
                        className="flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-muted opacity-60 hover:bg-[#e9e5dc] hover:text-ink group-hover:opacity-100"
                      >
                        <Icon.More size={16} />
                      </button>
                      {menuFor === c.id && (
                        <div className="absolute right-0 top-11 z-20 flex w-40 flex-col rounded-[10px] border border-line bg-white p-1 shadow-lg">
                          <button type="button" onClick={() => rename(c)} className="min-h-10 rounded-md px-3 text-left text-sm hover:bg-side">
                            Rename
                          </button>
                          <button type="button" onClick={() => remove(c)} className="min-h-10 rounded-md px-3 text-left text-sm text-log-ink hover:bg-log">
                            Delete collection
                          </button>
                        </div>
                      )}
                    </div>
                    {open && list.length > 0 && <ul className="flex flex-col gap-0.5">{list.map((n) => noteLink(n, true))}</ul>}
                    {open && list.length === 0 && <p className="py-1 pl-9 text-[13px] text-muted">No notes yet</p>}
                  </li>
                );
              })}
              {(unsorted.length > 0 || (!loading && collections.length === 0)) && (
                <li className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => toggle("__unsorted")}
                    aria-expanded={!collapsed.has("__unsorted")}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-left font-semibold text-ink hover:bg-[#e9e5dc]"
                  >
                    <Icon.Inbox />
                    <span>Unsorted</span>
                    <span className="ml-auto text-[13px] font-normal text-muted">{unsorted.length}</span>
                  </button>
                  {(!collapsed.has("__unsorted") || unsorted.some((n) => n.id === activeId)) &&
                    (unsorted.length ? (
                      <ul className="flex flex-col gap-0.5">{unsorted.map((n) => noteLink(n, true))}</ul>
                    ) : (
                      <p className="py-1 pl-9 text-[13px] text-muted">Your notes will appear here</p>
                    ))}
                </li>
              )}
            </ul>
          </nav>
        </>
      )}

      {tags.length > 0 && (
        <div className="flex flex-col gap-2 px-2">
          <div className={ui.eyebrow}>Tags</div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tag === t}
                onClick={() => setTag(tag === t ? null : t)}
                className={tag === t ? "inline-flex items-center rounded-full border border-accent bg-accent px-3 py-1.5 text-[13px] text-white" : ui.chip}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line px-2 pt-4 text-[13px] text-muted">
        <span className="truncate" title={email}>
          {email}
        </span>
        <button type="button" onClick={signOut} className="min-h-9 shrink-0 rounded-lg px-2 hover:bg-[#e9e5dc] hover:text-ink">
          Log out
        </button>
      </div>
    </aside>
  );
}
