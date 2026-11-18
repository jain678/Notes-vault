-- Notes Vault: initial schema
-- Run this once in the Supabase SQL Editor (or `supabase db push`).

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null default '',
  content      jsonb not null default '{}'::jsonb,   -- Tiptap document JSON
  content_text text not null default '',             -- plain text for search / previews
  tags         text[] not null default '{}',
  pinned       boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  search       tsvector generated always as (
                 to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content_text, ''))
               ) stored
);

create index if not exists notes_user_list_idx on public.notes (user_id, pinned desc, updated_at desc);
create index if not exists notes_search_idx    on public.notes using gin (search);
create index if not exists notes_tags_idx      on public.notes using gin (tags);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "notes: owner select" on public.notes;
drop policy if exists "notes: owner insert" on public.notes;
drop policy if exists "notes: owner update" on public.notes;
drop policy if exists "notes: owner delete" on public.notes;

create policy "notes: owner select" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notes: owner insert" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notes: owner update" on public.notes
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes: owner delete" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- attachments (images + files referenced by notes)
-- ---------------------------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note_id      uuid references public.notes(id) on delete cascade,
  storage_path text not null unique,   -- "<user_id>/<note_id>/<uuid>-<filename>"
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  created_at   timestamptz not null default now()
);

create index if not exists attachments_note_idx on public.attachments (note_id);
create index if not exists attachments_user_idx on public.attachments (user_id);

alter table public.attachments enable row level security;

drop policy if exists "attachments: owner select" on public.attachments;
drop policy if exists "attachments: owner insert" on public.attachments;
drop policy if exists "attachments: owner delete" on public.attachments;

create policy "attachments: owner select" on public.attachments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "attachments: owner insert" on public.attachments
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
    and (note_id is null or exists (
      select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())
    ))
  );
create policy "attachments: owner delete" on public.attachments
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- storage: private bucket, files live under "<user_id>/..."
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('note-assets', 'note-assets', false, 26214400)  -- 25 MB
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "note-assets: owner select" on storage.objects;
drop policy if exists "note-assets: owner insert" on storage.objects;
drop policy if exists "note-assets: owner update" on storage.objects;
drop policy if exists "note-assets: owner delete" on storage.objects;

create policy "note-assets: owner select" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-assets: owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-assets: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'note-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note-assets: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);
