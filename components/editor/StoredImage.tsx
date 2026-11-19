"use client";

import Image from "@tiptap/extension-image";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getSignedUrl } from "@/lib/notes";

/**
 * Image node that can point at a file in the private Storage bucket (`path`)
 * or at an external URL (`src`). Signed URLs are resolved at render time and
 * never stored in the note.
 */
export const StoredImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-path"),
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {}),
      },
    };
  },
  renderMarkdown(node) {
    const alt = node.attrs?.alt ?? "";
    const src = node.attrs?.path ? `vault:${node.attrs.path}` : (node.attrs?.src ?? "");
    return `![${alt}](${src})`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
}).configure({ inline: false, allowBase64: false });

function ImageView({ node, selected }: ReactNodeViewProps) {
  const { path, src, alt, title } = node.attrs as {
    path: string | null;
    src: string | null;
    alt: string | null;
    title: string | null;
  };
  const [url, setUrl] = useState<string | null>(path ? null : src);
  const [failed, setFailed] = useState(false);

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
    <NodeViewWrapper className="my-4" data-drag-handle>
      {failed ? (
        <div className="rounded border border-dashed p-4 text-sm text-zinc-500">Image unavailable</div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt ?? ""}
          title={title ?? undefined}
          onDoubleClick={() => window.open(url, "_blank", "noopener")}
          className={`mx-auto max-h-[70vh] rounded-md ${selected ? "ring-2 ring-blue-500" : ""}`}
        />
      ) : (
        <div className="h-40 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
      )}
    </NodeViewWrapper>
  );
}
