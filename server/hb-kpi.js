// Phase 3: pulls stream KPI actuals from Meta Ads and Zoho CRM every morning (PRD §6:
// "KPI actuals entered every Saturday … Phase 3: auto-pull from Zoho CRM / Meta Ads").
// Runs as the Supabase Edge Function `hb-kpi`. The manager still verifies at cycle end.
import { createClient } from '@supabase/supabase-js';
import * as sync from '../src/lib/sync.js';
import { children, uid, notify, once, firstName } from '../src/engine/core.js';
import { cycleAchievement } from '../src/engine/actions.js';
import { clock, now, startOfWeek, dateKey, DAY } from '../src/lib/time.js';

const round2 = (n) => Math.round(n * 100) / 100;

/* ---------- Meta Ads (Marketing API · Insights) ---------- */
export function makeMeta({ token, account, version = 'v19.0', fetchFn = fetch }) {
  const acct = String(account).startsWith('act_') ? account : `act_${account}`;
  return async (metric, fromKey, toKey) => {
    const url = `https://graph.facebook.com/${version}/${acct}/insights?${new URLSearchParams({
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since: fromKey, until: toKey }),
      level: 'account',
      access_token: token,
    })}`;
    const j = await (await fetchFn(url)).json();
    if (j.error) throw new Error(`Meta Ads: ${j.error.message}`);
    const row = j.data?.[0] || {};
    const spend = +row.spend || 0;
    const impressions = +row.impressions || 0;
    const clicks = +row.clicks || 0;
    const acts = row.actions || [];
    const lead = acts.find((a) => a.action_type === 'lead') || acts.find((a) => /lead/.test(a.action_type));
    const leads = lead ? +lead.value : 0;
    const values = { spend, impressions, clicks, leads, ctr: impressions ? (clicks / impressions) * 100 : 0, cpl: leads ? spend / leads : null };
    if (!(metric in values)) throw new Error(`Meta Ads: unknown metric "${metric}"`);
    const v = values[metric];
    return { value: v == null ? null : round2(v), link: `https://adsmanager.facebook.com/adsmanager/reporting/view?act=${acct.slice(4)}` };
  };
}

/* ---------- Zoho CRM (COQL) ---------- */
export function makeZoho({ clientId, clientSecret, refreshToken, accountsDomain = 'accounts.zoho.in', apiDomain = 'www.zohoapis.in', fetchFn = fetch }) {
  let token = null;
  const auth = async () => {
    if (token) return token;
    const r = await fetchFn(`https://${accountsDomain}/oauth/v2/token?${new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' })}`, { method: 'POST' });
    const j = await r.json();
    if (!j.access_token) throw new Error(`Zoho sign-in failed: ${j.error || 'no access token'}`);
    token = j.access_token;
    return token;
  };
  const coql = async (query) => {
    const t = await auth();
    const r = await fetchFn(`https://${apiDomain}/crm/v5/coql`, { method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ select_query: query }) });
    if (r.status === 204) return [];
    const j = await r.json();
    if (j.status === 'error' || (j.code && !j.data)) throw new Error(`Zoho CRM: ${j.message || j.code}`);
    return j.data || [];
  };
  const firstNumber = (row) => {
    const v = row && Object.values(row).find((x) => x !== null && !isNaN(+x));
    return v == null ? 0 : +v;
  };
  return async (metric, fromKey, toKey) => {
    const t1 = `'${fromKey}T00:00:00+05:30'`;
    const t2 = `'${toKey}T23:59:59+05:30'`;
    const queries = {
      leads_created: `select COUNT(id) from Leads where Created_Time between ${t1} and ${t2}`,
      deals_created: `select COUNT(id) from Deals where Created_Time between ${t1} and ${t2}`,
      deals_won: `select COUNT(id) from Deals where Stage = 'Closed Won' and Closing_Date between '${fromKey}' and '${toKey}'`,
      won_amount: `select SUM(Amount) from Deals where Stage = 'Closed Won' and Closing_Date between '${fromKey}' and '${toKey}'`,
    };
    if (!queries[metric]) throw new Error(`Zoho CRM: unknown metric "${metric}"`);
    const data = await coql(queries[metric]);
    return { value: round2(firstNumber(data[0])), link: `https://crm.zoho.in/crm/` };
  };
}

/* ---------- The daily pull ---------- */
// providers: { meta: fn, zoho: fn } — each fn(metric, fromDateKey, toDateKey) → { value, link }
export async function runKpiPull(client, providers, at = Date.now()) {
  sync.useClient(client);
  clock.offset = 0;
  const s = await sync.loadAll();
  if (!s) return { ok: true, skipped: 'No users yet' };
  const results = [];
  const thisWeek = startOfWeek(at);
  for (const stream of s.items.filter((i) => i.type === 'stream' && !['closed', 'cancelled'].includes(i.status))) {
    const cycle = children(s, stream.id)
      .filter((c) => c.type === 'cycle' && !c.verified && c.cycleStart <= at)
      .sort((a, b) => b.cycleStart - a.cycleStart)[0];
    if (!cycle) continue;
    for (const k of s.kpis.filter((x) => x.itemId === cycle.id && x.source && x.source !== 'manual')) {
      const get = providers[k.source];
      if (!get) {
        results.push({ kpi: k.name, skipped: `${k.source} is not connected` });
        continue;
      }
      // "sum" KPIs (leads, spend…) get one number per week; refresh last week too so its last days are counted.
      // "latest" KPIs (cost per lead…) are cycle-to-date.
      const weeks = k.agg === 'latest' ? [thisWeek] : [thisWeek - 7 * DAY, thisWeek];
      for (const wk of weeks) {
        const from = k.agg === 'latest' ? cycle.cycleStart : Math.max(wk, cycle.cycleStart);
        const to = Math.min(k.agg === 'latest' ? at : wk + 6 * DAY, at, cycle.currentDeadline);
        if (to < from) continue;
        const weekOf = dateKey(wk);
        if (k.actuals.some((a) => a.weekOf === weekOf && !a.auto)) {
          results.push({ kpi: k.name, weekOf, skipped: 'entered by hand' });
          continue;
        }
        try {
          const { value, link } = await get(k.sourceMetric, dateKey(from), dateKey(to));
          if (value == null) {
            results.push({ kpi: k.name, weekOf, skipped: 'no data yet' });
            continue;
          }
          const existing = k.actuals.find((a) => a.weekOf === weekOf && a.auto);
          if (existing) Object.assign(existing, { value, link, ts: now() });
          else k.actuals.push({ id: uid('v'), weekOf, value, link, by: 'auto', ts: now(), verifiedBy: null, auto: true });
          k.actuals.sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1));
          results.push({ kpi: k.name, weekOf, value });
        } catch (e) {
          results.push({ kpi: k.name, weekOf, error: e.message });
          if (once(s, `kpierr:${stream.id}:${dateKey(at)}`)) {
            notify(s, stream.ownerId, `Couldn't fetch the KPI numbers for *${stream.title}* this morning (${k.source === 'meta' ? 'Meta Ads' : 'Zoho CRM'}): ${e.message}. You can enter them by hand for now.`, { itemId: cycle.id, buttons: ['open'] });
          }
        }
      }
      cycle.lastUpdateAt = now();
      cycle.stage = Math.min(100, Math.round(cycleAchievement(s, cycle) * 100));
    }
  }
  const written = await sync.saveNow(s);
  return { ok: true, results, written };
}

/* ---------- Supabase Edge Function entry point (Deno) ---------- */
if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    const env = (k) => Deno.env.get(k);
    if (!env('HB_CRON_SECRET') || req.headers.get('x-cron-secret') !== env('HB_CRON_SECRET')) return new Response('Unauthorized', { status: 401 });
    const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY') || env('HB_SERVICE_KEY'), { auth: { persistSession: false } });
    const providers = {};
    if (env('META_ACCESS_TOKEN') && env('META_AD_ACCOUNT_ID')) providers.meta = makeMeta({ token: env('META_ACCESS_TOKEN'), account: env('META_AD_ACCOUNT_ID') });
    if (env('ZOHO_CLIENT_ID') && env('ZOHO_CLIENT_SECRET') && env('ZOHO_REFRESH_TOKEN')) {
      providers.zoho = makeZoho({
        clientId: env('ZOHO_CLIENT_ID'),
        clientSecret: env('ZOHO_CLIENT_SECRET'),
        refreshToken: env('ZOHO_REFRESH_TOKEN'),
        accountsDomain: env('ZOHO_ACCOUNTS_DOMAIN') || 'accounts.zoho.in',
        apiDomain: env('ZOHO_API_DOMAIN') || 'www.zohoapis.in',
      });
    }
    try {
      return Response.json(await runKpiPull(client, providers));
    } catch (e) {
      console.error(e);
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  });
}
export { firstName };
