-- Slack integration (keeps your data). Run in Supabase → SQL Editor.
alter table public.notifications add column if not exists approval_id text;

-- Server-only tables: row level security on and no policies, so browsers can't read them.
create table if not exists public.slack_users (
  user_id     text primary key,
  slack_id    text,
  email       text,
  checked_at  timestamptz not null default now()
);
create table if not exists public.slack_deliveries (
  id            text primary key,
  kind          text not null,
  user_id       text,
  slack_channel text,
  slack_ts      text,
  sent_at       timestamptz not null default now()
);
alter table public.slack_users enable row level security;
alter table public.slack_deliveries enable row level security;
