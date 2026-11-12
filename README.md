# HB+ Tasks

Internal task, ownership and daily SOW app, built from **PRD v1.0**, the **Rewards & Penalties canvas (FINAL v1.0)** and the **HB+ brand guidelines** (official palette only; colours are set once in `src/styles.css`). React + Vite, with Supabase for the database, Google sign-in and the scheduled server job.

## Run it locally

```bash
npm install
npm run dev               # http://localhost:5173
npm run build             # production build in dist/
npm run build:function    # rebuilds the server functions (hb-tick, hb-slack, hb-kpi)
```

Settings live in `.env.local` (copy `.env.example`): Supabase URL and anon key, `VITE_COMPANY_DOMAIN` (`hbplus.fit`), and optional `VITE_ADOBE_FONTS_KIT`. With no anon key, the app runs in **Local mode** (browser only, demo team, avatar menu to switch people).

## Going live — checklist

Run the SQL files in Supabase → **SQL Editor** → New query → paste → Run.

### 1. Database
- **New project:** run `supabase/schema.sql`, then `supabase/guards.sql`.
  - ⚠ `schema.sql` drops and recreates every HB+ table. Only run it again for a completely clean start.
- **Database already created** with the earlier schema: run `supabase/migrations/002_setup_sprint_columns.sql`, then `supabase/guards.sql`. Both keep your data.
- The company domain (`hbplus.fit`) is set in `public.hb_is_member()` in `schema.sql`. It must match `VITE_COMPANY_DOMAIN`.
- Check that the project's region is **Mumbai (ap-south-1)** and that **daily backups** are on (paid plans). Both are PRD must-haves.

### 2. Google sign-in
1. Supabase → Authentication → Providers → **Google**: turn it on and add the OAuth client ID and secret (from Google Cloud Console).
2. Authentication → URL Configuration: add every app address to **Redirect URLs** (`http://localhost:5173`, `http://localhost:5199`, and the live address from step 4).
3. First sign-in on an empty database shows **Start fresh** (you become the first Founder) or **Load demo data**.

### 3. Server job (nudges, penalties, auto-accept — even when nobody is online)
1. **Deploy the function** `hb-tick`. Pick one:
   - **Dashboard:** Edge Functions → Deploy a new function → name it `hb-tick` → paste all of `supabase/functions/hb-tick/index.ts` → Deploy. Then open the function's settings and turn **off** "Enforce JWT verification".
   - **CLI:** `npx supabase login`, then `npx supabase functions deploy hb-tick --project-ref dbljeylvmngihvlltydj`. `supabase/config.toml` already turns JWT verification off.
2. **Add the secret.** Edge Functions → Secrets → add `HB_CRON_SECRET`. Its value is the `x-cron-secret` string inside `supabase/cron.sql`.
3. **Schedule it:** run `supabase/cron.sql`. The job runs every 5 minutes.
4. **Check it:** `select * from cron.job_run_details order by start_time desc limit 5;` should show `succeeded`.

While the server job is running, browsers don't run the system jobs. If the schedule ever stops, an open browser takes over after about 10 minutes.

### 3b. Slack (PRD §11)
1. **Create the Slack app** at api.slack.com/apps → From a manifest → paste `slack/manifest.yml`. Then install it to the workspace.
2. **Add Supabase secrets** (Edge Functions → Secrets):
   - `SLACK_BOT_TOKEN` (`xoxb-…`)
   - `SLACK_SIGNING_SECRET`
   - `HB_APP_URL`: the app's address, used for the "Open in app" buttons, for example `https://tasks.hbplus.fit` or `http://localhost:5173` while testing.
3. **Run** `supabase/migrations/003_slack.sql`.
4. **Deploy the function** `hb-slack`: paste `supabase/functions/hb-slack/index.ts`, then turn **off** "Enforce JWT verification". Slack's requests are checked with the signing secret instead.
5. **Re-run** `supabase/cron.sql`. This adds the every-minute Slack delivery.
6. **Create the channels** `#credits-where-credits-due` and `#hb-announcements` (public), or rename them in `COMPANY` in `src/engine/policy.js`.

What it does:
- **DMs:** every notification arrives as a Slack DM within a minute, with quiet hours (9 PM–8 AM) and the 7 PM digest.
- **Buttons:** Accept · Decline · Update progress · Request extension · I'm blocked · Submit · Review · Unblock · Approve · Reject. Each opens a pop-up with the required comment and runs the same rules as the app. Old buttons show "Already done by X".
- **Fill SOW / Open in app:** these buttons open the app.
- **Creating tasks:** `/task` (or `/task <title>`) and the "Create HB+ task" message shortcut open the full **New** form, same as the app: Task, Sub-task, Project, Stream or Recurring task, with owner, vertical, deadline + time, parent project/task, key prefix, size, impact + reason, estimated hours, progress method (+ checklist), repeats, cycle length + KPIs (with Meta/Zoho source), description, reference links, contributors, linked goals, Private and Pin. The fields change with the type; problems show under the field, and if the rules refuse it (e.g. deadline after the parent's) the form comes back with the reason and your entries kept.
- **`/task` commands:**
  - `/task MKT-14` opens a task card with only the actions you're allowed: **Mark complete** (proof link → reviewer rates it), **Reassign**, Update progress, Request extension, I'm blocked, Accept, Review.
  - **Reassign** offers "Make them the owner" (they accept; approval when needed, per the PRD) or "Give them a part" (you stay owner).
  - `/task bulk` opens a form with one section per task — title, description, owner, deadline, size, impact and reason. Starts with 3, "+ Add another task" goes up to 10 (`/task bulk 5` opens 5). Empty sections are skipped.
  - `/task help` lists all of this.
- **Home tab:** today's top 3 and the "Waiting on you" count.
- **Monthly post:** top performers are posted to #credits-where-credits-due.
- **Matching people:** Slack users are matched by email, so each person's Slack email must equal their HB+ email.
- **First run:** the function marks the existing backlog as sent, so nobody gets flooded.

### 3c. Phase 2 & 3 (SOW in Slack · goals · reviews · KPI auto-pull)
1. **SQL Editor:** run `supabase/migrations/004_goals_reviews_kpi_sources.sql`. Run it after `guards.sql`; it keeps your data.
2. **Re-deploy** `hb-tick` and `hb-slack` with the latest `supabase/functions/*/index.ts` files.
3. **Deploy the new function `hb-kpi`** (paste `supabase/functions/hb-kpi/index.ts`) and turn **off** JWT verification.
4. **Re-run `supabase/cron.sql`.** It adds the daily 9 AM KPI pull.
5. **Optional: connect the data sources** (Edge Functions → Secrets). Without them, KPIs stay "entered by hand".
   - **Meta Ads:** `META_ACCESS_TOKEN` (a System User token with `ads_read`, from Meta Business Settings → System users) and `META_AD_ACCOUNT_ID` (the number after `act_`).
   - **Zoho CRM** (India data centre): create a *Self Client* at api-console.zoho.in with the scopes `ZohoCRM.coql.READ,ZohoCRM.modules.leads.READ,ZohoCRM.modules.deals.READ`. Exchange the code for a refresh token, then add `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` and `ZOHO_REFRESH_TOKEN`. Optional: `ZOHO_ACCOUNTS_DOMAIN` (default `accounts.zoho.in`) and `ZOHO_API_DOMAIN` (default `www.zohoapis.in`).
6. **Link KPIs to a source:** when creating a stream, pick each KPI's source (for example "Meta Ads · Cost per lead"). New cycles copy the source.

What you get:
- **Daily SOW in Slack (Phase 2):** **Fill SOW** in the nudge DM or on the Home tab opens a two-step pop-up.
  - Step 1: Done (proof link) / Progress (stage + pick-up) / Not touched (reason + comment).
  - Step 2: tomorrow's top 3.
  - Same rules as the app: on time / late / missed, streaks and points.
- **Goals (Phase 3):** top goals, behaviour/skill, health, extra initiatives and KPIs.
  - Each goal has a period, target, weight and check-ins.
  - Health goals are always private.
  - Tasks can be linked to goals.
- **Reviews (Phase 3):** a manager picks a person and a period and sees one summary: Delivery Score, goals, behaviour, stream KPIs and SOW compliance, with weights in Policy & Scoring (health isn't counted by default).
  - The manager adds a 1–5 rating, strengths and one area to grow, then shares it. The person reads and acknowledges.
  - Export as CSV or PDF.
- **Privacy:** goals and reviews follow the PRD rule (self, your managers, founders and admins), enforced by the database. People never see draft reviews and can't edit their own.
- **KPI auto-pull (Phase 3):** every morning at 9 AM the weekly numbers are fetched for the current stream cycle.
  - Leads and spend: one number per week. Cost per lead: cycle-to-date.
  - Numbers are marked "(auto)". A number someone enters by hand for that week wins.
  - The manager still verifies at cycle end. If a source fails, the stream owner gets one message that day.

### 4. Hosting (static site)
Any static host works. The app uses `#/` links, so no rewrite rules are needed. For example, on **Vercel** or **Netlify**:
- Import the project folder (or a Git repo of it).
- Build command `npm run build`, output folder `dist`.
- Add the environment variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_COMPANY_DOMAIN` and `VITE_DEMO_LOGIN=false`.
- Deploy, then add the live address to Supabase Redirect URLs (step 2).

It installs as an app on phones (PWA): open the site, then choose *Add to Home Screen*.

### 5. Pilot
- **Admin → Policy & Scoring:**
  - turn on **Setup sprint open**: everyone sees a banner, enters their current open tasks on **Setup sprint**, and their main manager approves the list;
  - turn on **Trial mode** for the 4-week pilot (scores visible, not counted for rewards).
- **Brand fonts** (HB+ brand guidelines): The Seasons (titles), Gilroy (all text) and Astralaga Bold (small headings). Put the licensed files in `public/fonts/` (see `public/fonts/README.txt`) or set an Adobe Fonts kit ID.

## How the data is protected
- **Only company accounts:** only signed-in `@hbplus.fit` accounts can read or write anything.
- **Database guards** (`supabase/guards.sql`) — the database itself refuses:
  - changing users, roles, verticals, holidays or policy without that ability;
  - promoting anyone to Founder/Admin unless you are one;
  - editing someone else's profile;
  - rewriting points (only the "reversed" flag may change on reopen);
  - moving a task's original deadline;
  - deciding appeals or adding score adjustments unless you're a Founder/Admin;
  - deleting history (tasks, comments, approvals, SOWs, scores, policy) unless you're a Founder/Admin.
- **Activity log:** add-only. It can never be edited or deleted.
- **Time zone:** all times are India Standard Time on every device and on the server.
- **Still checked only by the app:** the finer task rules (who may accept, submit or review a task). Moving every action onto the server is the remaining hardening step.
- **Edit conflicts:** if two people edit the same task at the same moment, the last save wins.

## Where things are

| PRD section | Where |
|---|---|
| §5 Lifecycle, §6 rules, permission matrix, setup sprint | `src/engine/actions.js` |
| §7 Daily SOW, top-3 ranking, off days | `src/engine/sow.js`, `src/views/Sow.jsx` |
| §8 Scoring, canvas R1–R9 / P1–P11, tiers, badges, winners | `src/engine/scoring.js` |
| §10 Notifications, system follow-ups | `src/engine/tick.js`, `server/hb-tick.js` (scheduled) |
| Every "(setting)" number | `src/engine/policy.js`, editable in Admin → Policy & Scoring from an effective date |
| §9 Screens | `src/views/*` |
| Database tables, guards, schedule | `supabase/*.sql` |
| Demo data | `src/engine/seed.js` |

## Not built yet
Everything in PRD v1.0 is built, including Phase 2 (SOW in Slack) and Phase 3 (goals, reviews, KPI auto-pull).
- **Phase 3:** goals, auto-pull of KPIs from Zoho CRM / Meta Ads.
