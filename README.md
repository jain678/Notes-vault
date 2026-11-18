# Notes Vault

A simple notes dumping platform which organizes notes in a more readable and well-structured format.

Paste or type anything (text, Markdown, code, screenshots, files, Mermaid diagrams) and it's stored as a
structured document, private to your account. See [`docs/PLAN.md`](docs/PLAN.md) for the design.

**Stack:** Next.js 16 · Tiptap editor · Supabase (Auth, Postgres with Row Level Security, private Storage).

## Features

- Email + password sign up / sign in / password reset.
- Every note, image and file is private to its owner: enforced by Postgres RLS and Storage policies, not just the UI.
- Paste handling:
  - rich text from web pages / Docs → headings, lists, links, tables
  - Markdown → formatted content
  - code (from VS Code or plain text) → highlighted code block with detected language
  - ```` ```mermaid ```` or bare Mermaid → rendered diagram
  - screenshots / images → uploaded and shown inline
  - any other file (≤ 25 MB) → download chip
- Paste anywhere on the empty screen to instantly create a note.
- Autosave, full-text search, tags, pinning, export to Markdown, dark mode, mobile layout.

## Setup with your Supabase project

1. **Create the schema.** Open Supabase → SQL Editor, paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it, then do the same with
   [`supabase/migrations/0002_grants.sql`](supabase/migrations/0002_grants.sql).
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
components/editor/        Tiptap setup, smart paste, code/Mermaid block, image & file nodes
components/notes/         sidebar, editor page, tags, empty "dump" screen
lib/supabase/             browser / server / proxy clients
lib/notes.ts              data access (notes, uploads, signed URLs)
proxy.ts                  session refresh + route protection
supabase/migrations/      schema, RLS and storage policies
```
