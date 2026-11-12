-- Upgrade for a database created with the earlier schema.sql (keeps your data).
-- Adds the columns for the pilot setup sprint and size & impact confirmation.
alter table public.work_items add column if not exists setup_batch boolean;
alter table public.work_items add column if not exists size_confirmed_by text;
alter table public.approvals add column if not exists setup_item_ids text[];
alter table public.approvals add column if not exists proposed_size text;
alter table public.approvals add column if not exists proposed_impact smallint;
alter table public.approvals add column if not exists confirmed_size text;
alter table public.approvals add column if not exists confirmed_impact smallint;
