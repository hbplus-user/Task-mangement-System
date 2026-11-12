-- Phase 3: goals, performance reviews, KPI auto-pull. Phase 2: SOW in Slack.
-- Keeps your data. Run in Supabase → SQL Editor AFTER guards.sql. Safe to run again.

-- KPI data sources (Meta Ads / Zoho CRM)
alter table public.kpis add column if not exists source text default 'manual';   -- manual | meta | zoho (empty = manual)
alter table public.kpis add column if not exists source_metric text;                       -- e.g. leads, cpl, deals_won
alter table public.kpi_actuals add column if not exists is_auto boolean;                  -- filled in by the daily pull

-- Goals (top, behaviour/skill, health, extra initiative, KPI)
create table if not exists public.goals (
  id             text primary key,
  user_id        text not null references public.users(id),
  type           text not null check (type in ('top','behaviour','health','initiative','kpi')),
  title          text not null,
  description    text,
  period_start   date not null,
  period_end     date not null,
  measure        text not null default 'number',   -- number | percent | done
  direction      text not null default '>=',       -- >= (higher is better) | <=
  target         numeric,
  current_value  numeric,
  unit           text,
  weight         numeric not null default 1,       -- 1–5
  is_private     boolean not null default false,   -- health goals are always private
  status         text not null default 'active',   -- active | achieved | dropped
  status_note    text,
  created_by     text,
  created_at     timestamptz,
  last_check_in  timestamptz,
  achieved_at    timestamptz,
  extra          jsonb not null default '{}',
  updated_at     timestamptz not null default now()
);
create index if not exists goals_user_idx on public.goals (user_id);

create table if not exists public.goal_checkins (
  id          text primary key,
  goal_id     text not null references public.goals(id) on delete cascade,
  position    int not null,
  checked_at  timestamptz,
  value       numeric,
  note        text,
  checked_by  text,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- Performance reviews
create table if not exists public.performance_reviews (
  id               text primary key,
  user_id          text not null references public.users(id),
  reviewer_id      text references public.users(id),
  period_label     text,
  period_start     date,
  period_end       date,
  snapshot         jsonb,          -- the numbers at the time of the review
  rating           smallint check (rating between 1 and 5),
  strengths        text,
  growth_area      text,
  notes            text,
  status           text not null default 'draft',   -- draft | shared | acknowledged
  created_at       timestamptz,
  updated_at_app   timestamptz,
  shared_at        timestamptz,
  acknowledged_at  timestamptz,
  acknowledgement  text,
  extra            jsonb not null default '{}',
  updated_at       timestamptz not null default now()
);

-- Slack: drafts of the two-step SOW pop-up (server only)
create table if not exists public.slack_sow_drafts (
  id          text primary key,        -- Slack view id
  user_id     text not null,
  sow_date    date not null,
  entries     jsonb not null,
  created_at  timestamptz not null default now()
);
alter table public.slack_sow_drafts enable row level security;

-- Privacy (PRD §8): you see your own; managers see their reporting tree; founders/admins see all.
create or replace function public.hb_can_see_person(target text) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive me as (
    select id, role from public.users
    where lower(email) = lower(auth.jwt() ->> 'email') and status <> 'inactive'
  ),
  tree(uid) as (
    select uv.user_id from public.user_verticals uv join me on uv.manager_id = me.id
    union
    select uv.user_id from public.user_verticals uv join tree t on uv.manager_id = t.uid
  )
  select exists (select 1 from me where me.id = target or me.role in ('founder','admin'))
      or exists (select 1 from tree where uid = target)
$$;

do $$
declare t text;
begin
  foreach t in array array['goals','goal_checkins','performance_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "hb people" on public.%I', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

create policy "hb people" on public.goals for all to authenticated
  using (public.hb_is_member() and public.hb_can_see_person(user_id))
  with check (public.hb_is_member() and public.hb_can_see_person(user_id));

create policy "hb people" on public.goal_checkins for all to authenticated
  using (public.hb_is_member() and exists (select 1 from public.goals g where g.id = goal_id and public.hb_can_see_person(g.user_id)))
  with check (public.hb_is_member() and exists (select 1 from public.goals g where g.id = goal_id and public.hb_can_see_person(g.user_id)));

-- Reviews: the person sees only shared ones; their managers / founders / admins see all.
create policy "hb people" on public.performance_reviews for all to authenticated
  using (public.hb_is_member() and public.hb_can_see_person(user_id)
         and (status <> 'draft' or user_id <> public.hb_me()))
  with check (public.hb_is_member() and public.hb_can_see_person(user_id));

-- The person reviewed can acknowledge, but never write or edit their own review.
create or replace function public.hb_guard_reviews() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.hb_trusted() then return new; end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.performance_reviews where id = new.id) then return new; end if;  -- an update arriving as an upsert
    if new.user_id = public.hb_me() then raise exception 'You can''t write your own review.'; end if;
    return new;
  end if;
  if new.user_id = public.hb_me() then
    if (new.rating, new.strengths, new.growth_area, new.notes, new.snapshot, new.reviewer_id, new.period_start, new.period_end)
       is distinct from (old.rating, old.strengths, old.growth_area, old.notes, old.snapshot, old.reviewer_id, old.period_start, old.period_end) then
      raise exception 'Only your reviewer can change the review.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_reviews on public.performance_reviews;
create trigger hb_guard_reviews before insert or update on public.performance_reviews for each row execute function public.hb_guard_reviews();
