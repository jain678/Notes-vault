"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createNote, listNotes, listTags, type NoteSummary } from "@/lib/notes";
import { onNoteEvent } from "./events";

export function displayTitle(n: { title: string; preview: string }) {
  return n.title.trim() || n.preview.split("\n").find((l) => l.trim())?.slice(0, 80) || "Untitled";
}

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function sortNotes(list: NoteSummary[]) {
  return [...list].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at),
  );
}

export function Sidebar({ email, onNavigate }: { email: string; onNavigate?: () => void }) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async (pageNum: number, append: boolean, s: string, t: string | null) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await listNotes({ search: s, tag: t, page: pageNum });
      if (id !== reqId.current) return;
      setNotes((prev) => (append ? [...prev, ...res.notes] : res.notes));
      setHasMore(res.hasMore);
      setPage(pageNum);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError(e instanceof Error ? e.message : "Could not load notes");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Debounced reload on search/tag change.
  useEffect(() => {
    const t = setTimeout(() => void load(0, false, search, tag), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, tag, load]);

  const refreshTags = useCallback(() => {
    listTags().then(setTags).catch(() => {});
  }, []);
  useEffect(refreshTags, [refreshTags]);

  // Live updates from the editor.
  useEffect(
    () =>
      onNoteEvent((e) => {
        if (e.type === "delete") {
          setNotes((prev) => prev.filter((n) => n.id !== e.id));
          refreshTags();
          return;
        }
        setNotes((prev) => {
          const exists = prev.some((n) => n.id === e.note.id);
          if (!exists && (search || tag)) return prev;
          return sortNotes(exists ? prev.map((n) => (n.id === e.note.id ? e.note : n)) : [e.note, ...prev]);
        });
        if (e.note.tags.some((t) => !tags.includes(t))) refreshTags();
      }),
    [search, tag, tags, refreshTags],
  );

  async function newNote() {
    try {
      const n = await createNote();
      setNotes((prev) => sortNotes([{ ...n, preview: "" }, ...prev]));
      onNavigate?.();
      router.push(`/notes/${n.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create note");
    }
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <Link href="/notes" onClick={onNavigate} className="text-lg font-semibold tracking-tight">
          🗒️ Notes Vault
        </Link>
        <button
          onClick={newNote}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          title="New note"
        >
          + New
        </button>
      </div>

      <div className="px-4 pb-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes…"
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`rounded-full px-2 py-0.5 text-xs ${
                tag === t
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-200/70 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {error && <p className="px-2 py-2 text-sm text-red-600">{error}</p>}
        {!loading && notes.length === 0 && !error && (
          <p className="px-2 py-6 text-center text-sm text-zinc-500">
            {search || tag ? "No matching notes." : "No notes yet."}
          </p>
        )}
        <ul className="space-y-0.5">
          {notes.map((n) => {
            const active = params.id === n.id;
            return (
              <li key={n.id}>
                <Link
                  href={`/notes/${n.id}`}
                  onClick={onNavigate}
                  className={`block rounded-md px-3 py-2 ${
                    active ? "bg-white shadow-sm dark:bg-zinc-800" : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {n.pinned && <span className="text-xs text-amber-500">★</span>}
                    <span className="truncate text-sm font-medium">{displayTitle(n)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="shrink-0">{timeAgo(n.updated_at)}</span>
                    <span className="truncate">
                      {n.title.trim() ? n.preview.replace(/\s+/g, " ") : ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {hasMore && (
          <button
            onClick={() => void load(page + 1, true, search, tag)}
            disabled={loading}
            className="mt-2 w-full rounded-md py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        )}
        {loading && notes.length === 0 && (
          <div className="space-y-2 px-2 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-zinc-200/60 dark:bg-zinc-800" />
            ))}
          </div>
        )}
      </nav>

      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="truncate" title={email}>{email}</span>
        <button onClick={signOut} className="ml-2 shrink-0 rounded px-2 py-1 hover:bg-zinc-200 dark:hover:bg-zinc-800">
          Log out
        </button>
      </div>
    </aside>
  );
}
