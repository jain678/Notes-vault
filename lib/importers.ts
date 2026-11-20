"use client";

import { htmlToMarkdown } from "@/lib/structure";

/**
 * Turns an uploaded document into text the paste box understands
 * (Markdown-ish text plus [[image:…]] tokens for embedded pictures), so it goes
 * through the same structuring as a paste.
 */

export type ImportResult = { text: string; title: string; note?: string };
/** Queues an image upload and returns the token to place in the text. */
export type AddImage = (file: File) => string;

const CODE_EXT: Record<string, string> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c",
  cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", php: "php", sh: "bash", bash: "bash", zsh: "bash",
  sql: "sql", css: "css", scss: "scss", yaml: "yaml", yml: "yaml", xml: "xml", toml: "ini", ini: "ini",
  mmd: "mermaid", mermaid: "mermaid", log: "log", diff: "diff", patch: "diff",
};
const TEXT_EXT = ["txt", "text", "md", "markdown", "mdx", "rst", "org"];

export const IMPORT_ACCEPT = [
  ".pdf", ".docx", ".html", ".htm", ".csv", ".tsv", ".json",
  ...TEXT_EXT.map((e) => `.${e}`), ...Object.keys(CODE_EXT).map((e) => `.${e}`),
].join(",");

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";

export function titleFromFilename(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** Whether we can turn this file's contents into a note (vs. just attaching it). */
export function canImport(file: File): boolean {
  const e = ext(file.name);
  return (
    e === "pdf" || e === "docx" || e === "html" || e === "htm" || e === "csv" || e === "tsv" || e === "json" ||
    TEXT_EXT.includes(e) || e in CODE_EXT ||
    file.type === "application/pdf" || file.type === "text/html" || file.type === "text/markdown" ||
    (file.type.startsWith("text/") && !file.type.includes("rtf"))
  );
}

export async function importDocument(file: File, addImage: AddImage): Promise<ImportResult> {
  const e = ext(file.name);
  const fallbackTitle = titleFromFilename(file.name);
  if (e === "pdf" || file.type === "application/pdf") return importPdf(file, fallbackTitle);
  if (e === "docx") return importDocx(file, addImage, fallbackTitle);
  const raw = await file.text();
  if (e === "html" || e === "htm" || file.type === "text/html") {
    const title = raw.match(/<title[^>]*>([^<]{1,120})<\/title>/i)?.[1]?.trim();
    return { text: htmlToMarkdown(raw), title: title || fallbackTitle };
  }
  if (e === "csv" || e === "tsv") return { text: e === "tsv" ? raw : csvToTsv(raw), title: fallbackTitle };
  if (e === "json") {
    let pretty = raw;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {}
    return { text: "```json\n" + pretty.trimEnd() + "\n```", title: fallbackTitle };
  }
  if (e in CODE_EXT) return { text: "```" + CODE_EXT[e] + "\n" + raw.trimEnd() + "\n```", title: file.name };
  return { text: raw, title: fallbackTitle };
}

// ---- CSV ----------------------------------------------------------------------
function csvToTsv(csv: string): string {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"' && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => r.map((c) => c.replace(/[\t\n]+/g, " ").trim()).join("\t"))
    .join("\n");
}

// ---- Word (.docx) -----------------------------------------------------------------
async function importDocx(file: File, addImage: AddImage, fallbackTitle: string): Promise<ImportResult> {
  const mammoth = (await import("mammoth")).default;
  const markers = new Map<string, string>();
  let n = 0;
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
      convertImage: mammoth.images.imgElement(async (image) => {
        const buf = await image.readAsArrayBuffer();
        const extension = image.contentType.split("/")[1]?.replace("jpeg", "jpg") || "png";
        const token = addImage(new File([buf], `${fallbackTitle || "image"}-${++n}.${extension}`, { type: image.contentType }));
        const marker = `VAULTIMAGEMARKER${n}X`;
        markers.set(marker, token);
        return { src: marker };
      }),
    },
  );
  // Images become their own paragraphs, then tokens once the HTML is Markdown.
  let html = result.value.replace(/<img[^>]*src="(VAULTIMAGEMARKER\d+X)"[^>]*>/g, "</p><p>$1</p><p>");
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = firstRowAsHeader(html);
  let md = htmlToMarkdown(html);
  for (const [marker, token] of markers) md = md.replace(new RegExp(`^.*${marker}.*$`, "m"), `\n${token}\n`);
  const firstHeading = md.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim();
  return { text: md.replace(/\n{3,}/g, "\n\n").trim(), title: firstHeading?.slice(0, 80) || fallbackTitle };
}

/** Word tables have no header cells; treat each table's first row as its header. */
function firstRowAsHeader(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("table").forEach((table) => {
    const first = table.querySelector("tr");
    if (!first || first.querySelector("th")) return;
    first.querySelectorAll("td").forEach((td) => {
      const th = doc.createElement("th");
      th.innerHTML = td.innerHTML;
      td.replaceWith(th);
    });
  });
  return doc.body.innerHTML;
}

// ---- PDF --------------------------------------------------------------------------
type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  // Served from /vendor (copied on install) so the bundler never touches it.
  const url = "/vendor/pdf.min.mjs";
  pdfjsPromise ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<PdfJs>).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
    return lib;
  });
  return pdfjsPromise;
}

type Line = { text: string; y: number; x: number; endX: number; size: number; mono: boolean; page: number; pageHeight: number };

async function importPdf(file: File, fallbackTitle: string): Promise<ImportResult> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    return await readPdf(doc, fallbackTitle);
  } finally {
    await task.destroy();
  }
}

async function readPdf(doc: import("pdfjs-dist").PDFDocumentProxy, fallbackTitle: string): Promise<ImportResult> {
  const lines: Line[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const { height: pageHeight } = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let cur: Line | null = null;
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      const size = Math.abs(it.transform[3]) || it.height || 10;
      const mono = /mono/i.test(tc.styles[it.fontName]?.fontFamily ?? "") || /mono|courier|consol|menlo/i.test(it.fontName);
      if (cur && Math.abs(cur.y - y) <= size * 0.5) {
        // Same line: add a space where the PDF left a visible gap between runs.
        if (it.str && !cur.text.endsWith(" ") && !it.str.startsWith(" ") && x - cur.endX > size * 0.15) cur.text += " ";
        cur.text += it.str;
        cur.endX = x + (it.width || 0);
        cur.size = Math.max(cur.size, size);
        cur.mono = cur.mono && (mono || !it.str.trim());
      } else {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = { text: it.str, y, x, endX: x + (it.width || 0), size, mono: mono || !it.str.trim(), page: p, pageHeight };
      }
      if (it.hasEOL) {
        if (cur && cur.text.trim()) lines.push(cur);
        cur = null;
      }
    }
    if (cur && cur.text.trim()) lines.push(cur);
  }

  if (!lines.length) {
    return {
      text: "",
      title: fallbackTitle,
      note: "This PDF has no selectable text (it may be a scan). The file is attached so you can still open it.",
    };
  }

  // Drop repeated page headers/footers and bare page numbers.
  const edge = (l: Line) => l.y > l.pageHeight * 0.92 || l.y < l.pageHeight * 0.08;
  const counts = new Map<string, number>();
  lines.filter(edge).forEach((l) => counts.set(l.text.trim(), (counts.get(l.text.trim()) ?? 0) + 1));
  const kept = lines.filter((l) => {
    const t = l.text.trim();
    if (/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(t)) return false;
    return !(edge(l) && doc.numPages >= 3 && (counts.get(t) ?? 0) >= Math.ceil(doc.numPages * 0.5));
  });

  // Body text size = most common size, weighted by characters.
  const weight = new Map<number, number>();
  kept.forEach((l) => weight.set(Math.round(l.size), (weight.get(Math.round(l.size)) ?? 0) + l.text.length));
  const body = [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;

  // Left margin and right edge of normal text, to spot indented list items.
  const bodyLines = kept.filter((l) => Math.round(l.size) === body && !l.mono);
  const mode = (vals: number[]) => {
    const m = new Map<number, number>();
    vals.forEach((v) => m.set(Math.round(v), (m.get(Math.round(v)) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  };
  const leftX = mode(bodyLines.map((l) => l.x));
  const rightX = Math.max(...bodyLines.map((l) => l.endX), 0);
  const indented = (l: Line) => l.x - leftX > body * 1.2;

  const out: string[] = [];
  let para: string[] = [];
  let code: Line[] = [];
  const flushPara = () => {
    if (para.length) out.push(para.join(" ").replace(/\s+/g, " ").trim());
    para = [];
  };
  const flushCode = () => {
    if (!code.length) return;
    const minX = Math.min(...code.map((l) => l.x));
    const charW = body * 0.6;
    const text = code.map((l) => " ".repeat(Math.max(0, Math.round((l.x - minX) / charW))) + l.text.trimEnd()).join("\n");
    out.push("```\n" + text + "\n```");
    code = [];
  };

  let prev: Line | null = null;
  for (const l of kept) {
    const t = l.text.replace(/\s+/g, " ").trim();
    const gap = prev && prev.page === l.page ? prev.y - l.y : Infinity;
    const newBlock = gap > Math.max(prev?.size ?? body, l.size) * 1.65 || (prev && prev.page !== l.page && /[.!?:]$/.test(prev.text.trim()));

    if (l.mono && t) {
      flushPara();
      if (newBlock && code.length && gap > body * 2.5) flushCode();
      code.push(l);
      prev = l;
      continue;
    }
    flushCode();

    const ratio = l.size / body;
    if (ratio >= 1.15 && t.length <= 120 && !/[.,;]$/.test(t)) {
      flushPara();
      const level = ratio >= 1.6 ? 1 : ratio >= 1.3 ? 2 : 3;
      // Headings that wrap over two lines stay one heading.
      const last = out[out.length - 1];
      if (prev && !newBlock && last?.startsWith("#".repeat(level) + " ")) out[out.length - 1] = `${last} ${t}`;
      else out.push(`${"#".repeat(level)} ${t}`);
      prev = l;
      continue;
    }

    const bullet = t.match(/^([•●▪◦‣∙·*–-]|\d{1,3}[.)])\s+(.*)$/);
    if (bullet) {
      flushPara();
      out.push(/^\d/.test(bullet[1]) ? `${bullet[1].replace(")", ".")} ${bullet[2]}` : `- ${bullet[2]}`);
      prev = l;
      continue;
    }
    // Indented short lines with no visible bullet glyph (bullets drawn as shapes).
    if (indented(l) && rightX > 0) {
      const last = out[out.length - 1];
      const prevWasItem = Boolean(last && /^(- |\d+\. )/.test(last) && !para.length);
      const prevFull = prev && prevWasItem && prev.endX > rightX - body * 3;
      if (!(prevWasItem && prevFull && !newBlock)) {
        flushPara();
        out.push(`- ${t}`);
        prev = l;
        continue;
      }
    }
    if (newBlock) flushPara();
    // Continuation of a list item.
    const last = out[out.length - 1];
    if (!para.length && !newBlock && last && /^(- |\d+\. )/.test(last)) {
      out[out.length - 1] = joinWrapped(last, t);
    } else if (para.length) {
      para[para.length - 1] = joinWrapped(para[para.length - 1], t);
    } else {
      para.push(t);
    }
    prev = l;
  }
  flushPara();
  flushCode();

  // Lists: keep items together; everything else separated by blank lines.
  const text = out
    .map((block, i) => {
      const isItem = /^(- |\d+\. )/.test(block);
      const nextItem = /^(- |\d+\. )/.test(out[i + 1] ?? "");
      return block + (isItem && nextItem ? "\n" : "\n\n");
    })
    .join("")
    .trim();

  let title = fallbackTitle;
  try {
    const meta = await doc.getMetadata();
    const t = (meta.info as { Title?: string })?.Title?.trim();
    if (t && t.length > 2 && !/^(untitled|microsoft word|document\d*)/i.test(t)) title = t.slice(0, 80);
  } catch {}
  return { text, title };
}

/** Joins a line that wrapped in the PDF, fixing words hyphenated across lines. */
function joinWrapped(a: string, b: string) {
  if (/[a-z][-\u2010\u00ad]$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}
