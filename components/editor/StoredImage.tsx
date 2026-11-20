"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getSignedUrl } from "@/lib/notes";
import { useEditing } from "./editing";
import { StoredImageBase } from "./nodes";

/**
 * Image shown as a numbered figure. Files in the private bucket are loaded
 * through short-lived signed URLs, never stored in the note.
 */
export const StoredImage = StoredImageBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});

const looksLikeFilename = (s: string) => /\.(png|jpe?g|gif|webp|svg|heic|bmp)$/i.test(s) || /^image(\s|$)/i.test(s);

function ImageView({ node, selected, updateAttributes }: ReactNodeViewProps) {
  const editing = useEditing();
  const { path, src, alt, title } = node.attrs as { path: string | null; src: string | null; alt: string | null; title: string | null };
  const [url, setUrl] = useState<string | null>(path ? null : src);
  const [failed, setFailed] = useState(false);
  const caption = title || (alt && !looksLikeFilename(alt) ? alt : "");

  useEffect(() => {
    if (!path) return;
    let alive = true;
    getSignedUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);

  return (
    <NodeViewWrapper as="figure" className="vault-figure m-0 flex flex-col gap-2.5 font-sans" data-drag-handle>
      {failed ? (
        <div className="flex h-40 items-center justify-center rounded-xl bg-placeholder text-sm text-muted">Image unavailable</div>
      ) : url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" contentEditable={false} onClick={(e) => editing && e.preventDefault()} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={caption || alt || ""}
            className={`mx-auto block max-h-[75vh] max-w-full rounded-xl ${selected && editing ? "ring-2 ring-accent ring-offset-2" : ""}`}
          />
        </a>
      ) : (
        <div className="h-60 animate-pulse rounded-xl bg-placeholder" />
      )}
      <figcaption contentEditable={false} className="flex flex-wrap items-center gap-2 text-sm leading-normal text-muted">
        <span>
          <span className="fig-num" /> {caption}
        </span>
        {editing && (
          <button
            type="button"
            onClick={() => {
              const next = window.prompt("Caption", caption);
              if (next !== null) updateAttributes({ title: next.trim() || null });
            }}
            className="rounded px-1.5 text-accent underline underline-offset-2 hover:text-accent-hover"
          >
            {caption ? "Edit caption" : "Add caption"}
          </button>
        )}
      </figcaption>
    </NodeViewWrapper>
  );
}
