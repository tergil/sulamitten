-- Kalender: felles avtaler med gjentakelser og unntak.
-- Kjøres i Supabase → SQL Editor (etter skjema.sql og varsler.sql). Trygt å kjøre på nytt.
--
-- En serie er én rad med «gjentak» i ekstra. «Bare denne dagen» lagres som en egen rad med serie_id + original_dato
-- (avlyst = true når den dagen er slettet). Sletter man serien, forsvinner unntakene også (on delete cascade).
-- Alle avtaler er felles: alle medlemmer ser og kan endre.

create table if not exists public.hendelse (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid references public.hendelse (id) on delete cascade,
  original_dato date,
  avlyst boolean not null default false,
  tittel text not null,
  dato date not null,
  ekstra jsonb not null default '{}',
  opprettet timestamptz not null default now(),
  laget_av text not null default coalesce(auth.jwt() ->> 'email', '')
);
create index if not exists hendelse_serie on public.hendelse (serie_id);
create index if not exists hendelse_dato on public.hendelse (dato);
alter table public.hendelse enable row level security;

drop policy if exists "medlemmer og avtaler" on public.hendelse;
create policy "medlemmer og avtaler" on public.hendelse for all to authenticated
  using (public.er_medlem())
  with check (public.er_medlem());

revoke all on public.hendelse from anon, authenticated;
grant select, insert, update, delete on public.hendelse to authenticated;

-- Avlysning: en avlyst avtale har ekstra.innstilt = true (vises gjennomstreket). Når noen avlyser, får den andre varsel:
-- triggeren legger en rad i «aktivitet» (fra varsler.sql), som Edge Function «varsler» sender og tømmer.
alter table public.aktivitet alter column liste_id drop not null;
alter table public.aktivitet add column if not exists hendelse_id uuid;

create or replace function public.logg_hendelse() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce((new.ekstra ->> 'innstilt')::boolean, false) = false then
    return null;
  end if;
  -- Var den avlyst fra før, er det ikke noe nytt
  if tg_op = 'UPDATE' then
    if coalesce((old.ekstra ->> 'innstilt')::boolean, false) then
      return null;
    end if;
  end if;
  insert into public.aktivitet (bruker, hva, hendelse_id) values (auth.uid(), 'avlyst', new.id);
  return null;
end $$;

drop trigger if exists logg_hendelse on public.hendelse;
create trigger logg_hendelse after insert or update of ekstra on public.hendelse
  for each row execute function public.logg_hendelse();

-- Varsel før avtaler: timejobben må gå hvert kvarter i stedet for hver time.
-- (Daglige varsler sendes fortsatt bare én gang, i første kvarter av timen du har valgt.)
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'familie-varsler'),
  schedule := '*/15 * * * *'
);
