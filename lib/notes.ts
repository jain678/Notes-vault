import type { JSONContent } from "@tiptap/react";
import { createClient } from "@/lib/supabase/client";

export const BUCKET = "note-assets";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const PAGE_SIZE = 50;

export type Note = {
  id: string;
  user_id: string;
  title: string;
  content: JSONContent;
  content_text: string;
  tags: string[];
  pinned: boolean;
  collection_id: string | null;
  raw_paste: string | null;
  created_at: string;
  updated_at: string;
};

export const NOTE_COLUMNS =
  "id,user_id,title,content,content_text,tags,pinned,collection_id,raw_paste,created_at,updated_at";

export type NoteSummary = Pick<
  Note,
  "id" | "title" | "tags" | "pinned" | "updated_at" | "collection_id"
> & { preview: string };

export type Collection = { id: string; name: string };

const SUMMARY_COLUMNS = "id,title,tags,pinned,updated_at,collection_id,preview";

function toSummary(row: NoteSummary & { preview: string | null }): NoteSummary {
  return { ...row, preview: row.preview ?? "" };
}

/** Title shown in lists: the note's title, else its first line of text. */
export function displayTitle(n: { title: string; preview: string }) {
  return n.title.trim() || n.preview.split("\n").find((l) => l.trim())?.trim().slice(0, 80) || "Untitled";
}

// ---- collections -------------------------------------------------------------
export async function listCollections(): Promise<Collection[]> {
  const { data, error } = await createClient().from("collections").select("id,name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createCollection(name: string): Promise<Collection> {
  const { data, error } = await createClient()
    .from("collections")
    .insert({ name: name.trim().slice(0, 80) })
    .select("id,name")
    .single();
  if (error) throw error;
  return data;
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const { error } = await createClient().from("collections").update({ name: name.trim().slice(0, 80) }).eq("id", id);
  if (error) throw error;
}

/** Deletes the collection; its notes stay and become unfiled. */
export async function deleteCollection(id: string): Promise<void> {
  const { error } = await createClient().from("collections").delete().eq("id", id);
  if (error) throw error;
}

/** Most recent notes for the sidebar tree. */
export async function listAllSummaries(limit = 500): Promise<NoteSummary[]> {
  const { data, error } = await createClient()
    .from("notes")
    .select(SUMMARY_COLUMNS)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toSummary);
}

export async function listNotes(opts: {
  search?: string;
  tag?: string | null;
  page?: number;
}): Promise<{ notes: NoteSummary[]; hasMore: boolean }> {
  const supabase = createClient();
  const page = opts.page ?? 0;
  let q = supabase
    .from("notes")
    .select(SUMMARY_COLUMNS)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE); // one extra row to detect "more"

  const search = opts.search?.trim();
  if (search) q = q.textSearch("search", search, { type: "websearch", config: "english" });
  if (opts.tag) q = q.contains("tags", [opts.tag]);

  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  return {
    notes: rows.slice(0, PAGE_SIZE).map(toSummary),
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function listTags(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("notes").select("tags");
  if (error) throw error;
  const set = new Set<string>();
  (data ?? []).forEach((r: { tags: string[] }) => r.tags.forEach((t) => set.add(t)));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function getNote(id: string): Promise<Note | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Note | null;
}

export async function createNote(
  init?: Partial<Pick<Note, "id" | "title" | "content" | "content_text" | "tags" | "collection_id" | "raw_paste">>,
): Promise<Note> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      ...(init?.id ? { id: init.id } : {}),
      title: init?.title ?? "",
      content: init?.content ?? { type: "doc", content: [] },
      content_text: init?.content_text ?? "",
      tags: init?.tags ?? [],
      collection_id: init?.collection_id ?? null,
      raw_paste: init?.raw_paste ?? null,
    })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "content" | "content_text" | "tags" | "pinned" | "collection_id">>,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const supabase = createClient();
  const { data: files } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("note_id", id);
  const paths = (files ?? []).map((f: { storage_path: string }) => f.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export type StoredFile = { path: string; name: string; mime: string; size: number };

/** Uploads a file to "<user_id>/<note_id>/<uuid>-<name>" without recording it (note may not exist yet). */
export async function uploadToStorage(noteId: string, file: File): Promise<StoredFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`"${file.name}" is larger than 25 MB.`);
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) throw new Error("Not signed in.");
  const safeName = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `${userId}/${noteId}/${crypto.randomUUID()}-${safeName}`;
  const mime = file.type || "application/octet-stream";
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, name: file.name || safeName, mime, size: file.size };
}

/** Records already-uploaded files against an existing note. */
export async function recordAttachments(noteId: string, files: StoredFile[]): Promise<void> {
  if (!files.length) return;
  const { error } = await createClient().from("attachments").insert(
    files.map((f) => ({ note_id: noteId, storage_path: f.path, file_name: f.name, mime_type: f.mime, size_bytes: f.size })),
  );
  if (error) throw error;
}

export async function removeFromStorage(paths: string[]): Promise<void> {
  if (paths.length) await createClient().storage.from(BUCKET).remove(paths);
}

/** Uploads a file for an existing note and records it. */
export async function uploadFile(noteId: string, file: File): Promise<StoredFile> {
  const stored = await uploadToStorage(noteId, file);
  await recordAttachments(noteId, [stored]);
  return stored;
}

// ---- signed URLs (private bucket) -------------------------------------------
const SIGNED_TTL_SECONDS = 60 * 60;
const urlCache = new Map<string, { url: string; expires: number }>();

export async function getSignedUrl(path: string, download?: string): Promise<string> {
  const key = download ? `${path}::dl` : path;
  const hit = urlCache.get(key);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SECONDS, download ? { download } : undefined);
  if (error || !data) throw error ?? new Error("Could not load file");
  urlCache.set(key, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL_SECONDS * 1000 });
  return data.signedUrl;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ---- books -------------------------------------------------------------------
/** Notes by id, returned in the order given (missing or foreign ids are skipped by RLS). */
export async function getNotes(ids: string[]): Promise<Note[]> {
  if (!ids.length) return [];
  const { data, error } = await createClient().from("notes").select(NOTE_COLUMNS).in("id", ids);
  if (error) throw error;
  const byId = new Map((data as Note[]).map((n) => [n.id, n]));
  return ids.map((id) => byId.get(id)).filter((n): n is Note => Boolean(n));
}

/** A collection's notes, oldest first (reads like a book). */
export async function getCollectionNotes(collectionId: string): Promise<Note[]> {
  const { data, error } = await createClient()
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Note[];
}
