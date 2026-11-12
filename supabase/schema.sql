-- =====================================================================
-- HB+ Tasks — database schema (Supabase / Postgres)
-- Run in Supabase → SQL Editor → New query → paste all → Run.
--
-- ⚠ This DROPS the old hb_* tables and any HB+ tables from an earlier run
--   of this file, then creates everything fresh. All data in them is lost.
--
-- Company email domain is set ONCE in public.hb_is_member() below.
-- It must match VITE_COMPANY_DOMAIN in .env.local.
-- =====================================================================

-- ---------- 0. Clean up --------------------------------------------------
drop table if exists
  public.hb_users, public.hb_verticals, public.hb_roles, public.hb_items, public.hb_comments,
  public.hb_activity, public.hb_approvals, public.hb_sow_days, public.hb_off_days, public.hb_holidays,
  public.hb_score_events, public.hb_appeals, public.hb_policy_versions, public.hb_kpis,
  public.hb_recurring, public.hb_notifications, public.hb_channel, public.hb_flags, public.hb_kv
cascade;

drop table if exists
  public.app_lease, public.matrix_overrides, public.id_sequences, public.system_flags,
  public.channel_posts, public.notifications, public.recurring_rules, public.kpi_actuals, public.kpis,
  public.policy_versions, public.appeals, public.score_events, public.holidays, public.off_days,
  public.sow_entries, public.sow_days, public.approvals, public.activity_log, public.comments,
  public.item_links, public.checklist_items, public.work_items, public.user_roles,
  public.user_verticals, public.users, public.roles, public.verticals
cascade;

-- Every table keeps an `extra` jsonb column: any field the app adds later is
-- kept there instead of being lost. Normally it is empty ({}).

-- ---------- 1. Organisation ---------------------------------------------
create table public.verticals (
  id          text primary key,
  name        text not null,
  key         text not null unique,            -- task ID prefix, e.g. MKT
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.roles (                      -- custom company-level roles
  id          text primary key,
  name        text not null,
  abilities   text[] not null default '{}',    -- users, verticals, holidays, offboarding, company, reports, syslog, policy
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.users (
  id              text primary key,
  name            text not null,
  email           text not null,
  slack_id        text,
  role            text not null default 'member' check (role in ('founder','admin','member')),
  title           text,
  daily_hours     numeric not null default 9,
  status          text not null default 'active' check (status in ('active','offboarding','inactive')),
  joined_on       date,
  muted_item_ids  text[] not null default '{}',
  extra           jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);
create index on public.users (lower(email));

create table public.user_verticals (              -- a person's verticals + manager per vertical
  id           text primary key,                  -- "<user_id>:<vertical_id>"
  user_id      text not null references public.users(id) on delete cascade,
  vertical_id  text not null references public.verticals(id),
  manager_id   text references public.users(id),
  is_main      boolean not null default false,
  position     int not null default 0,
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now(),
  unique (user_id, vertical_id)
);

create table public.user_roles (
  id          text primary key,                   -- "<user_id>:<role_id>"
  user_id     text not null references public.users(id) on delete cascade,
  role_id     text not null references public.roles(id) on delete cascade,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ---------- 2. Work (streams, cycles, projects, tasks, sub-tasks) --------
create table public.work_items (
  id                     text primary key,
  item_key               text not null,           -- e.g. MKT-14
  type                   text not null check (type in ('stream','cycle','project','task','subtask')),
  parent_id              text references public.work_items(id),
  title                  text not null,
  description            text,
  vertical_id            text references public.verticals(id),
  creator_id             text references public.users(id),
  owner_id               text not null references public.users(id),
  assignee_id            text references public.users(id),
  reviewer_id            text references public.users(id),
  contributor_ids        text[] not null default '{}',
  status                 text not null,           -- pending_approval, awaiting, open, in_progress, blocked, in_review, closed, cancelled, skipped
  previous_status        text,
  size                   text check (size in ('S','M','L')),
  impact                 smallint check (impact in (1,3,5)),
  impact_reason          text,
  estimated_hours        numeric,
  progress_method        text,                    -- checklist | subtasks | stages
  progress               numeric,
  stage                  numeric,
  is_private             boolean not null default false,
  is_pinned              boolean not null default false,
  original_deadline      timestamptz,
  current_deadline       timestamptz,
  pickup_date            date,
  proof_links            text[] not null default '{}',
  rating                 smallint check (rating between 1 and 3),
  recurring_rule_id      text,
  project_key            text,
  cycle_length           text,
  cycle_start            timestamptz,
  cycle_verified         boolean,
  paused_ms              bigint not null default 0,
  extensions_count       int not null default 0,
  blocked_by             text references public.users(id),
  blocked_at             timestamptz,
  blocked_reason         text,
  blocked_approved_days  int,
  declined_by            text references public.users(id),
  declined_reason        text,
  declined_at            timestamptz,
  rejected_by            text references public.users(id),
  rejected_reason        text,
  cancel_reason          text,
  offboarded_from        text,
  recurring_miss_flagged boolean,
  setup_batch            boolean,                 -- entered in the pilot setup sprint
  size_confirmed_by      text,                    -- manager who confirmed size & impact (self-created tasks)
  goal_links             text[] not null default '{}',   -- Phase 3
  created_at             timestamptz,
  assigned_at            timestamptz,
  accepted_at            timestamptz,
  last_update_at         timestamptz,
  submitted_at           timestamptz,
  deadline_at_submit     timestamptz,
  closed_at              timestamptz,
  extra                  jsonb not null default '{}',
  updated_at             timestamptz not null default now()
);
create index on public.work_items (owner_id);
create index on public.work_items (parent_id);
create index on public.work_items (status);

create table public.checklist_items (
  id          text primary key,
  item_id     text not null references public.work_items(id) on delete cascade,
  position    int not null,
  text        text not null,
  done        boolean not null default false,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
create index on public.checklist_items (item_id);

create table public.item_links (                  -- reference links (no file uploads)
  id          text primary key,                   -- "<item_id>:<position>"
  item_id     text not null references public.work_items(id) on delete cascade,
  position    int not null,
  label       text,
  url         text not null,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.comments (
  id                 text primary key,
  item_id            text not null references public.work_items(id),
  author_id          text references public.users(id),
  body               text not null,
  action             text,                        -- the action this comment came with, if any
  parent_comment_id  text,
  created_at         timestamptz not null,
  extra              jsonb not null default '{}',
  updated_at         timestamptz not null default now()
);
create index on public.comments (item_id);

create table public.activity_log (                -- append-only audit log
  id          text primary key,
  item_id     text,
  actor_id    text,
  action      text not null,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
create index on public.activity_log (item_id);
create index on public.activity_log (created_at);

create table public.approvals (
  id                text primary key,
  type              text not null,                -- cross_vertical, extension, owner_change, cancel, skip, blocked_extra, setup, self_review
  item_id           text references public.work_items(id),
  requester_id      text references public.users(id),
  approver_ids      text[] not null default '{}',
  status            text not null,                -- pending, approved, rejected, closed
  summary           text,
  new_deadline      timestamptz,
  old_deadline      timestamptz,
  notice_hours      numeric,
  extension_number  int,
  extension_cost    text[],
  new_owner_id      text,
  reason            text,
  blocked_day       int,
  setup_item_ids    text[],                       -- setup sprint: the tasks in the list
  proposed_size     text,                         -- self_review: what the owner set
  proposed_impact   smallint,
  confirmed_size    text,                         -- self_review: what the manager confirmed
  confirmed_impact  smallint,
  decided_by        text,
  decided_at        timestamptz,
  decision_comment  text,
  created_at        timestamptz not null,
  extra             jsonb not null default '{}',
  updated_at        timestamptz not null default now()
);
create index on public.approvals (status);

-- ---------- 3. Daily SOW & time off ------------------------------------
create table public.sow_days (
  id                 text primary key,
  user_id            text not null references public.users(id),
  sow_date           date not null,
  top3_item_ids      text[] not null default '{}',   -- ranked plan for this day
  status             text,                            -- on_time | late | missed
  submitted_at       timestamptz,
  planned_at         timestamptz,
  missed_penalized   boolean,
  drop_reasons       jsonb,                           -- { item_id: reason } for dropped overdue tasks
  extra              jsonb not null default '{}',
  updated_at         timestamptz not null default now()
);
create index on public.sow_days (user_id, sow_date);

create table public.sow_entries (                 -- one outcome per task in a SOW
  id           text primary key,                  -- "<sow_day_id>:<position>"
  sow_day_id   text not null references public.sow_days(id) on delete cascade,
  position     int not null,
  item_id      text,
  outcome      text not null,                     -- done | progress | not_touched
  reason_code  text,
  comment      text,
  pickup_date  date,
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create table public.off_days (
  id          text primary key,
  user_id     text not null references public.users(id),
  off_date    date not null,
  code        text not null,                      -- Planned leave, Sick-Health, … Other
  reason      text,
  created_at  timestamptz,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.holidays (
  id            text primary key,                 -- the date, YYYY-MM-DD
  holiday_date  date not null unique,
  name          text not null,
  extra         jsonb not null default '{}',
  updated_at    timestamptz not null default now()
);

-- ---------- 4. Scoring --------------------------------------------------
create table public.score_events (
  id              text primary key,
  user_id         text not null references public.users(id),
  item_id         text,
  type            text not null,                  -- task, late, extension, sow_missed, streak, …
  code            text,                           -- R1–R9 / P1–P11 from the canvas
  points          numeric not null,
  note            text,
  policy_version  text,
  is_trial        boolean not null default false,
  reversed        boolean not null default false,
  is_early        boolean,
  is_on_time      boolean,
  impact          smallint,
  rating          smallint,
  created_at      timestamptz not null,
  extra           jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);
create index on public.score_events (user_id, created_at);

create table public.appeals (
  id              text primary key,
  score_event_id  text references public.score_events(id),
  user_id         text not null references public.users(id),
  reason          text not null,
  review_month    date,
  status          text not null,                  -- open | adjusted | declined
  outcome         text,
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz,
  extra           jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);

create table public.policy_versions (             -- every Policy & Scoring change
  id              text primary key,
  setting_key     text not null,
  old_value       jsonb,
  new_value       jsonb,
  effective_from  timestamptz not null,
  changed_by      text,
  changed_at      timestamptz not null,
  extra           jsonb not null default '{}',
  updated_at      timestamptz not null default now()
);

-- ---------- 5. Streams, KPIs, recurring ---------------------------------
create table public.kpis (
  id           text primary key,
  item_id      text not null references public.work_items(id),   -- the cycle
  name         text not null,
  target       numeric,
  unit         text,
  direction    text check (direction in ('>=','<=')),
  aggregation  text,                                -- sum | latest
  source       text default 'manual',               -- manual | meta | zoho (Phase 3 auto-pull); empty = manual
  source_metric text,                               -- e.g. leads, cpl, deals_won
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create table public.kpi_actuals (                 -- Saturday entries
  id           text primary key,
  kpi_id       text not null references public.kpis(id) on delete cascade,
  position     int not null,
  week_of      date,
  value        numeric not null,
  source_link  text,
  entered_by   text,
  entered_at   timestamptz,
  verified_by  text,
  is_auto      boolean,                             -- filled in by the daily pull
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create table public.recurring_rules (
  id                  text primary key,
  title               text,
  owner_id            text references public.users(id),
  creator_id          text references public.users(id),
  frequency           text not null,              -- daily | weekly | monthly | quarterly | custom
  every_days          int,
  due_after_days      int,
  next_run_at         timestamptz,
  is_active           boolean not null default true,
  consecutive_misses  int not null default 0,
  template            jsonb,                      -- task fields copied into each occurrence
  created_at          timestamptz,
  extra               jsonb not null default '{}',
  updated_at          timestamptz not null default now()
);

-- ---------- 6. Messages ---------------------------------------------------
create table public.notifications (               -- Slack DMs / digest items
  id          text primary key,
  user_id     text not null references public.users(id),
  item_id     text,
  approval_id text,                               -- for Approve / Reject buttons
  message     text not null,
  mode        text not null,                      -- instant | digest
  kind        text,
  buttons     text[] not null default '{}',
  is_read     boolean not null default false,
  created_at  timestamptz not null,
  deliver_at  timestamptz,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
create index on public.notifications (user_id, deliver_at);

create table public.channel_posts (               -- #credits-where-credits-due, announcements
  id          text primary key,
  channel     text not null,
  message     text not null,
  created_at  timestamptz not null,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ---------- 7. App bookkeeping -----------------------------------------
create table public.system_flags (                -- "already sent / already penalised" markers
  id          text primary key,
  set_at      timestamptz,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.id_sequences (                -- last number used per task-ID prefix
  id           text primary key,                  -- the prefix, e.g. MKT
  last_number  int not null default 0,
  extra        jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);

create table public.matrix_overrides (            -- Eisenhower drag overrides (own view only)
  id          text primary key,                   -- "<user_id>:<item_id>"
  user_id     text not null references public.users(id),
  item_id     text not null,
  quadrant    text not null,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

create table public.app_lease (                   -- which open browser runs the system jobs
  id          text primary key,
  client_id   text,
  held_until  timestamptz,
  extra       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ---------- 8. Access: company Google accounts only ---------------------
create or replace function public.hb_is_member() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@hbplus.fit', false)   -- <<< company domain
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'verticals','roles','users','user_verticals','user_roles','work_items','checklist_items','item_links',
    'comments','approvals','sow_days','sow_entries','off_days','holidays','score_events','appeals',
    'policy_versions','kpis','kpi_actuals','recurring_rules','notifications','channel_posts',
    'system_flags','id_sequences','matrix_overrides','app_lease'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "company members" on public.%I for all to authenticated using (public.hb_is_member()) with check (public.hb_is_member())', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Activity log: read and add only — never edited or deleted (PRD F4).
alter table public.activity_log enable row level security;
create policy "company members read" on public.activity_log for select to authenticated using (public.hb_is_member());
create policy "company members add" on public.activity_log for insert to authenticated with check (public.hb_is_member());
alter publication supabase_realtime add table public.activity_log;

-- ---------- 9. Slack (server only — no access for browsers) ------------
create table if not exists public.slack_users (       -- HB+ user ↔ Slack account, matched by email
  user_id     text primary key,
  slack_id    text,
  email       text,
  checked_at  timestamptz not null default now()
);
create table if not exists public.slack_deliveries (  -- which notifications / posts were sent to Slack
  id            text primary key,                    -- notification id, or "post:<channel post id>"
  kind          text not null,                       -- dm | digest | channel | skipped
  user_id       text,
  slack_channel text,
  slack_ts      text,
  sent_at       timestamptz not null default now()
);
alter table public.slack_users enable row level security;
alter table public.slack_deliveries enable row level security;
