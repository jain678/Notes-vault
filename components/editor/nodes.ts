import { mergeAttributes, Node } from "@tiptap/core";
import Image from "@tiptap/extension-image";

/**
 * Image that can point at a file in the private bucket (`path`) or an external
 * URL (`src`). `title` doubles as the figure caption.
 */
export const StoredImageBase = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-path"),
        renderHTML: (attrs) => (attrs.path ? { "data-path": attrs.path } : {}),
      },
    };
  },
  renderMarkdown(node) {
    const alt = node.attrs?.title || node.attrs?.alt || "";
    const src = node.attrs?.path ? `vault:${node.attrs.path}` : (node.attrs?.src ?? "");
    return `![${alt}](${src})`;
  },
}).configure({ inline: false, allowBase64: false });

/** A non-image file stored in the private bucket. */
export const FileAttachmentBase = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      path: { default: null },
      name: { default: "file" },
      size: { default: 0 },
      mime: { default: "application/octet-stream" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-file-attachment]",
        getAttrs: (el) => ({
          path: el.getAttribute("data-path"),
          name: el.getAttribute("data-name"),
          size: Number(el.getAttribute("data-size") ?? 0),
          mime: el.getAttribute("data-mime"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-file-attachment": "",
        "data-path": node.attrs.path,
        "data-name": node.attrs.name,
        "data-size": node.attrs.size,
        "data-mime": node.attrs.mime,
      }),
      node.attrs.name,
    ];
  },

  renderMarkdown(node) {
    return `[📎 ${node.attrs?.name}](vault:${node.attrs?.path})`;
  },
});

/** A link pasted on its own line, shown as a card. */
export const LinkCard = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return { href: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "a[data-link-card]", getAttrs: (el) => ({ href: el.getAttribute("href") }) }];
  },

  renderHTML({ node }) {
    const href: string = node.attrs.href;
    let host = href;
    let rest = "";
    try {
      const u = new URL(href);
      host = u.host.replace(/^www\./, "");
      rest = (u.pathname + u.search).replace(/\/$/, "");
    } catch {}
    return [
      "a",
      { href, "data-link-card": "", target: "_blank", rel: "noopener noreferrer", class: "link-card" },
      [
        "svg",
        { width: "20", height: "20", viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "aria-hidden": "true" },
        ["path", { d: "M7.5 10.5l3-3M6.5 8 5 9.5a2.5 2.5 0 0 0 3.5 3.5L10 11.5M11.5 10 13 8.5A2.5 2.5 0 0 0 9.5 5L8 6.5" }],
      ],
      ["span", { class: "link-card-text" }, ["span", { class: "link-card-host" }, host], ["span", { class: "link-card-url" }, rest || href]],
    ];
  },

  renderMarkdown(node) {
    return `<${node.attrs?.href}>`;
  },
});
