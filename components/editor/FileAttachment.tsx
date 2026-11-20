"use client";

import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { formatBytes, getSignedUrl } from "@/lib/notes";
import { FileAttachmentBase } from "./nodes";

export const FileAttachment = FileAttachmentBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FileView);
  },
});

function FileView({ node, selected }: ReactNodeViewProps) {
  const { path, name, size, mime } = node.attrs as { path: string; name: string; size: number; mime: string };
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE";

  async function open() {
    const url = await getSignedUrl(path, name);
    window.open(url, "_blank", "noopener");
  }

  return (
    <NodeViewWrapper className="font-sans" data-drag-handle>
      <button
        type="button"
        onClick={open}
        contentEditable={false}
        title={mime}
        className={`flex min-h-11 w-full max-w-md items-center gap-3 rounded-[10px] border border-line bg-white px-4 py-3 text-left transition-colors hover:border-accent ${selected ? "ring-2 ring-accent ring-offset-2" : ""}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[11px] font-semibold text-accent-ink">{ext}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-ink">{name}</span>
          <span className="block text-[13px] text-muted">{formatBytes(size)} · Download</span>
        </span>
      </button>
    </NodeViewWrapper>
  );
}
