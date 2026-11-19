import type { Editor } from "@tiptap/core";
import { detectLanguage, looksLikeCode, looksLikeMarkdown } from "./lowlight";

/** Everything we care about from a paste or drop, detached from the DOM event. */
export type ClipboardPayload = {
  html: string;
  text: string;
  vscodeLanguage: string | null;
  files: File[];
};

export function payloadFromDataTransfer(dt: DataTransfer | null): ClipboardPayload {
  if (!dt) return { html: "", text: "", vscodeLanguage: null, files: [] };
  let vscodeLanguage: string | null = null;
  try {
    const raw = dt.getData("vscode-editor-data");
    if (raw) vscodeLanguage = JSON.parse(raw).mode ?? "plaintext";
  } catch {
    /* ignore */
  }
  return {
    html: dt.getData("text/html"),
    text: dt.getData("text/plain"),
    vscodeLanguage,
    files: Array.from(dt.files ?? []),
  };
}

export type UploadHandler = (files: File[], pos: number | undefined, editor: Editor) => void;

/**
 * Decides how pasted content should land in the note.
 * Returns true if it handled the payload, false to let the editor do its default.
 */
export function applyPayload(
  editor: Editor,
  p: ClipboardPayload,
  onFiles: UploadHandler,
  opts: { allowDefaultHtml: boolean; pos?: number },
): boolean {
  // Images / files (screenshots, drag & drop, copied files)
  if (p.files.length > 0) {
    onFiles(p.files, opts.pos, editor);
    return true;
  }

  // Pasting inside an existing code block: keep raw text.
  if (editor.isActive("codeBlock")) {
    if (!opts.allowDefaultHtml && p.text) {
      editor.commands.insertContent(p.text);
      return true;
    }
    return false;
  }

  // From VS Code and similar editors: always a code block.
  if (p.vscodeLanguage && p.text) {
    insertCodeBlock(editor, p.text, p.vscodeLanguage === "plaintext" ? detectLanguage(p.text) : p.vscodeLanguage);
    return true;
  }

  // Rich HTML from web pages, Docs, etc. ProseMirror maps it onto our schema.
  if (p.html) {
    if (opts.allowDefaultHtml) return false;
    editor.view.pasteHTML(p.html);
    return true;
  }

  const text = p.text.replace(/\r\n/g, "\n");
  if (!text.trim()) return false;

  // A bare Mermaid diagram.
  if (detectLanguage(text) === "mermaid" && text.includes("\n")) {
    insertCodeBlock(editor, text, "mermaid");
    return true;
  }
  if (looksLikeMarkdown(text) && !looksLikeCode(text)) {
    editor.commands.insertContent(text, { contentType: "markdown" });
    return true;
  }
  if (looksLikeCode(text)) {
    insertCodeBlock(editor, text, detectLanguage(text));
    return true;
  }
  if (opts.allowDefaultHtml) return false;
  editor.view.pasteText(text);
  return true;
}

function insertCodeBlock(editor: Editor, code: string, language: string) {
  editor
    .chain()
    .focus()
    .insertContent([
      { type: "codeBlock", attrs: { language }, content: [{ type: "text", text: code.replace(/\n$/, "") }] },
      { type: "paragraph" },
    ])
    .run();
}
