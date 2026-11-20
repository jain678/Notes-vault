"use client";

import { ui } from "@/components/ui";
import type { Collection } from "@/lib/notes";

export function parseTags(text: string): string[] {
  const out: string[] = [];
  text
    .split(/[,\n]/)
    .map((t) => t.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 40))
    .filter(Boolean)
    .forEach((t) => !out.includes(t) && out.push(t));
  return out;
}

export function CollectionSelect({
  id,
  value,
  collections,
  onChange,
}: {
  id: string;
  value: string;
  collections: Collection[];
  onChange: (v: string) => void;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={ui.input}>
      <option value="">Unsorted</option>
      {collections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value="__new">+ New collection…</option>
    </select>
  );
}
