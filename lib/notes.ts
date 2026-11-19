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
  created_at: string;
  updated_at: string;
};

export type NoteSummary = Pick<
  Note,
  "id" | "title" | "tags" | "pinned" | "updated_at"
> & { preview: string };

const SUMMARY_COLUMNS = "id,title,tags,pinned,updated_at,content_text";

function toSummary(row: {
  id: string;
  title: string;
  tags: string[];
  pinned: boolean;
  updated_at: string;
  content_text: string;
}): NoteSummary {
  const { content_text, ...rest } = row;
  return { ...rest, preview: content_text.slice(0, 160) };
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
    .select("id,user_id,title,content,content_text,tags,pinned,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Note | null;
}

export async function createNote(init?: Partial<Pick<Note, "title" | "content" | "content_text">>): Promise<Note> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      title: init?.title ?? "",
      content: init?.content ?? { type: "doc", content: [] },
      content_text: init?.content_text ?? "",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "content" | "content_text" | "tags" | "pinned">>,
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

/** Uploads a file into "<user_id>/<note_id>/<uuid>-<name>" and records it. */
export async function uploadFile(noteId: string, file: File): Promise<{ path: string }> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`"${file.name}" is larger than 25 MB.`);
  }
  const supabase = createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) throw new Error("Not signed in.");

  const safeName = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-100);
  const path = `${userId}/${noteId}/${crypto.randomUUID()}-${safeName}`;
  const contentType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType, upsert: false });
  if (error) throw error;

  const { error: rowError } = await supabase.from("attachments").insert({
    note_id: noteId,
    storage_path: path,
    file_name: file.name || safeName,
    mime_type: contentType,
    size_bytes: file.size,
  });
  if (rowError) throw rowError;
  return { path };
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
