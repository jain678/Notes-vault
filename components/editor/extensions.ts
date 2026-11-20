import { Extension, type Extensions } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CodeBlockView } from "./CodeBlockView";
import { FileAttachment } from "./FileAttachment";
import { FileAttachmentBase, LinkCard, StoredImageBase } from "./nodes";
import { StoredImage } from "./StoredImage";
import { lowlight } from "./lowlight";
import { applyPayload, payloadFromDataTransfer, type UploadHandler } from "./clipboard";

const SmartPaste = Extension.create<{ onFiles: UploadHandler }>({
  name: "smartPaste",
  addOptions() {
    return { onFiles: () => {} };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const onFiles = this.options.onFiles;
    return [
      new Plugin({
        key: new PluginKey("smartPaste"),
        props: {
          handlePaste(_view, event) {
            if (!event.clipboardData) return false;
            const payload = payloadFromDataTransfer(event.clipboardData);
            return applyPayload(editor, payload, onFiles, { allowDefaultHtml: true });
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false;
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0) return false;
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            event.preventDefault();
            onFiles(files, pos, editor);
            return true;
          },
        },
      }),
    ];
  },
});

function common(): Extensions {
  return [
    StarterKit.configure({
      codeBlock: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https" },
      heading: { levels: [1, 2, 3, 4] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    LinkCard,
    Markdown,
  ];
}

/** Extensions for the interactive editor (React node views, smart paste). */
export function buildExtensions(onFiles: UploadHandler): Extensions {
  return [
    ...common(),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: "plaintext" }),
    StoredImage,
    FileAttachment,
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "Heading" : "Write or paste anything: text, code, images, files, diagrams…",
    }),
    SmartPaste.configure({ onFiles }),
  ];
}

/** Same schema without any UI, for converting content outside the editor. */
export function buildHeadlessExtensions(): Extensions {
  return [
    ...common(),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: "plaintext" }),
    StoredImageBase,
    FileAttachmentBase,
  ];
}
