-- Petal Notes moderation (run after schema.sql)
--
-- 1. A word filter: notes that look abusive or spammy are held back
--    (approved = false, flagged = true) instead of going live.
-- 2. Moderators: people whose email is in public.moderators can sign in on
--    /#/moderate to approve, hide or delete notes.

-- ---------- Notes: flagged column ----------
alter table public.notes add column if not exists flagged boolean not null default false;

-- ---------- Moderators ----------
create table if not exists public.moderators (
  email     text primary key check (email = lower(btrim(email))),
  added_at  timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on public.moderators from anon, authenticated;

create or replace function public.is_moderator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderators
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to anon, authenticated;

-- ---------- Blocked terms ----------
-- match_anywhere = true also catches the term hidden inside punctuation or
-- spacing (e.g. "f.u.c.k"); use it only for terms that never appear inside
-- ordinary words.
create table if not exists public.blocked_terms (
  term            text primary key check (term = lower(btrim(term))),
  match_anywhere  boolean not null default false
);
alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;

create or replace function public.note_is_suspicious(p_text text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  raw   text := lower(coalesce(p_text, ''));
  norm  text;
  squashed text;
  t record;
begin
  -- Links, handles and contact details are almost always spam here.
  if raw ~ '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|xyz|ru|io|ly|me|co|app|link|site|shop|click)\M|t\.me/|@[a-z0-9_.]{3,}|\d{3}[\s.-]?\d{3}[\s.-]?\d{4})' then
    return true;
  end if;

  -- Undo common letter swaps, then collapse whitespace.
  norm := translate(raw, '013457@$!|', 'oieastasii');
  norm := regexp_replace(norm, '\s+', ' ', 'g');
  -- Letters only, repeated letters collapsed ("fuuuck" -> "fuck").
  squashed := regexp_replace(regexp_replace(norm, '[^a-z]', '', 'g'), '(.)\1+', '\1', 'g');

  for t in select term, match_anywhere from public.blocked_terms loop
    if norm ~ ('\m' || t.term || '\M') then
      return true;
    end if;
    if t.match_anywhere
       and position(regexp_replace(t.term, '(.)\1+', '\1', 'g') in squashed) > 0 then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function public.note_is_suspicious(text) from public;

create or replace function public.notes_screen()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if public.note_is_suspicious(new.topic || ' ' || new.body || ' ' || new.author) then
    new.approved := false;
    new.flagged := true;
  else
    new.approved := true;
    new.flagged := false;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_screen on public.notes;
create trigger notes_screen
  before insert on public.notes
  for each row execute function public.notes_screen();

-- ---------- Row-level security ----------
-- Public: read approved notes; submit notes (the trigger decides approval).
drop policy if exists "read approved notes" on public.notes;
create policy "read approved notes" on public.notes
  for select to anon, authenticated
  using (approved = true or public.is_moderator());

drop policy if exists "submit notes" on public.notes;
create policy "submit notes" on public.notes
  for insert to anon, authenticated
  with check (true);

-- Moderators: approve/hide and delete.
drop policy if exists "moderators update notes" on public.notes;
create policy "moderators update notes" on public.notes
  for update to authenticated
  using (public.is_moderator())
  with check (public.is_moderator());

drop policy if exists "moderators delete notes" on public.notes;
create policy "moderators delete notes" on public.notes
  for delete to authenticated
  using (public.is_moderator());

revoke all on public.notes from anon, authenticated;
grant select on public.notes to anon, authenticated;
grant insert (topic, body, author) on public.notes to anon, authenticated;
grant update (approved) on public.notes to authenticated;
grant delete on public.notes to authenticated;
