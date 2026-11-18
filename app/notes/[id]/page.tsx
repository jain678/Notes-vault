import { notFound } from "next/navigation";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { createClient } from "@/lib/supabase/server";
import type { Note } from "@/lib/notes";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  // RLS guarantees this only ever returns the signed-in user's own note.
  const { data } = await supabase
    .from("notes")
    .select("id,user_id,title,content,content_text,tags,pinned,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  return <NoteEditor key={id} note={data as Note} />;
}
