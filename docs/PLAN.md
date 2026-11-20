# Notes Vault — Implementation Plan

> Status: **v1 implemented.** Decisions are recorded in section 10. Setup steps are in the README.

## 1. Goal

A personal "notes dump": open the site, paste or type anything (text, code,
images, diagrams, links, tables), and it's saved and shown in a clean,
readable layout. Each user only ever sees their own notes, and notes persist
across devices and sessions.

### In scope (v1)
- Sign up / log in / log out (per-user data isolation).
- Create, view, edit, delete notes. Unlimited notes per user.
- One editor that handles pasting of:
  - Plain and rich text (formatting from web pages/Docs keeps headings, lists, links, tables).
  - Code (fenced code blocks with syntax highlighting + language detection).
  - Images (paste from clipboard, drag & drop, or upload button).
  - Diagrams (Mermaid code rendered as a diagram; images of diagrams work as images).
  - Any other file (PDF, zip, etc.) stored as a downloadable attachment.
- Autosave while typing (no "Save" button needed).
- Notes list with title, preview snippet, last-edited time; full-text search; tags; pin.
- Responsive layout (desktop + mobile), light/dark mode.

### Out of scope for v1 (possible later)
- Sharing notes with other users / public links.
- Real-time collaboration, offline mode, version history.
- AI auto-structuring/summarising of pasted content (easy add-on later).
- Folders/nesting (tags cover this for v1).

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | One codebase for UI + server; first-class Supabase support; deploys free on Vercel. |
| Styling | **Tailwind CSS + shadcn/ui** | Clean, readable defaults quickly. |
| Editor | **Tiptap** (ProseMirror) | Block-style editor with great paste handling (HTML → structured blocks), code blocks, images, tables, task lists, extensible for Mermaid. |
| Code highlighting | lowlight (highlight.js) via Tiptap | Auto language detection for pasted code. |
| Diagrams | **Mermaid** custom Tiptap node | Write/paste `mermaid` code → live diagram. |
| Auth | **Supabase Auth** | Email + password. |
| Database | **Supabase Postgres** with **Row Level Security** | Isolation enforced in the database, not just the UI. |
| File storage | **Supabase Storage** (private bucket) | Images/attachments, served via short-lived signed URLs. |
| Hosting | TBD (Vercel likely) | Decided later. |

## 3. How content is stored ("well-structured")

Each note is stored as **Tiptap JSON** (a structured document tree: headings,
paragraphs, code blocks with language, images, tables, mermaid blocks, …) rather
than a raw blob of HTML. That means:
- Rendering is always consistent and clean, regardless of where content was pasted from.
- Pasted HTML is sanitised into known block types (no stray styles/scripts).
- We also store a **plain-text copy** for search and list previews.
- Notes can be exported to Markdown later without data loss.

Binary content (images, files) is never stored in the DB — it's uploaded to
Storage and the note references it by path.

### Paste behaviour
| You paste… | It becomes… |
|---|---|
| Text from a web page / Google Docs | Headings, lists, links, tables preserved; styling normalised |
| Code (from IDE, or text that looks like code) | Code block with detected language + copy button |
| ```` ```mermaid ```` block | Rendered diagram (click to edit source) |
| Screenshot / image | Uploaded to Storage, inline image |
| Any other file | Uploaded, shown as an attachment chip (name, size, download) |
| A bare URL | Clickable link |

Title: first line / first heading is used automatically unless you set one.

## 4. Data model (Supabase)

```sql
-- notes
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null default '',
  content      jsonb not null default '{}'::jsonb,   -- Tiptap document
  content_text text not null default '',             -- plain text for search/preview
  tags         text[] not null default '{}',
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content_text,''))
               ) stored
);
create index on public.notes (user_id, pinned desc, updated_at desc);
create index on public.notes using gin (search);
create index on public.notes using gin (tags);

-- attachments (images + files referenced by notes)
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id      uuid references public.notes(id) on delete cascade,
  storage_path text not null,          -- "<user_id>/<note_id>/<uuid>-<filename>"
  mime_type    text not null,
  size_bytes   bigint not null,
  created_at   timestamptz not null default now()
);
```
Plus an `updated_at` trigger on `notes`.

### Security (the "one user can't see another's notes" part)
- **RLS enabled** on `notes` and `attachments` with policies
  `using (user_id = auth.uid()) with check (user_id = auth.uid())` for
  select/insert/update/delete. Even a hand-crafted API call with a valid login
  can only touch its own rows.
- **Storage bucket `note-assets` is private.** Policies on `storage.objects`
  only allow access when the first folder of the path equals the caller's
  user id: `(storage.foldername(name))[1] = auth.uid()::text`.
- Images are displayed through **signed URLs** (short expiry, refreshed by the app),
  so a leaked link stops working.
- Only the public **anon/publishable key** is used in the app. The
  service-role key is never shipped to the browser (and isn't needed at all for v1).
- Pasted HTML is sanitised by the editor schema; Mermaid runs in `strict` security mode.
- Upload size limit (proposed 25 MB/file) enforced by bucket config.

All SQL lives in `supabase/migrations/` so it's versioned and reproducible.

## 5. Login flow

1. `/login` — email + password (sign in / sign up tabs). Sign-up is open to anyone.
   (Next.js 16 renamed `middleware.ts` to `proxy.ts`; the session refresh lives there.)
2. Sign-up sends a confirmation email (Supabase default); confirmed users land on `/notes`.
3. Sessions are stored in secure cookies via `@supabase/ssr`; the Next.js proxy
   refreshes the session and redirects logged-out users from `/notes/*` to `/login`.
4. "Forgot password" → Supabase reset email → `/reset-password`.
5. Log out from the user menu.

## 6. Pages / UX

```
/login              Auth
/notes              Sidebar: search, tag filter, pinned + recent notes. Main: "New note" / empty state
/notes/[id]         Editor (autosave, "Saved ✓" indicator), tags, pin, delete, export .md
```
- Big "＋ New note" / `Ctrl+N`; pasting on the empty `/notes` page instantly creates a new note with that content ("dump mode").
- Readable typography (max line width, good spacing), code blocks with copy button, images click-to-zoom.
- Autosave: debounced (~1s) writes; optimistic UI.
- Pagination/infinite scroll in the list so thousands of notes stay fast.

## 7. Project structure

```
app/
  (auth)/login/page.tsx
  (auth)/auth/callback/route.ts      # email confirmation / password reset
  notes/layout.tsx                    # sidebar
  notes/page.tsx
  notes/[id]/page.tsx
components/editor/                    # Tiptap setup, extensions (mermaid, file, image upload)
components/notes/                     # list, search, tags
lib/supabase/{client,server,proxy}.ts
lib/notes.ts                          # data access
proxy.ts
supabase/migrations/0001_init.sql
.env.example                          # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## 8. Milestones

1. **Scaffold** — Next.js + Tailwind + shadcn, Supabase clients, `.env.example`, lint/format.
2. **Database** — migration with tables, RLS, storage bucket + policies.
3. **Auth** — login/sign-up/reset, route protection in the proxy.
4. **Notes CRUD** — list, create, open, autosave, delete.
5. **Rich editor** — paste handling, code blocks, tables, images (upload to Storage), attachments, Mermaid.
6. **Search, tags, pin**, export to Markdown.
7. **Polish** — responsive, dark mode, empty states, error toasts.
8. **Verify** — automated test that user A cannot read/write user B's notes or files (RLS test), Playwright smoke test of login → paste → reload → content persists.
9. **Deploy** — hosting decided later; add its URL to Supabase auth redirect URLs.

## 9. What I need from you

**Required**
1. **Supabase project URL** and **anon (publishable) key** — safe to be public;
   I'll put them in `.env.local` (not committed) and `.env.example` will show the names only.
2. **How to apply the database migration** — pick one:
   - (a) I write `supabase/migrations/0001_init.sql` and you paste it into the Supabase **SQL Editor** (simplest, no secrets shared), **or**
   - (b) you give me a **Supabase personal access token** + project ref so I can run `supabase db push` myself (I'll request it via the secure credential form, never in chat).
3. Network access from this cloud session to your `<project-ref>.supabase.co` host if you want me to test against the real project (I'll prompt for approval when needed).

**Please do NOT share** the `service_role` key or DB password in chat — v1 doesn't need them.

**In the Supabase dashboard (I'll give exact steps when we get there)**
- Auth → URL configuration: add `http://localhost:3000` and the production URL as redirect URLs.

## 10. Decisions

| Question | Decision |
|---|---|
| Login methods | Email + password only |
| Sign-ups | Open to anyone (email confirmation per Supabase settings) |
| Editor | Notion-style rich block editor (Tiptap) |
| Hosting | Decide later |
| Diagrams | Mermaid + images; no hand-drawn whiteboard |
| File limit | 25 MB per file |
| Organisation | Tags (no folders) |
| Out-of-scope items | Stay out of scope for v1 |

## 11. v2: design refresh and paste-to-structure

Built from the "Notes Vault" design canvas (reading view + New note screen).

- Look: warm paper palette, teal accent, Newsreader (reading), Inter (UI), JetBrains Mono (code); fonts are bundled.
- Sidebar: New note, search, collections with nested notes, Unsorted, pinned, tag filters.
- New note screen: paste box on the left, "What the vault found" on the right. `lib/structure.ts` splits the paste
  at blank lines and fences, labels each block (text, heading, list, table, code + language, Mermaid, log, link,
  image, file, plain) with a reason, lets the user change the type, then builds the note. Nothing is dropped:
  unknown content stays as plain text, and the original paste can be stored (`notes.raw_paste`).
- Note page: reading view by default (breadcrumb, Edit, Export, More: pin / original paste / delete; title, date,
  reading time, tags; outline of headings), Edit switches to the rich editor in place.
- Schema: `0003_collections.sql` adds `collections` (RLS, owner only), `notes.collection_id` (own collections
  only), `notes.raw_paste`, and a stored `notes.preview` for fast lists.
- Not included: AI rewriting of pasted text (the design's cleaned-up sentence); dark mode (the design is light only).
