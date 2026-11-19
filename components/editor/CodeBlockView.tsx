"use client";

import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useId, useState } from "react";
import { LANGUAGES } from "./lowlight";

export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const language: string = node.attrs.language || "plaintext";
  const code = node.textContent;
  const [copied, setCopied] = useState(false);
  const isMermaid = language === "mermaid";

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <NodeViewWrapper className="code-block not-prose my-4 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
      <div
        contentEditable={false}
        className="flex items-center justify-between border-b border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 dark:border-zinc-800"
      >
        <select
          value={LANGUAGES.includes(language) ? language : "plaintext"}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          disabled={!editor.isEditable}
          className="rounded bg-transparent py-0.5 font-mono outline-none hover:bg-zinc-200 dark:hover:bg-zinc-800"
          aria-label="Code language"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-800"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre className="hljs overflow-x-auto px-4 py-3 font-mono text-sm leading-relaxed">
        <NodeViewContent<"code"> as="code" />
      </pre>
      {isMermaid && <MermaidPreview code={code} />}
    </NodeViewWrapper>
  );
}

function MermaidPreview({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!code.trim()) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: dark ? "dark" : "default",
        });
        const { svg } = await mermaid.render(`mmd-${id}-${Date.now()}`, code);
        if (!cancelled) {
          setSvg(svg);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message.split("\n")[0] : "Invalid diagram");
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code, id]);

  return (
    <div
      contentEditable={false}
      className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
    >
      {!code.trim() ? (
        <p className="text-xs text-zinc-500">Write Mermaid code above to see the diagram.</p>
      ) : error ? (
        <p className="text-xs text-red-600">Diagram error: {error}</p>
      ) : (
        <div
          className="mermaid-diagram overflow-x-auto text-center [&_svg]:mx-auto [&_svg]:inline-block [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}
    </div>
  );
}
