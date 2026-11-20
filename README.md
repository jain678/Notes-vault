# Notes Vault

A simple notes dumping platform which organizes notes in a more readable and well-structured format.

Paste or type anything (text, Markdown, code, screenshots, files, Mermaid diagrams) and it's stored as a
structured document, private to your account. See [`docs/PLAN.md`](docs/PLAN.md) for the design.

**Stack:** Next.js 16 · Tiptap editor · Supabase (Auth, Postgres with Row Level Security, private Storage).

## Features

- Email + password sign up / sign in / password reset.
- Every note, collection, image and file is private to its owner: enforced by Postgres RLS and Storage policies, not just the UI.
- **Paste → structure.** The New note screen reads a raw dump without any Markdown and splits it into blocks:
  text, headings, lists and checklists, tables (Markdown or tab-separated from spreadsheets), code with its language,
  Mermaid diagrams, logs and stack traces, links, images and files. Each block shows why it was detected and can be
  re-typed before saving. The original paste can be kept with the note.
- **Reading view.** Serif reading typography, dark code panels with Copy, numbered figures for images and diagrams
  (with "View source"), log panels, link cards, tip callouts, and an "On this page" outline from the headings.
- **Editing.** Edit switches the same page into a rich editor with smart paste (rich HTML, Markdown, code, screenshots).
- **Export.** Any note as Markdown or PDF (A4 pages, page numbers, running header, nothing split awkwardly).
- **Books.** Click *Select* in the sidebar, tick notes (or whole collections) in reading order, then *Make book*;
  or use *Make a book* on a collection's menu. Reorder chapters, set a title, and download one PDF with a cover,
  a table of contents with page numbers, and each note as a chapter.
  PDFs use the browser's print dialog: choose **Save as PDF**.
- Collections (folders) and tags in the sidebar, full-text search, pinning, mobile layout.

## Setup with your Supabase project

1. **Create the schema.** Open Supabase → SQL Editor, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it, then do the same, in order, with
   [`0002_grants.sql`](supabase/migrations/0002_grants.sql) and [`0003_collections.sql`](supabase/migrations/0003_collections.sql).
   (Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
2. **Auth URLs.** Supabase → Authentication → URL Configuration:
   - Site URL: your production URL (or `http://localhost:3000` while developing)
   - Redirect URLs: add `http://localhost:3000/**` and `https://<your-domain>/**`
3. **Environment.** Copy `.env.example` to `.env.local` and fill in values from
   Supabase → Project Settings → API (project URL + anon/publishable key).
   The `service_role` key is not needed and must never be added.
4. **Run.**
   ```bash
   npm install
   npm run dev
   ```
   Open http://localhost:3000.

## Local development without a hosted project

Requires Docker.

```bash
npm run db:start      # local Supabase on :54321, applies migrations
```

Put the printed `API_URL` and `PUBLISHABLE_KEY` into `.env.local`, then `npm run dev`.

## Tests

```bash
npm run test:rls      # user A vs user B isolation (DB + Storage), needs email confirmation off
npm run test:e2e      # browser: sign up, paste everything, reload, check persistence & isolation
```

`test:e2e` needs the dev server running and Playwright (`npm i -D playwright && npx playwright install chromium`).

## Project layout

```
app/                      routes: /login, /auth/callback, /reset-password, /notes, /notes/[id]
components/editor/        Tiptap setup, smart paste, code/Mermaid/log block, image, file and link-card nodes
components/notes/         sidebar, reading/editing view, New note (paste → blocks), home screen
components/ui.tsx         design tokens as shared classes, line icons
lib/structure.ts          raw dump → typed blocks → note document
lib/print.ts              PDF export: snapshot → paginate with Paged.js (public/vendor, copied on install) → print
lib/supabase/             browser / server / proxy clients
lib/notes.ts              data access (notes, uploads, signed URLs)
proxy.ts                  session refresh + route protection
supabase/migrations/      schema, RLS and storage policies
```
