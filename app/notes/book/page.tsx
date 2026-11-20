import { Suspense } from "react";
import { BookBuilder } from "@/components/notes/BookBuilder";

export const metadata = { title: "Make a book · Vault" };

export default function BookPage() {
  return (
    <Suspense>
      <BookBuilder />
    </Suspense>
  );
}
