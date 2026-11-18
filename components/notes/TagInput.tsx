"use client";

import { useState } from "react";

export function normalizeTag(t: string) {
  return t.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 40);
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const parts = raw.split(",").map(normalizeTag).filter(Boolean);
    const next = [...tags];
    parts.forEach((p) => !next.includes(p) && next.push(p));
    if (next.length !== tags.length) onChange(next);
    setDraft("");
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          #{t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            aria-label={`Remove tag ${t}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={tags.length ? "+ tag" : "+ Add tags"}
        className="min-w-20 flex-1 bg-transparent text-xs outline-none placeholder:text-zinc-400"
        aria-label="Add tag"
      />
    </div>
  );
}
