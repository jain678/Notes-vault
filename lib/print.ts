"use client";

/**
 * PDF export via the browser's own "Save as PDF".
 * Content is snapshotted once everything (images, diagrams) has rendered, then
 * laid out into real pages by Paged.js inside a hidden iframe: page numbers,
 * running chapter headers, and a table of contents with page numbers.
 */

// Note: Paged.js can't parse :is()/:where() here; keep selectors plain.
const PRINT_CSS = `
@page {
  size: A4;
  margin: 22mm 20mm 24mm;
  @bottom-center { content: counter(page); font-family: "Inter Variable", sans-serif; font-size: 9pt; color: #5E5B53; }
  @top-left { content: string(booktitle); font-family: "Inter Variable", sans-serif; font-size: 8.5pt; color: #8a867c; }
  @top-right { content: string(chapter); font-family: "Inter Variable", sans-serif; font-size: 8.5pt; color: #8a867c; }
}
@page :first {
  @bottom-center { content: none; }
  @top-left { content: none; }
  @top-right { content: none; }
}
@page cover {
  @bottom-center { content: none; }
  @top-left { content: none; }
  @top-right { content: none; }
}

html, body { background: #fff; }
body { margin: 0; color: #1F1E1B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
[data-print-hide], .code-block button, figcaption button, select { display: none !important; }

.print-root .book-title { string-set: booktitle content(text); }
.print-root .chapter-title { string-set: chapter content(text); }

/* Book structure */
.print-root .book-sheet { border: 0 !important; box-shadow: none !important; border-radius: 0 !important; padding: 0 !important; background: none !important; }
.print-root .cover { page: cover; break-after: page; min-height: 225mm !important; display: flex; flex-direction: column; justify-content: center; gap: 8mm; }
.print-root .cover .book-title { font-size: 36pt !important; }
.print-root .toc { break-after: page; }
.print-root .toc h2 { font-size: 22pt !important; margin-bottom: 10mm !important; }
.print-root .toc ol { gap: 4mm !important; font-size: 12pt !important; }
.print-root .toc a { display: flex; color: #1F1E1B; text-decoration: none; }
.print-root .toc a::after { content: target-counter(attr(href), page); margin-left: auto; padding-left: 6mm; color: #5E5B53; font-family: "Inter Variable", sans-serif; font-size: 10pt; }
.print-root .toc .toc-page-hint { display: none; }
.print-root .chapter { break-before: page; }
.print-root .chapter .chapter-title { font-size: 26pt !important; }

/* Reading typography, scaled for paper */
.print-root .vault-doc { font-size: 11.5pt; line-height: 1.6; }
.print-root .vault-doc > * + * { margin-top: 3.5mm; }
.print-root .vault-doc h1 { font-size: 20pt; }
.print-root .vault-doc h2 { font-size: 16pt; }
.print-root .vault-doc h3 { font-size: 13pt; }
.print-root .vault-doc > h1, .print-root .vault-doc > h2, .print-root .vault-doc > h3, .print-root .vault-doc > h4 { margin-top: 7mm; break-after: avoid; }
.print-root .vault-doc > h1:first-child, .print-root .vault-doc > h2:first-child, .print-root .vault-doc > h3:first-child { margin-top: 0; }
.print-root .vault-doc pre, .print-root .vault-doc figure, .print-root .vault-doc table, .print-root .vault-doc img,
.print-root .vault-doc .code-block, .print-root .vault-doc .link-card, .print-root .vault-doc blockquote { break-inside: avoid; }
.print-root .vault-doc pre { white-space: pre-wrap; word-break: break-word; overflow: visible; font-size: 9pt; }
.print-root .vault-doc .tableWrapper { overflow: visible; }
.print-root .vault-doc img { max-height: 160mm; }
.print-root .vault-doc .link-card .link-card-url { white-space: normal; }
.print-root .note-title { font-family: "Newsreader Variable", Georgia, serif; font-size: 26pt; line-height: 1.15; font-weight: 600; margin: 0 0 3mm; }
.print-root .note-meta { font-family: "Inter Variable", sans-serif; font-size: 9.5pt; color: #5E5B53; margin-bottom: 8mm; }
`;

/** Resolves once images have loaded and diagrams have drawn (or the timeout passes). */
export async function waitForRender(root: HTMLElement, timeoutMs = 12000): Promise<void> {
  const start = Date.now();
  const ready = () => {
    if (root.querySelector(".animate-pulse")) return false;
    const imgs = Array.from(root.querySelectorAll("img"));
    if (imgs.some((i) => !i.complete)) return false;
    const diagrams = root.querySelectorAll("[data-mermaid]").length;
    const drawn = root.querySelectorAll("[data-mermaid-ready]").length;
    return drawn >= diagrams;
  };
  while (!ready() && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 120));
  await new Promise((r) => setTimeout(r, 150));
}

/** A static copy of rendered content, without editing or screen-only chrome. */
export function snapshot(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-print-hide]").forEach((el) => el.remove());
  clone.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"));
  clone.querySelectorAll(".ProseMirror-trailingBreak").forEach((el) => el.remove());
  return clone.outerHTML;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Lays the HTML out into pages and opens the print dialog ("Save as PDF").
 * `title` becomes the suggested file name.
 */
export function printHtml(bodyHtml: string, title: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // App styles are kept as-is (Paged.js ignores them); only PRINT_CSS is paginated.
    const appStyles = Array.from(document.querySelectorAll<HTMLLinkElement | HTMLStyleElement>("link[rel='stylesheet'], style"))
      .map((el) => {
        const copy = el.cloneNode(true) as HTMLElement;
        copy.setAttribute("data-pagedjs-ignore", "");
        if (copy instanceof HTMLLinkElement) copy.href = (el as HTMLLinkElement).href;
        return copy.outerHTML;
      })
      .join("\n");

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    Object.assign(iframe.style, { position: "fixed", left: "-10000px", top: "0", width: "900px", height: "1200px", border: "0" });

    // The suggested PDF file name comes from the page title.
    const previousTitle = document.title;
    document.title = title;
    const cleanup = () =>
      setTimeout(() => {
        iframe.remove();
        document.title = previousTitle;
      }, 1000);
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Preparing the PDF took too long."));
    }, 60000);

    (window as unknown as { __vaultPrintDone?: (err?: string) => void }).__vaultPrintDone = (err) => {
      clearTimeout(timeout);
      if (err) {
        cleanup();
        reject(new Error(err));
        return;
      }
      const w = iframe.contentWindow!;
      w.addEventListener("afterprint", cleanup, { once: true });
      w.focus();
      w.print();
      resolve();
    };

    iframe.srcdoc = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<base href="${esc(location.origin)}/">
${appStyles}
<style>${PRINT_CSS}</style>
<script>
window.PagedConfig = {
  auto: true,
  after: function () { parent.__vaultPrintDone && parent.__vaultPrintDone(); }
};
window.addEventListener("error", function (e) { parent.__vaultPrintDone && parent.__vaultPrintDone("PDF layout failed: " + e.message); });
</script>
<script src="/vendor/paged.polyfill.min.js"></script>
</head><body><div class="print-root">${bodyHtml}</div></body></html>`;
    document.body.appendChild(iframe);
  });
}
