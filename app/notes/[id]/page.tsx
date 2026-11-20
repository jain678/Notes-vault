import { notFound } from "next/navigation";
import { NoteView } from "@/components/notes/NoteView";
import { NOTE_COLUMNS, type Note } from "@/lib/notes";
import { createClient } from "@/lib/supabase/server";

export default async function NotePage({ params }: PageProps<"/notes/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  // RLS guarantees this only ever returns the signed-in user's own note.
  const { data } = await supabase.from("notes").select(NOTE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();

  return <NoteView key={id} note={data as unknown as Note} />;
}
