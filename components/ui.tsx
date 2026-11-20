import type { SVGProps } from "react";

/** Shared class names so every screen matches the design. */
export const ui = {
  btn: "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-line-strong bg-white px-4 text-[15px] text-ink transition-colors hover:bg-side disabled:opacity-50",
  btnPrimary:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50",
  btnGhost:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] px-3 text-[15px] text-ink-2 transition-colors hover:bg-side disabled:opacity-50",
  input:
    "box-border min-h-11 w-full rounded-[10px] border border-line-strong bg-white px-3 text-[15px] text-ink outline-none placeholder:text-[#8f8b80] focus:border-accent",
  label: "text-[13px] text-muted",
  eyebrow: "text-xs font-semibold uppercase tracking-[0.06em] text-muted",
  pill: "inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] text-accent-ink",
  chip: "inline-flex items-center rounded-full border border-[#d8d3c6] bg-white px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-accent",
};

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...p }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Logo: (p: IconProps) => (
    <svg width={p.size ?? 28} height={p.size ?? 28} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="3" width="20" height="22" rx="3" />
      <path d="M9 9h10M9 14h10M9 19h6" />
    </svg>
  ),
  Plus: (p: IconProps) => <Svg {...p} strokeWidth={2}><path d="M9 3v12M3 9h12" /></Svg>,
  Folder: (p: IconProps) => <Svg {...p}><path d="M2 5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></Svg>,
  Inbox: (p: IconProps) => <Svg {...p}><path d="M2.5 10.5 4.5 4h9l2 6.5V14a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" /><path d="M2.5 10.5h4l1 2h3l1-2h4" /></Svg>,
  Star: (p: IconProps) => <Svg {...p}><path d="m9 2.5 2 4.1 4.5.6-3.3 3.1.8 4.5L9 12.7l-4 2.1.8-4.5-3.3-3.1 4.5-.6z" /></Svg>,
  Chevron: (p: IconProps) => <Svg {...p} strokeWidth={2}><path d="m7 4 5 5-5 5" /></Svg>,
  Back: (p: IconProps) => <Svg {...p} strokeWidth={2}><path d="M11 3 5 9l6 6" /></Svg>,
  Search: (p: IconProps) => <Svg {...p}><circle cx="8" cy="8" r="5" /><path d="m12 12 3.5 3.5" /></Svg>,
  More: (p: IconProps) => <Svg {...p} strokeWidth={2.2}><path d="M4 9h.01M9 9h.01M14 9h.01" /></Svg>,
  Copy: (p: IconProps) => <Svg {...p}><rect x="6" y="6" width="9" height="9" rx="1.5" /><path d="M12 6V4.5A1.5 1.5 0 0 0 10.5 3h-6A1.5 1.5 0 0 0 3 4.5v6A1.5 1.5 0 0 0 4.5 12H6" /></Svg>,
  Link: (p: IconProps) => <Svg {...p}><path d="M7.5 10.5l3-3M6.5 8 5 9.5a2.5 2.5 0 0 0 3.5 3.5L10 11.5M11.5 10 13 8.5A2.5 2.5 0 0 0 9.5 5L8 6.5" /></Svg>,
  Image: (p: IconProps) => <Svg {...p}><rect x="2.5" y="3.5" width="13" height="11" rx="1.5" /><circle cx="6.5" cy="7.5" r="1.3" /><path d="m2.5 12.5 3.8-3.3 3 2.5 2.2-1.8 4 3.1" /></Svg>,
  File: (p: IconProps) => <Svg {...p}><path d="M10 2.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-8z" /><path d="M10 2.5v4h4" /></Svg>,
  Menu: (p: IconProps) => <Svg {...p} strokeWidth={2}><path d="M3 5h12M3 9h12M3 13h12" /></Svg>,
  Close: (p: IconProps) => <Svg {...p} strokeWidth={2}><path d="m4.5 4.5 9 9M13.5 4.5l-9 9" /></Svg>,
  Trash: (p: IconProps) => <Svg {...p}><path d="M3 5h12M7 5V3.5h4V5M5 5l.7 9.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L13 5" /></Svg>,
  Pencil: (p: IconProps) => <Svg {...p}><path d="m11.5 3.5 3 3L6 15H3v-3z" /></Svg>,
  Download: (p: IconProps) => <Svg {...p}><path d="M9 3v8m0 0 3.5-3.5M9 11 5.5 7.5M3 14.5h12" /></Svg>,
  Sparkle: (p: IconProps) => <Svg {...p}><path d="M9 2.5v3M9 12.5v3M2.5 9h3M12.5 9h3M4.4 4.4l2 2M11.6 11.6l2 2M4.4 13.6l2-2M11.6 6.4l2-2" /></Svg>,
};
