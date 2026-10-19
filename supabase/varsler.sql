-- Varsler (push): enheter, innstillinger og hva som er sendt.
-- Kjøres én gang i Supabase → SQL Editor (etter skjema.sql og lister.sql). Trygt å kjøre på nytt.
-- Timejobben (pg_cron) og hemmelighetene står i Data/varsler-oppsett.txt, laget av «npm run vapid» – ikke her,
-- fordi repoet er offentlig.

-- Enhetene (telefon, PC) som har slått på varsler. Bare eieren ser og endrer sine.
create table if not exists public.varsel_abonnement (
  id uuid primary key default gen_random_uuid(),
  bruker uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enhet text not null default '',
  opprettet timestamptz not null default now()
);
alter table public.varsel_abonnement enable row level security;

-- Hva hver bruker vil ha varsel om, og når. Én rad per bruker.
create table if not exists public.varsel_innstilling (
  bruker uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  oppdatert timestamptz not null default now()
);
alter table public.varsel_innstilling enable row level security;

-- Varsler som er sendt (så de ikke sendes igjen). Bare Edge Function (tjenestenøkkelen) bruker den.
create table if not exists public.varsel_sendt (
  bruker uuid not null references auth.users (id) on delete cascade,
  nokkel text not null,
  sendt timestamptz not null default now(),
  primary key (bruker, nokkel)
);
alter table public.varsel_sendt enable row level security;

drop policy if exists "egne enheter" on public.varsel_abonnement;
create policy "egne enheter" on public.varsel_abonnement for all to authenticated
  using (public.er_medlem() and bruker = auth.uid())
  with check (public.er_medlem() and bruker = auth.uid());

drop policy if exists "egne varselinnstillinger" on public.varsel_innstilling;
create policy "egne varselinnstillinger" on public.varsel_innstilling for all to authenticated
  using (public.er_medlem() and bruker = auth.uid())
  with check (public.er_medlem() and bruker = auth.uid());
-- varsel_sendt: ingen policyer – kan ikke leses eller endres fra appen.

revoke all on public.varsel_abonnement, public.varsel_innstilling, public.varsel_sendt from anon, authenticated;
grant select, insert, update, delete on public.varsel_abonnement, public.varsel_innstilling to authenticated;

-- ---------------------------------------------------------------------------
-- Bjella i appen: varslene som er sendt, med alle detaljer. Skrives av Edge Function «varsler»,
-- leses og merkes som lest av eieren. Ryddes etter 60 dager.
-- ---------------------------------------------------------------------------
create table if not exists public.varsel_innboks (
  id uuid primary key default gen_random_uuid(),
  bruker uuid not null references auth.users (id) on delete cascade,
  type text not null default '',
  tittel text not null,
  tekst text not null default '',
  url text not null default '',
  opprettet timestamptz not null default now(),
  lest boolean not null default false
);
create index if not exists varsel_innboks_bruker on public.varsel_innboks (bruker, opprettet desc);
alter table public.varsel_innboks enable row level security;

drop policy if exists "les egne varsler" on public.varsel_innboks;
create policy "les egne varsler" on public.varsel_innboks for select to authenticated
  using (public.er_medlem() and bruker = auth.uid());
drop policy if exists "merk egne varsler" on public.varsel_innboks;
create policy "merk egne varsler" on public.varsel_innboks for update to authenticated
  using (public.er_medlem() and bruker = auth.uid())
  with check (public.er_medlem() and bruker = auth.uid());
drop policy if exists "slett egne varsler" on public.varsel_innboks;
create policy "slett egne varsler" on public.varsel_innboks for delete to authenticated
  using (public.er_medlem() and bruker = auth.uid());

revoke all on public.varsel_innboks from anon, authenticated;
grant select, update, delete on public.varsel_innboks to authenticated;

-- ---------------------------------------------------------------------------
-- Det som skjer i delte lister (ny liste, nytt punkt, ny status). Fylles av triggerne under, tømmes av
-- Edge Function «varsler» hvert kvarter (som varsler den andre). Bare felles lister – aldri private.
-- Ingen policyer: kan ikke leses eller endres fra appen.
-- ---------------------------------------------------------------------------
create table if not exists public.aktivitet (
  id bigint generated always as identity primary key,
  bruker uuid not null,
  hva text not null,
  liste_id uuid not null,
  punkt_id uuid,
  status text,
  tid timestamptz not null default now()
);
alter table public.aktivitet enable row level security;
revoke all on public.aktivitet from anon, authenticated;

-- Én funksjon per tabell (liste og listepunkt har ulike kolonner)
create or replace function public.logg_liste() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.eier is not null or new.mal then
    return null;
  end if;
  -- Privat liste som blir delt, regnes som ny delt liste
  if tg_op = 'UPDATE' then
    if old.eier is null then
      return null;
    end if;
  end if;
  insert into public.aktivitet (bruker, hva, liste_id) values (auth.uid(), 'liste', new.id);
  return null;
end $$;

create or replace function public.logg_listepunkt() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return null;
  end if;
  if not exists (select 1 from public.liste l where l.id = new.liste_id and l.eier is null and not l.mal) then
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.aktivitet (bruker, hva, liste_id, punkt_id, status) values (auth.uid(), 'punkt', new.liste_id, new.id, new.status);
  elsif new.status is distinct from old.status then
    insert into public.aktivitet (bruker, hva, liste_id, punkt_id, status) values (auth.uid(), 'status', new.liste_id, new.id, new.status);
  end if;
  return null;
end $$;


drop trigger if exists logg_liste on public.liste;
create trigger logg_liste after insert or update of eier on public.liste
  for each row execute function public.logg_liste();
drop trigger if exists logg_listepunkt on public.listepunkt;
create trigger logg_listepunkt after insert or update of status on public.listepunkt
  for each row execute function public.logg_listepunkt();
