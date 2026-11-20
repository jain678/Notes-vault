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

const AUTO_SUBSET = [
  "python", "javascript", "typescript", "java", "go", "rust", "c", "cpp", "csharp", "ruby", "php",
  "bash", "shell", "sql", "json", "yaml", "xml", "css", "scss", "kotlin", "swift", "markdown", "diff", "ini",
];

/** Strong, cheap signals checked before statistical detection. */
const HINTS: [RegExp, string][] = [
  [/^\s*(def|class)\s+\w+.*:\s*$|^\s*(from\s+[\w.]+\s+)?import\s+[\w., ]+$|^\s*(elif|except|with)\b.*:\s*$|\bself\.\w+|print\(f?["']/m, "python"],
  [/^\s*(interface|type)\s+\w+\s*(=|\{)|:\s*(string|number|boolean)\b|\bas const\b/m, "typescript"],
  [/^\s*(const|let|var)\s+\w+\s*=|=>|console\.log\(|\bfunction\s+\w*\(|require\(|^\s*export\s+(default|const|function)/m, "javascript"],
  [/^\s*package\s+\w+\s*$|^\s*func\s+\w+\(|:=\s/m, "go"],
  [/^\s*fn\s+\w+\(|\blet\s+mut\b|println!\(/m, "rust"],
  [/^\s*(public|private|protected)\s+(static\s+)?(class|void|[\w<>]+\s+\w+\()/m, "java"],
  [/^\s*#include\s*[<"]/m, "cpp"],
  [/^\s*(SELECT|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+(TABLE|INDEX)|ALTER\s+TABLE|DELETE\s+FROM)\b/im, "sql"],
  [/^\s*(\$\s+)?(sudo|npm|npx|yarn|pnpm|git|cd|ls|curl|docker|kubectl|brew|pip|apt(-get)?)\s/m, "bash"],
  [/^\s*<\?php/m, "php"],
  [/^\s*<\/?[a-z][\w-]*[\s>]/m, "xml"],
  [/^\s*[\w-]+:\s+\S.*$\n^\s*[\w-]+:\s/m, "yaml"],
];

export function detectLanguage(code: string): string {
  if (/^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|mindmap|timeline|gitGraph)\b/.test(code)) {
    return "mermaid";
  }
  const trimmed = code.trim();
  if (/^[\[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {}
  }
  for (const [re, lang] of HINTS) if (re.test(code)) return lang;
  const result = lowlight.highlightAuto(code, { subset: AUTO_SUBSET.filter((l) => lowlight.registered(l)) });
  const lang = result.data?.language;
  return lang && (result.data?.relevance ?? 0) >= 5 ? lang : "plaintext";
}

// Logs and stack traces: shown verbatim, no syntax colouring.
lowlight.register({ log: () => ({ name: "Log", contains: [] }) });
if (!LANGUAGES.includes("log")) LANGUAGES.splice(2, 0, "log");

export function prettyLang(lang?: string) {
  const map: Record<string, string> = {
    javascript: "JavaScript", typescript: "TypeScript", python: "Python", bash: "Shell", shell: "Shell",
    json: "JSON", sql: "SQL", xml: "HTML/XML", css: "CSS", cpp: "C++", csharp: "C#", go: "Go",
    java: "Java", ruby: "Ruby", rust: "Rust", php: "PHP", yaml: "YAML", markdown: "Markdown",
    kotlin: "Kotlin", swift: "Swift", plaintext: "Plain", mermaid: "Mermaid", log: "Log",
  };
  return lang ? (map[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1)) : "";
}

