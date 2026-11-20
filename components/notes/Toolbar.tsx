"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useRef } from "react";

type Props = { editor: Editor; onFiles: (files: File[]) => void };

export function Toolbar({ editor, onFiles }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      codeBlock: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
    }),
  });

  const c = () => editor.chain().focus();

  function setLink() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") c().extendMarkRange("link").unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url }).run();
  }

  const btn = (active: boolean) =>
    `min-h-9 min-w-9 rounded-md px-2 text-sm transition-colors ${
      active ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-side"
    }`;
  const sep = <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />;

  return (
    <div role="toolbar" aria-label="Formatting" className="sticky top-[70px] z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-white/95 p-1.5 font-sans shadow-sm backdrop-blur">
      <button className={btn(s.h1)} onClick={() => c().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</button>
      <button className={btn(s.h2)} onClick={() => c().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</button>
      <button className={btn(s.h3)} onClick={() => c().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</button>
      {sep}
      <button className={`${btn(s.bold)} font-bold`} onClick={() => c().toggleBold().run()} title="Bold (Ctrl+B)">B</button>
      <button className={`${btn(s.italic)} italic`} onClick={() => c().toggleItalic().run()} title="Italic (Ctrl+I)">I</button>
      <button className={`${btn(s.strike)} line-through`} onClick={() => c().toggleStrike().run()} title="Strikethrough">S</button>
      <button className={`${btn(s.code)} font-mono`} onClick={() => c().toggleCode().run()} title="Inline code">{"`c`"}</button>
      <button className={btn(s.link)} onClick={setLink} title="Link">Link</button>
      {sep}
      <button className={btn(s.bullet)} onClick={() => c().toggleBulletList().run()} title="Bullet list">List</button>
      <button className={btn(s.ordered)} onClick={() => c().toggleOrderedList().run()} title="Numbered list">Numbered</button>
      <button className={btn(s.task)} onClick={() => c().toggleTaskList().run()} title="Checklist">Checklist</button>
      <button className={btn(s.quote)} onClick={() => c().toggleBlockquote().run()} title="Callout / tip">Tip</button>
      {sep}
      <button className={`${btn(s.codeBlock)} font-mono`} onClick={() => c().toggleCodeBlock().run()} title="Code block">{"</>"}</button>
      <button
        className={btn(false)}
        title="Mermaid diagram"
        onClick={() =>
          c()
            .insertContent({
              type: "codeBlock",
              attrs: { language: "mermaid" },
              content: [{ type: "text", text: "flowchart LR\n  A[Paste] --> B[Store] --> C[Read]" }],
            })
            .run()
        }
      >
        Diagram
      </button>
      <button
        className={btn(s.table)}
        title={s.table ? "Delete table" : "Insert table"}
        onClick={() =>
          s.table ? c().deleteTable().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        {s.table ? "Remove table" : "Table"}
      </button>
      {s.table && (
        <>
          <button className={btn(false)} onClick={() => c().addRowAfter().run()} title="Add row">+Row</button>
          <button className={btn(false)} onClick={() => c().addColumnAfter().run()} title="Add column">+Col</button>
        </>
      )}
      <button className={btn(false)} onClick={() => c().setHorizontalRule().run()} title="Divider">―</button>
      {sep}
      <button className={btn(false)} onClick={() => imageInput.current?.click()} title="Upload image">Image</button>
      <button className={btn(false)} onClick={() => fileInput.current?.click()} title="Attach file">File</button>
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}
