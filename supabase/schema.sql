-- VECINDARIO · Misterio diario · esquema para Supabase.
-- Ejecutar una vez en el SQL Editor del proyecto. Ver DIARIO.md.
--
-- Principios:
--   * Nadie escribe resultados desde el navegador. La única vía es la función
--     `daily-submit`, que usa la service role, regenera el caso en el servidor y
--     recalcula puntaje y calificación a partir del registro de acciones.
--   * Un resultado oficial por persona y por día: clave primaria (user_id, date_key).
--   * Lo público son dos vistas con columnas acotadas; la tabla no se lee directo.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 2 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  date_key date not null,
  version integer not null,
  points integer not null check (points >= 0),
  grade text not null check (grade in ('gold', 'green', 'blue', 'gray', 'red')),
  won boolean not null,
  deduced boolean not null,
  questions integer not null,
  minimum integer not null,
  lives integer not null,
  wrong_accusations integer not null,
  hint_used boolean not null,
  log jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

create index if not exists daily_results_date_points on public.daily_results (date_key, points desc, submitted_at);

alter table public.profiles enable row level security;
alter table public.daily_results enable row level security;

-- Perfiles: cada uno lee el suyo. Los nombres de los demás sólo se ven por las vistas.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select to authenticated using (id = auth.uid());

-- daily_results no tiene políticas: anon y authenticated no pueden leer ni escribir.
revoke all on public.daily_results from anon, authenticated;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Clasificación del día. Las vistas corren con los permisos de su dueño y
-- exponen sólo lo necesario para la tabla.
create or replace view public.daily_leaderboard as
select
  r.date_key,
  r.user_id,
  p.display_name,
  r.points,
  r.grade,
  rank() over (partition by r.date_key order by r.points desc) as position,
  r.submitted_at
from public.daily_results r
left join public.profiles p on p.id = r.user_id;

-- Clasificación general acumulada.
create or replace view public.overall_leaderboard as
select
  t.user_id,
  t.display_name,
  t.points,
  t.solved,
  t.golds,
  rank() over (order by t.points desc) as position
from (
  select r.user_id, p.display_name, sum(r.points)::integer as points,
         count(*) filter (where r.won)::integer as solved,
         count(*) filter (where r.grade = 'gold')::integer as golds
  from public.daily_results r
  left join public.profiles p on p.id = r.user_id
  group by r.user_id, p.display_name
) t;

grant select on public.daily_leaderboard, public.overall_leaderboard to anon, authenticated;

-- Nombre público: única escritura permitida desde el navegador, y sólo del propio perfil.
create or replace function public.set_display_name(new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean text := btrim(coalesce(new_name, ''));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(clean) not between 2 and 20 then
    raise exception 'invalid name';
  end if;
  insert into public.profiles (id, display_name) values (auth.uid(), clean)
  on conflict (id) do update set display_name = excluded.display_name;
end;
$$;

revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
