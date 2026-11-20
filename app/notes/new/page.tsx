import { Suspense } from "react";
import { NewNote } from "@/components/notes/NewNote";

export const metadata = { title: "New note · Vault" };

export default async function NewNotePage({ searchParams }: PageProps<"/notes/new">) {
  const { collection } = await searchParams;
  return (
    <Suspense>
      {/* Remount when the target collection changes. */}
      <NewNote key={typeof collection === "string" ? collection : "none"} />
    </Suspense>
  );
}
