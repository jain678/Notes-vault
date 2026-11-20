"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useId, useState } from "react";
import { useEditing } from "./editing";
import { LANGUAGES, prettyLang } from "./lowlight";

function CopyButton({ text, dark }: { text: string; dark: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      contentEditable={false}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className={`min-h-11 rounded-md px-3 text-[13px] ${dark ? "text-code-ink hover:bg-white/10" : "text-log-ink hover:bg-black/5"}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const editing = useEditing();
  const language: string = node.attrs.language || "plaintext";
  const code = node.textContent;
  const [showSource, setShowSource] = useState(false);

  if (language === "mermaid") {
    const sourceVisible = editing || showSource;
    return (
      <NodeViewWrapper as="figure" className="vault-figure not-prose m-0 flex flex-col gap-2.5 font-sans">
        <div className={sourceVisible ? "overflow-hidden rounded-xl bg-code" : "hidden"}>
          <Header language={language} editing={editing} onLang={(l) => updateAttributes({ language: l })} code={code} />
          <pre className="hljs m-0 overflow-x-auto px-5 py-4 font-mono text-sm leading-[1.65]">
            <NodeViewContent<"code"> as="code" />
          </pre>
        </div>
        <div contentEditable={false} className="overflow-x-auto rounded-xl border border-line bg-white p-6">
          <MermaidPreview code={code} />
        </div>
        <figcaption contentEditable={false} className="text-sm leading-normal text-muted">
          <span className="fig-num" /> Diagram, drawn from Mermaid.{" "}
          {!editing && (
            <button type="button" onClick={() => setShowSource((v) => !v)} className="text-accent underline underline-offset-2 hover:text-accent-hover">
              {showSource ? "Hide source" : "View source"}
            </button>
          )}
        </figcaption>
      </NodeViewWrapper>
    );
  }

  if (language === "log") {
    return (
      <NodeViewWrapper className="code-block not-prose overflow-hidden rounded-xl bg-log font-sans">
        <div contentEditable={false} className="flex min-h-11 items-center justify-between pl-4 pr-1 text-[13px] text-log-ink/80">
          {editing ? <LangSelect language={language} onLang={(l) => updateAttributes({ language: l })} dark={false} /> : <span>Log</span>}
          <CopyButton text={code} dark={false} />
        </div>
        <pre className="m-0 overflow-x-auto px-5 pb-4 font-mono text-[13.5px] leading-[1.6] text-log-ink">
          <NodeViewContent<"code"> as="code" />
        </pre>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="code-block not-prose overflow-hidden rounded-xl bg-code font-sans">
      <Header language={language} editing={editing} onLang={(l) => updateAttributes({ language: l })} code={code} />
      <pre className="hljs m-0 overflow-x-auto px-5 py-4 font-mono text-sm leading-[1.65]">
        <NodeViewContent<"code"> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

function Header({ language, editing, onLang, code }: { language: string; editing: boolean; onLang: (l: string) => void; code: string }) {
  return (
    <div contentEditable={false} className="flex min-h-11 items-center justify-between bg-code-head pl-4 pr-1 text-[13px] text-code-muted">
      {editing ? <LangSelect language={language} onLang={onLang} dark /> : <span>{language === "plaintext" ? "Text" : prettyLang(language)}</span>}
      <CopyButton text={code} dark />
    </div>
  );
}

function LangSelect({ language, onLang, dark }: { language: string; onLang: (l: string) => void; dark: boolean }) {
  return (
    <select
      value={LANGUAGES.includes(language) ? language : "plaintext"}
      onChange={(e) => onLang(e.target.value)}
      aria-label="Code language"
      className={`min-h-9 rounded-md bg-transparent px-1 text-[13px] outline-none ${dark ? "text-code-muted hover:bg-white/10 [&>option]:text-ink" : "text-log-ink hover:bg-black/5"}`}
    >
      {LANGUAGES.map((l) => (
        <option key={l} value={l}>
          {l === "plaintext" ? "Text" : prettyLang(l)}
        </option>
      ))}
    </select>
  );
}

export function MermaidPreview({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "Inter Variable, system-ui, sans-serif",
          themeVariables: {
            primaryColor: "#F2EFE8",
            primaryBorderColor: "#CFCABD",
            primaryTextColor: "#1F1E1B",
            lineColor: "#6B6A65",
            secondaryColor: "#E3EEE9",
            tertiaryColor: "#FAF8F4",
            fontSize: "14px",
          },
        });
        const { svg } = await mermaid.render(`mmd-${id}-${Date.now()}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message.split("\n")[0] : "Invalid diagram");
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id]);

  if (!code.trim()) return <p className="m-0 text-sm text-muted">Write Mermaid code to draw a diagram.</p>;
  if (error) return <p className="m-0 text-sm text-log-ink">Diagram error: {error}</p>;
  return (
    <div
      className="mermaid-diagram text-center [&_svg]:mx-auto [&_svg]:inline-block [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
