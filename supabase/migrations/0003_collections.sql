-- Collections (folders), original-paste storage and list previews.

create table if not exists public.collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists collections_user_idx on public.collections (user_id, name);

alter table public.collections enable row level security;

drop policy if exists "collections: owner all" on public.collections;
create policy "collections: owner all" on public.collections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.collections to authenticated;
revoke all on table public.collections from anon;

alter table public.notes
  add column if not exists collection_id uuid references public.collections(id) on delete set null,
  add column if not exists raw_paste text,
  add column if not exists preview text generated always as (left(content_text, 200)) stored;

create index if not exists notes_collection_idx on public.notes (collection_id);

-- A note may only be filed in one of its owner's own collections.
drop policy if exists "notes: owner insert" on public.notes;
drop policy if exists "notes: owner update" on public.notes;
create policy "notes: owner insert" on public.notes
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
  );
create policy "notes: owner update" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (collection_id is null or exists (
      select 1 from public.collections c where c.id = collection_id and c.user_id = (select auth.uid())
    ))
  );
