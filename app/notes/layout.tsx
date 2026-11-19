import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotesShell } from "@/components/notes/NotesShell";

export default async function NotesLayout({ children }: LayoutProps<"/notes">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return <NotesShell email={(data.claims.email as string) ?? ""}>{children}</NotesShell>;
}
