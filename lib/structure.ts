"use client";

import { Editor, type JSONContent } from "@tiptap/core";
import { buildHeadlessExtensions } from "@/components/editor/extensions";
import { detectLanguage, looksLikeCode, prettyLang } from "@/components/editor/lowlight";

export { prettyLang };

/**
 * Turns a raw dump (plain text, Markdown, code, logs, links, uploaded files)
 * into typed blocks, then into a structured note document.
 * Every block keeps its original text, so nothing pasted is ever lost.
 */

export type BlockKind =
  | "text"
  | "heading"
  | "code"
  | "diagram"
  | "log"
  | "link"
  | "image"
  | "file"
  | "plain";

export type Block = {
  id: string;
  kind: BlockKind;
  detected: BlockKind;
  raw: string;
  reason: string;
  lang?: string;
  /** Short intro line such as "error from staging:" shown above the block. */
  label?: string;
  /** Upload token key, for image/file blocks pasted from the clipboard. */
  fileKey?: string;
  /** External image URL (from pasted Markdown/HTML). */
  src?: string;
  /** Sub-shape of a text block, used for the badge and conversion. */
  shape?: "paragraph" | "list" | "table" | "tsv";
};

export const KIND_LABEL: Record<BlockKind, string> = {
  text: "Text",
  heading: "Heading",
  code: "Code",
  diagram: "Diagram",
  log: "Log",
  link: "Link",
  image: "Image",
  file: "File",
  plain: "Plain text",
};

/** Types a block can be switched to from what it was detected as. */
export function kindOptions(b: Block): BlockKind[] {
  if (b.detected === "image" || b.detected === "file") return [b.detected, "plain"];
  const all: BlockKind[] = ["text", "heading", "code", "diagram", "log", "link", "plain"];
  return [b.detected, ...all.filter((k) => k !== b.detected)];
}

export const TOKEN_RE = /^\[\[(image|file):([\w-]+)(?: (.*))?\]\]$/;
export const fileToken = (kind: "image" | "file", key: string, name: string) =>
  `[[${kind}:${key} ${name.replace(/[\[\]\n]/g, "")}]]`;

const FENCE_RE = /^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/;
const URL_RE = /^<?(https?:\/\/[^\s<>]+)>?$/;
const MD_IMAGE_RE = /^!\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)$/;
const LIST_RE = /^\s*([-*•+]|\d+[.)]|\[[ xX]\])\s+\S/;
const STACK_RE = /^\s+at\s+\S|^\s*File ".*", line \d+|Traceback \(most recent call last\)|^\s+\.\.\. \d+ more/;
const LOG_RE =
  /^\s*\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}|^\s*\[?\d{2}:\d{2}:\d{2}|\b(ERROR|WARN|WARNING|FATAL|DEBUG|INFO|TRACE|CRITICAL)\b|^\s*\w*(Error|Exception)\b[:\s]|npm ERR!|exit (code|status) \d+|^\s*\^+\s*$|panic:|Segmentation fault/;

let seq = 0;
const newId = () => `b${++seq}`;

function classify(lines: string[]): Omit<Block, "id" | "detected"> {
  const raw = lines.join("\n");
  const nonEmpty = lines.filter((l) => l.trim());
  const single = nonEmpty.length === 1;
  const first = nonEmpty[0]?.trim() ?? "";

  if (single && URL_RE.test(first)) {
    return { kind: "link", raw: first.replace(URL_RE, "$1"), reason: "Starts with http" };
  }
  if (single && MD_IMAGE_RE.test(first)) {
    const [, alt, src] = first.match(MD_IMAGE_RE)!;
    if (/^https?:\/\//.test(src)) return { kind: "image", raw: alt || "Image", src, reason: "Image link" };
  }

  const stackLines = nonEmpty.filter((l) => STACK_RE.test(l)).length;
  const logLines = nonEmpty.filter((l) => LOG_RE.test(l) || STACK_RE.test(l)).length;
  if (stackLines > 0 || (nonEmpty.length >= 2 && logLines / nonEmpty.length >= 0.5) || (single && /^\s*\w*(Error|Exception)\b:/.test(first))) {
    return { kind: "log", raw, reason: stackLines ? "Looks like an error trace" : "Looks like log output" };
  }

  if (detectLanguage(raw) === "mermaid") {
    return { kind: "diagram", raw, lang: "mermaid", reason: "Mermaid keyword and arrows" };
  }

  if (nonEmpty.length >= 2 && nonEmpty.every((l) => l.includes("|")) && nonEmpty.some((l) => /^\s*\|?\s*:?-{3,}/.test(l))) {
    return { kind: "text", shape: "table", raw, reason: "Table with | columns" };
  }
  if (nonEmpty.length >= 2 && nonEmpty.every((l) => l.includes("\t"))) {
    const cols = nonEmpty.map((l) => l.split("\t").length);
    if (cols.every((c) => c === cols[0]) && cols[0] >= 2) {
      return { kind: "text", shape: "tsv", raw, reason: "Tab-separated table (e.g. from a spreadsheet)" };
    }
  }
  if (nonEmpty.every((l) => LIST_RE.test(l))) {
    return { kind: "text", shape: "list", raw, reason: nonEmpty.some((l) => /\[[ xX]\]/.test(l)) ? "Checklist items" : "List items" };
  }
  if (single && /^#{1,6}\s+\S/.test(first)) {
    return { kind: "heading", raw: first, reason: "Starts with #" };
  }
  if (looksLikeCode(raw)) {
    const lang = detectLanguage(raw);
    return { kind: "code", raw, lang, reason: lang === "plaintext" ? "Indentation and symbols" : `${prettyLang(lang)} syntax` };
  }
  if (single && isHeadingLine(first)) {
    return { kind: "heading", raw: first, reason: "Short line on its own" };
  }
  return { kind: "text", shape: "paragraph", raw, reason: nonEmpty.length > 1 ? "Sentences" : "A sentence" };
}

function isHeadingLine(line: string) {
  const words = line.split(/\s+/).length;
  if (line.length < 3 || line.length > 70 || words > 10) return false;
  if (/:$/.test(line)) return words <= 6;
  if (/[.,;!?)\]"'`]$/.test(line)) return false;
  return /^[A-Z0-9]/.test(line);
}

/** Splits a raw dump into typed blocks. */
export function analyze(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let chunk: string[] = [];

  const flush = () => {
    const lines = chunk.filter((l, i) => l.trim() || (i > 0 && i < chunk.length - 1));
    chunk = [];
    if (!lines.some((l) => l.trim())) return;
    const intro = lines[0].trim();
    if (lines.length >= 2) {
      const rest = classify(lines.slice(1));
      const introIsLog = LOG_RE.test(intro) || STACK_RE.test(intro);
      const introIsProse =
        !/[(){}\[\];=<>`$\t|]/.test(intro) &&
        !/^(def|class|if|elif|else|for|while|try|except|with|function|case|switch|do|catch|finally)\b/.test(intro);
      // "error from staging:" + trace → caption above the log/code/diagram.
      if (/:$/.test(intro) && intro.length <= 80 && introIsProse && !introIsLog && (rest.kind === "log" || rest.kind === "code" || rest.kind === "diagram")) {
        out.push({ ...rest, id: newId(), detected: rest.kind, label: intro });
        return;
      }
      // "Options" + list/table/code → heading followed by that block.
      if (introIsProse && isHeadingLine(intro) && (rest.shape === "list" || rest.shape === "table" || rest.shape === "tsv" || rest.kind === "code")) {
        out.push({ id: newId(), kind: "heading", detected: "heading", raw: intro, reason: "Short line before a list" });
        out.push({ ...rest, id: newId(), detected: rest.kind });
        return;
      }
    }
    const c = classify(lines);
    out.push({ ...c, id: newId(), detected: c.kind });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE_RE);
    if (fence) {
      flush();
      const closer = fence[1];
      const lang = fence[2].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(closer)) body.push(lines[i++]);
      const raw = body.join("\n");
      if (lang === "mermaid" || (!lang && detectLanguage(raw) === "mermaid")) {
        out.push({ id: newId(), kind: "diagram", detected: "diagram", raw, lang: "mermaid", reason: "Fenced Mermaid block" });
      } else {
        const l = lang || detectLanguage(raw);
        const kind = l === "log" || l === "console" ? "log" : "code";
        out.push({ id: newId(), kind, detected: kind, raw, lang: l, reason: "Fenced code block" });
      }
      continue;
    }
    const tok = line.trim().match(TOKEN_RE);
    if (tok) {
      flush();
      const kind = tok[1] as "image" | "file";
      out.push({ id: newId(), kind, detected: kind, raw: tok[3] ?? kind, fileKey: tok[2], reason: "From the clipboard" });
      continue;
    }
    if (!line.trim()) flush();
    else chunk.push(line);
  }
  flush();

  // Code and logs often contain blank lines: merge neighbours of the same type.
  const merged: Block[] = [];
  for (const b of out) {
    const prev = merged[merged.length - 1];
    if (
      prev && !b.label &&
      ((b.kind === "log" && prev.kind === "log" && prev.reason !== "Fenced code block") ||
        (b.kind === "code" && prev.kind === "code" && prev.lang === b.lang && b.reason !== "Fenced code block" && prev.reason !== "Fenced code block"))
    ) {
      prev.raw += "\n\n" + b.raw;
      continue;
    }
    merged.push(b);
  }
  return merged;
}

// ---- conversion ---------------------------------------------------------------

let headless: Editor | null = null;
function getHeadless() {
  headless ??= new Editor({ extensions: buildHeadlessExtensions() });
  return headless;
}

export function markdownToNodes(md: string): JSONContent[] {
  const doc = getHeadless().markdown!.parse(md);
  return doc.content ?? [];
}

/** Rich HTML (web pages, Docs) → Markdown text, so it can live in the paste box. */
export function htmlToMarkdown(html: string): string {
  const ed = getHeadless();
  ed.commands.setContent(html, { emitUpdate: false });
  return ed.getMarkdown();
}

export function docToText(doc: JSONContent): string {
  const ed = getHeadless();
  ed.commands.setContent(doc, { emitUpdate: false });
  return ed.getText({ blockSeparator: "\n" });
}

/** Normalises a text block's raw text into Markdown. */
export function textBlockMarkdown(b: Block): string {
  if (b.shape === "tsv") {
    const rows = b.raw.split("\n").filter((l) => l.trim()).map((l) => l.split("\t").map((c) => c.trim().replace(/\|/g, "\\|")));
    const head = `| ${rows[0].join(" | ")} |`;
    const sep = `| ${rows[0].map(() => "---").join(" | ")} |`;
    return [head, sep, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`)].join("\n");
  }
  if (b.shape === "list") return b.raw.replace(/^(\s*)[•+]\s+/gm, "$1- ").replace(/^(\s*)\[([ xX])\]\s+/gm, "$1- [$2] ");
  return b.raw;
}

export type UploadedFile = { path: string; name: string; mime: string; size: number };

const textNode = (text: string) => (text ? [{ type: "text", text }] : undefined);

/** Builds the final note document from the (possibly re-typed) blocks. */
export function blocksToDoc(blocks: Block[], files: Map<string, UploadedFile>): JSONContent {
  const content: JSONContent[] = [];
  for (const b of blocks) {
    if (b.label) content.push({ type: "paragraph", content: textNode(b.label) });
    switch (b.kind) {
      case "text":
        content.push(...markdownToNodes(textBlockMarkdown(b)));
        break;
      case "heading": {
        const m = b.raw.trim().match(/^(#{1,6})\s+/);
        const level = m ? Math.min(Math.max(m[1].length, 1), 4) : 2;
        const text = b.raw.trim().replace(/^#{1,6}\s+/, "").replace(/:$/, "").split("\n")[0];
        content.push({ type: "heading", attrs: { level }, content: textNode(text) });
        break;
      }
      case "code":
      case "diagram":
      case "log":
      case "plain": {
        const language = b.kind === "diagram" ? "mermaid" : b.kind === "log" ? "log" : b.kind === "plain" ? "plaintext" : (b.lang || detectLanguage(b.raw));
        content.push({ type: "codeBlock", attrs: { language }, content: textNode(b.raw) });
        break;
      }
      case "link": {
        const url = b.raw.trim().split(/\s+/)[0];
        if (/^https?:\/\//i.test(url)) content.push({ type: "linkCard", attrs: { href: url } });
        else content.push({ type: "paragraph", content: textNode(b.raw) });
        break;
      }
      case "image": {
        const f = b.fileKey ? files.get(b.fileKey) : undefined;
        if (f) content.push({ type: "image", attrs: { path: f.path, alt: f.name } });
        else if (b.src) content.push({ type: "image", attrs: { src: b.src, alt: b.raw } });
        break;
      }
      case "file": {
        const f = b.fileKey ? files.get(b.fileKey) : undefined;
        if (f) content.push({ type: "fileAttachment", attrs: { path: f.path, name: f.name, size: f.size, mime: f.mime } });
        break;
      }
    }
  }
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/** Title when none is given: a leading heading, else the first line of text. */
export function suggestTitle(blocks: Block[]): string {
  const first = blocks.find((b) => b.kind === "heading" || b.kind === "text" || b.label);
  if (!first) return "";
  const source = first.kind === "heading" || first.kind === "text" ? first.raw : first.label ?? "";
  const line = source
    .split("\n")
    .find((l) => l.trim())
    ?.replace(/^#{1,6}\s+/, "")
    .replace(/^\s*([-*•+]|\d+[.)]|\[[ xX]\])\s+/, "")
    .replace(/[:\t|]+$/, "")
    .trim();
  return line ? line.slice(0, 80) : "";
}

/**
 * When the title is taken from the first line of text, drop that line from the
 * body so it isn't shown twice.
 */
export function withoutTitleLine(blocks: Block[], title: string): Block[] {
  const i = blocks.findIndex((b) => b.kind === "heading" || b.kind === "text" || b.label);
  if (i < 0) return blocks;
  const b = blocks[i];
  if (b.kind !== "heading" && b.kind !== "text") return blocks;
  const lines = b.raw.split("\n");
  const first = lines.findIndex((l) => l.trim());
  const clean = (l: string) => l.replace(/^#{1,6}\s+/, "").replace(/^\s*([-*•+]|\d+[.)]|\[[ xX]\])\s+/, "").replace(/[:\t|]+$/, "").trim();
  if (first < 0 || clean(lines[first]).slice(0, 80) !== title) return blocks;
  if (b.kind === "text" && b.shape !== "paragraph") return blocks; // keep list/table rows intact
  const rest = lines.slice(first + 1).join("\n");
  const next = [...blocks];
  if (rest.trim()) next[i] = { ...b, raw: rest };
  else next.splice(i, 1);
  return next;
}

/** Rough reading time for a document's plain text. */
export function readingMinutes(text: string) {
  return Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200));
}
