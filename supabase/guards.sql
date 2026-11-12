-- =====================================================================
-- HB+ Tasks — database guards (run AFTER schema.sql; safe to run again)
--
-- The app checks every rule, but a technical user could talk to the
-- database directly. These guards make the database itself refuse:
--   • changing users, roles, verticals, holidays or policy unless you have that ability
--   • promoting anyone to Founder/Admin unless you are a Founder/Admin
--   • editing someone else's profile (you may only mute tasks on your own)
--   • rewriting points on a score event (only the "reversed" flag may change)
--   • moving a task's original deadline (PRD §6: it never changes)
--   • deciding appeals unless you are a Founder/Admin
--   • deleting history (tasks, comments, approvals, SOWs, scores, policy) unless Founder/Admin
-- The server job (service role) and the SQL editor are trusted and skip these checks.
-- =====================================================================

-- ---------- Who is calling? ----------------------------------------------
create or replace function public.hb_me() returns text
language sql stable security definer set search_path = public as $$
  select id from public.users
  where lower(email) = lower(auth.jwt() ->> 'email') and status <> 'inactive'
  limit 1
$$;

create or replace function public.hb_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where lower(email) = lower(auth.jwt() ->> 'email') and status <> 'inactive' and role in ('founder','admin')
  )
$$;

-- Founder/Admin, or a custom role that includes this company-level ability.
create or replace function public.hb_has(ability text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.hb_is_admin() or exists (
    select 1
    from public.users u
    join public.user_roles ur on ur.user_id = u.id
    join public.roles r on r.id = ur.role_id
    where lower(u.email) = lower(auth.jwt() ->> 'email') and u.status <> 'inactive' and ability = any (r.abilities)
  )
$$;

-- True only while the workspace is being created (no users yet).
create or replace function public.hb_first_setup() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.users)
$$;

-- Trusted callers: the server job, the SQL editor, and demo mode.
create or replace function public.hb_trusted() returns boolean
language sql stable as $$
  select auth.jwt() is null
      or coalesce(auth.jwt() ->> 'role', '') in ('service_role', 'anon')
      or coalesce(auth.jwt() ->> 'email', '') = ''
$$;

-- ---------- Table access, by command ------------------------------------
-- spec: table, who may insert, who may update, who may delete
do $$
declare
  r record;
begin
  for r in select * from (values
    ('verticals',        $q$public.hb_has('verticals') or public.hb_first_setup()$q$,  $q$public.hb_has('verticals')$q$, $q$public.hb_has('verticals')$q$),
    ('roles',            $q$public.hb_is_admin() or public.hb_first_setup()$q$,        $q$public.hb_is_admin()$q$,       $q$public.hb_is_admin()$q$),
    ('user_roles',       $q$public.hb_is_admin() or public.hb_first_setup()$q$,        $q$public.hb_is_admin()$q$,       $q$public.hb_is_admin()$q$),
    ('users',            $q$public.hb_has('users') or public.hb_first_setup() or id = public.hb_me()$q$,      $q$public.hb_has('users') or public.hb_has('offboarding') or id = public.hb_me()$q$, $q$public.hb_is_admin()$q$),
    ('user_verticals',   $q$public.hb_has('users') or public.hb_first_setup()$q$,      $q$public.hb_has('users')$q$,     $q$public.hb_has('users')$q$),
    ('holidays',         $q$public.hb_has('holidays') or public.hb_first_setup()$q$,   $q$public.hb_has('holidays')$q$,  $q$public.hb_has('holidays')$q$),
    ('policy_versions',  $q$public.hb_has('policy')$q$,                                $q$false$q$,                      $q$public.hb_is_admin()$q$),
    ('work_items',       $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('comments',         $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('approvals',        $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('sow_days',         $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('off_days',         $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('score_events',     $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('appeals',          $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('kpis',             $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$),
    ('recurring_rules',  $q$true$q$, $q$true$q$, $q$public.hb_is_admin()$q$)
  ) as t(tbl, ins, upd, del)
  loop
    execute format('drop policy if exists "company members" on public.%I', r.tbl);
    execute format('drop policy if exists "hb read" on public.%I', r.tbl);
    execute format('drop policy if exists "hb insert" on public.%I', r.tbl);
    execute format('drop policy if exists "hb update" on public.%I', r.tbl);
    execute format('drop policy if exists "hb delete" on public.%I', r.tbl);
    execute format('create policy "hb read" on public.%I for select to authenticated using (public.hb_is_member())', r.tbl);
    execute format('create policy "hb insert" on public.%I for insert to authenticated with check (public.hb_is_member() and (%s))', r.tbl, r.ins);
    execute format('create policy "hb update" on public.%I for update to authenticated using (public.hb_is_member() and (%s)) with check (public.hb_is_member() and (%s))', r.tbl, r.upd, r.upd);
    execute format('create policy "hb delete" on public.%I for delete to authenticated using (public.hb_is_member() and (%s))', r.tbl, r.del);
  end loop;
end $$;

-- ---------- Field-level rules (triggers) --------------------------------
-- Users: only Founders/Admins change roles; people editing themselves may only mute tasks.
create or replace function public.hb_guard_users() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.hb_trusted() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role in ('founder','admin') and not (public.hb_is_admin() or public.hb_first_setup()) then
      raise exception 'Only a Founder or Admin can add a Founder or Admin.';
    end if;
    return new;
  end if;
  if new.role is distinct from old.role and not public.hb_is_admin() then
    raise exception 'Only a Founder or Admin can change roles.';
  end if;
  if not (public.hb_has('users') or public.hb_has('offboarding')) then
    if (new.name, new.email, new.role, new.status, new.daily_hours, new.title)
       is distinct from (old.name, old.email, old.role, old.status, old.daily_hours, old.title) then
      raise exception 'You can only change your own muted tasks.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_users on public.users;
create trigger hb_guard_users before insert or update on public.users for each row execute function public.hb_guard_users();

-- Work items: the original deadline never changes.
create or replace function public.hb_guard_work_items() returns trigger
language plpgsql as $$
begin
  if public.hb_trusted() then return new; end if;
  if new.original_deadline is distinct from old.original_deadline then
    raise exception 'The original deadline never changes — request an extension instead.';
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_work_items on public.work_items;
create trigger hb_guard_work_items before update on public.work_items for each row execute function public.hb_guard_work_items();

-- Score events: points are final; only the "reversed" flag may change (on reopen).
create or replace function public.hb_guard_score_events() returns trigger
language plpgsql as $$
begin
  if public.hb_trusted() then return new; end if;
  if (new.user_id, new.item_id, new.type, new.code, new.points, new.created_at, new.policy_version)
     is distinct from (old.user_id, old.item_id, old.type, old.code, old.points, old.created_at, old.policy_version) then
    raise exception 'Score events cannot be edited. Raise an appeal instead.';
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_score_events on public.score_events;
create trigger hb_guard_score_events before update on public.score_events for each row execute function public.hb_guard_score_events();

-- Appeals: only Founders/Admins decide them.
create or replace function public.hb_guard_appeals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.hb_trusted() then return new; end if;
  if new.status is distinct from old.status and not public.hb_is_admin() then
    raise exception 'Only a Founder or Admin can decide an appeal.';
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_appeals on public.appeals;
create trigger hb_guard_appeals before update on public.appeals for each row execute function public.hb_guard_appeals();

-- Score adjustments from appeals can only be created by Founders/Admins.
create or replace function public.hb_guard_adjustments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.hb_trusted() then return new; end if;
  if new.type = 'adjustment' and not public.hb_is_admin() then
    raise exception 'Only a Founder or Admin can adjust scores.';
  end if;
  return new;
end $$;
drop trigger if exists hb_guard_adjustments on public.score_events;
create trigger hb_guard_adjustments before insert on public.score_events for each row execute function public.hb_guard_adjustments();
