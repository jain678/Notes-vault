"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { formatBytes, getSignedUrl } from "@/lib/notes";

/** A non-image file stored in the private bucket, shown as a download chip. */
export const FileAttachment = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      path: { default: null },
      name: { default: "file" },
      size: { default: 0 },
      mime: { default: "application/octet-stream" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-file-attachment]", getAttrs: (el) => ({
      path: el.getAttribute("data-path"),
      name: el.getAttribute("data-name"),
      size: Number(el.getAttribute("data-size") ?? 0),
      mime: el.getAttribute("data-mime"),
    }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-file-attachment": "",
        "data-path": node.attrs.path,
        "data-name": node.attrs.name,
        "data-size": node.attrs.size,
        "data-mime": node.attrs.mime,
      }),
      node.attrs.name,
    ];
  },

  renderMarkdown(node) {
    return `[📎 ${node.attrs?.name}](vault:${node.attrs?.path})`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileView);
  },
});

function FileView({ node, selected }: ReactNodeViewProps) {
  const { path, name, size, mime } = node.attrs as {
    path: string;
    name: string;
    size: number;
    mime: string;
  };

  async function open() {
    const url = await getSignedUrl(path, name);
    window.open(url, "_blank", "noopener");
  }

  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE";

  return (
    <NodeViewWrapper className="my-3" data-drag-handle>
      <button
        type="button"
        onClick={open}
        contentEditable={false}
        className={`flex w-full max-w-md items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800 ${selected ? "ring-2 ring-blue-500" : ""}`}
        title={mime}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {ext}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-zinc-500">{formatBytes(size)} · click to download</span>
        </span>
      </button>
    </NodeViewWrapper>
  );
}
