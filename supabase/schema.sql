-- Petal Notes database schema (Supabase / Postgres)
-- Run once in the Supabase SQL editor.

create table if not exists public.notes (
  id          bigint generated always as identity primary key,
  topic       text not null check (char_length(btrim(topic)) between 1 and 60),
  body        text not null check (
                char_length(btrim(body)) between 1 and 5000
                and array_length(regexp_split_to_array(btrim(body), '\s+'), 1) <= 500
              ),
  author      text not null default 'Anonymous' check (char_length(author) between 1 and 30),
  approved    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notes_approved_created_idx
  on public.notes (approved, created_at desc);

alter table public.notes enable row level security;

-- Public can read only approved notes.
drop policy if exists "read approved notes" on public.notes;
create policy "read approved notes" on public.notes
  for select to anon, authenticated
  using (approved = true);

-- Public can submit notes, but they always start unapproved.
drop policy if exists "submit unapproved notes" on public.notes;
create policy "submit unapproved notes" on public.notes
  for insert to anon, authenticated
  with check (approved = false);

-- No update/delete policies: moderation happens in the Supabase dashboard.

-- The public may only set these columns when submitting.
revoke all on public.notes from anon, authenticated;
grant select on public.notes to anon, authenticated;
grant insert (topic, body, author) on public.notes to anon, authenticated;
