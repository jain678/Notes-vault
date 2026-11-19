-- Newer Supabase projects don't auto-grant table privileges to API roles.
-- Signed-in users get table access; Row Level Security (0001) still limits
-- every query to the caller's own rows. Logged-out (anon) users get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant select, insert, delete on table public.attachments to authenticated;

revoke all on table public.notes from anon;
revoke all on table public.attachments from anon;
