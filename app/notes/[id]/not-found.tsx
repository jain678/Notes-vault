import Link from "next/link";

export default function NoteNotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Note not found</h1>
      <p className="text-sm text-zinc-500">It may have been deleted, or it isn&apos;t yours.</p>
      <Link href="/notes" className="text-sm underline">Back to notes</Link>
    </div>
  );
}
