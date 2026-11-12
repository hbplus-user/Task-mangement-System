-- OPTIONAL — only for trying the app before Google sign-in works.
-- Lets anyone holding the app's public key read and write the HB+ tables.
-- Remove it (block at the bottom) before real company data goes in.
-- Pair with VITE_DEMO_LOGIN=true in .env.local.
do $$
declare t text;
begin
  foreach t in array array[
    'verticals','roles','users','user_verticals','user_roles','work_items','checklist_items','item_links',
    'comments','approvals','sow_days','sow_entries','off_days','holidays','score_events','appeals',
    'policy_versions','kpis','kpi_actuals','recurring_rules','notifications','channel_posts',
    'system_flags','id_sequences','matrix_overrides','app_lease'
  ] loop
    execute format('drop policy if exists "demo access" on public.%I', t);
    execute format('create policy "demo access" on public.%I for all to anon using (true) with check (true)', t);
  end loop;
  drop policy if exists "demo read" on public.activity_log;
  drop policy if exists "demo add" on public.activity_log;
  create policy "demo read" on public.activity_log for select to anon using (true);
  create policy "demo add" on public.activity_log for insert to anon with check (true);
end $$;

-- To remove demo access later:
-- do $$ declare t text; begin
--   foreach t in array array['verticals','roles','users','user_verticals','user_roles','work_items','checklist_items','item_links','comments','approvals','sow_days','sow_entries','off_days','holidays','score_events','appeals','policy_versions','kpis','kpi_actuals','recurring_rules','notifications','channel_posts','system_flags','id_sequences','matrix_overrides','app_lease'] loop
--     execute format('drop policy if exists "demo access" on public.%I', t);
--   end loop;
--   drop policy if exists "demo read" on public.activity_log;
--   drop policy if exists "demo add" on public.activity_log;
-- end $$;
