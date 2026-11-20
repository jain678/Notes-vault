"use client";

import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useState } from "react";
import { MermaidPreview } from "@/components/editor/CodeBlockView";
import { lowlight, LANGUAGES, prettyLang, detectLanguage } from "@/components/editor/lowlight";
import { Icon } from "@/components/ui";
import { formatBytes, getSignedUrl } from "@/lib/notes";
import { KIND_LABEL, kindOptions, textBlockMarkdown, type Block, type BlockKind, type UploadedFile } from "@/lib/structure";

type HastNode = { type: string; value?: string; tagName?: string; properties?: { className?: string[] }; children?: HastNode[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function hastToHtml(n: HastNode): string {
  if (n.type === "text") return esc(n.value ?? "");
  const inner = (n.children ?? []).map(hastToHtml).join("");
  if (n.type === "element") {
    const cls = n.properties?.className?.join(" ");
    return `<span${cls ? ` class="${esc(cls)}"` : ""}>${inner}</span>`;
  }
  return inner;
}

function highlight(code: string, lang?: string) {
  try {
    const tree = lang && lowlight.registered(lang) ? lowlight.highlight(lang, code) : lowlight.highlightAuto(code);
    return hastToHtml(tree as unknown as HastNode);
  } catch {
    return esc(code);
  }
}

export function badgeFor(b: Block): string {
  if (b.kind === "code") return `Code · ${prettyLang(b.lang || detectLanguage(b.raw))}`;
  if (b.kind === "diagram") return "Diagram · Mermaid";
  if (b.kind === "text" && b.shape === "list") return "List";
  if (b.kind === "text" && (b.shape === "table" || b.shape === "tsv")) return "Table";
  return KIND_LABEL[b.kind];
}

export function BlockCard({
  block,
  index,
  file,
  uploading,
  onKind,
  onLang,
}: {
  block: Block;
  index: number;
  file?: UploadedFile;
  uploading: boolean;
  onKind: (k: BlockKind) => void;
  onLang: (l: string) => void;
}) {
  const changed = block.kind !== block.detected;
  return (
    <div className="flex flex-col gap-2" data-block-kind={block.kind}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-ink" data-testid="block-badge">
            {badgeFor(block)}
          </span>
          <span className="text-[13px] text-muted">{changed ? `Changed from ${KIND_LABEL[block.detected]}` : block.reason}</span>
        </span>
        <span className="flex items-center gap-2">
          {block.kind === "code" && (
            <select
              aria-label={`Language of block ${index + 1}`}
              value={block.lang && LANGUAGES.includes(block.lang) ? block.lang : detectLanguage(block.raw)}
              onChange={(e) => onLang(e.target.value)}
              className="min-h-11 rounded-[10px] border border-line-strong bg-white px-2 text-[13px] text-ink"
            >
              {LANGUAGES.filter((l) => l !== "mermaid" && l !== "log").map((l) => (
                <option key={l} value={l}>
                  {l === "plaintext" ? "Text" : prettyLang(l)}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label={`Change type of block ${index + 1}`}
            value={block.kind}
            onChange={(e) => onKind(e.target.value as BlockKind)}
            className="min-h-11 rounded-[10px] border border-line-strong bg-white px-2.5 text-[13px] text-ink"
          >
            {kindOptions(block).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </span>
      </div>
      {block.label && <div className="text-[13px] text-muted">{block.label}</div>}
      <Preview block={block} file={file} uploading={uploading} />
    </div>
  );
}

function Preview({ block: b, file, uploading }: { block: Block; file?: UploadedFile; uploading: boolean }) {
  const html = useMemo(() => {
    if (b.kind !== "text") return "";
    return DOMPurify.sanitize(marked.parse(textBlockMarkdown(b), { async: false, gfm: true, breaks: false }) as string);
  }, [b]);

  switch (b.kind) {
    case "text":
      return <div className="md-preview font-serif text-[17px] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
    case "heading":
      return <p className="m-0 font-serif text-[22px] font-semibold leading-snug">{b.raw.replace(/^#{1,6}\s+/, "").replace(/:$/, "")}</p>;
    case "code":
      return (
        <pre
          className="hljs m-0 overflow-x-auto rounded-[10px] bg-code px-4 py-3 font-mono text-[13px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlight(b.raw, b.lang) }}
        />
      );
    case "diagram":
      return (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-paper p-4">
          <MermaidPreview code={b.raw} />
        </div>
      );
    case "log":
      return <pre className="m-0 overflow-x-auto rounded-[10px] bg-log px-4 py-3 font-mono text-[13px] leading-relaxed text-log-ink">{b.raw}</pre>;
    case "plain":
      return <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-[10px] border border-line bg-paper px-4 py-3 font-mono text-[13px] leading-relaxed">{b.raw}</pre>;
    case "link": {
      const url = b.raw.trim().split(/\s+/)[0];
      let host = url;
      try {
        const u = new URL(url);
        host = u.host + (u.pathname !== "/" ? u.pathname : "");
      } catch {}
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-[10px] border border-line px-4 py-3 text-ink no-underline hover:border-accent">
          <span className="text-accent">
            <Icon.Link size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{host}</span>
            <span className="text-[13px] text-muted">Saved as a link</span>
          </span>
        </a>
      );
    }
    case "image":
      return <ImageThumb path={file?.path} src={b.src} name={b.raw} uploading={uploading} />;
    case "file":
      return (
        <div className="flex items-center gap-3 rounded-[10px] border border-line bg-white px-4 py-3">
          <span className="text-accent">
            <Icon.File size={20} />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{file?.name ?? b.raw}</span>
            <span className="text-[13px] text-muted">{uploading ? "Uploading…" : file ? formatBytes(file.size) : "Upload failed"}</span>
          </span>
        </div>
      );
  }
}

function ImageThumb({ path, src, name, uploading }: { path?: string; src?: string; name: string; uploading: boolean }) {
  const [url, setUrl] = useState<string | null>(src ?? null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    getSignedUrl(path).then((u) => alive && setUrl(u)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);
  if (uploading || !url)
    return (
      <div className="flex h-28 items-center justify-center rounded-[10px] bg-placeholder text-sm text-muted">
        {uploading ? "Uploading…" : name}
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={name} className="max-h-60 max-w-full rounded-[10px] object-contain" />;
}
