import { common, createLowlight } from "lowlight";

export const lowlight = createLowlight(common);

export const LANGUAGES = [
  "plaintext",
  "mermaid",
  ...lowlight.listLanguages().filter((l) => l !== "plaintext"),
].sort((a, b) => (a === "plaintext" ? -1 : b === "plaintext" ? 1 : a.localeCompare(b)));

const CODE_LINE =
  /([{};]\s*$|^\s{2,}\S|^\t|=>|^\s*(def|class|import|from|export|function|const|let|var|return|if|elif|else|for|while|switch|case|try|catch|#include|public|private|protected|package|func|fn|use|SELECT|INSERT|UPDATE|CREATE|<\/?[a-z][\w-]*[\s>]|\$ |@\w+))/i;

/** Best-effort guess whether plain pasted text is source code. */
export function looksLikeCode(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const codeish = lines.filter((l) => CODE_LINE.test(l)).length;
  return codeish / lines.length >= 0.5;
}

/** Best-effort guess whether plain pasted text is Markdown. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes("\n")) return /\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`/.test(text);
  return /^(```|~~~|#{1,6}\s|>\s|\s*[-*+]\s|\s*\d+\.\s|\s*- \[[ x]\]\s|\|.+\|)/m.test(text);
}

export function detectLanguage(code: string): string {
  if (/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/.test(code)) {
    return "mermaid";
  }
  const result = lowlight.highlightAuto(code);
  const lang = result.data?.language;
  return lang && (result.data?.relevance ?? 0) >= 5 ? lang : "plaintext";
}
