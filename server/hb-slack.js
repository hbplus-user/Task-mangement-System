// HB+ Tasks Slack app (PRD §11). Runs as the Supabase Edge Function `hb-slack`.
//  • Every minute (schedule): sends due notifications as DMs, the 7 PM digest and channel posts;
//    every 10 minutes it refreshes everyone's Home tab.
//  • Slack calls it for button clicks, pop-ups (modals), /task and the "Create HB+ task" shortcut.
// Every action runs through the same rules code as the app (src/engine), as the person who clicked.
import { createClient } from '@supabase/supabase-js';
import * as sync from '../src/lib/sync.js';
import { perform, decideApproval, createItem, allowedActions, canDecide, approvalsFor, createRecurringRule, FREQ_LABEL, KPI_SOURCES } from '../src/engine/actions.js';
import { potentialPoints } from '../src/engine/scoring.js';
import { GOAL_LABEL } from '../src/engine/goals.js';
import { itemById, nameOf, firstName, activeUsers, flagsOf, canSeeFull, progressOf, STATUS, userById, sharesVertical, managerOf, isFounder, isAbove, loadFor, SIZE_HOURS, DONE } from '../src/engine/core.js';
import { todaysTop3, eodItems, rankCandidates, nextWorkingKey, openSowDays, sowRequired, sowDayOf, offDayOf, submitSOW } from '../src/engine/sow.js';
import { P, COMPANY } from '../src/engine/policy.js';
import { clock, atTime, addDays, dateKey, fmtDT, fmtDate, parseKey, dueLabel, now, startOfWeek } from '../src/lib/time.js';

/* ---------- Slack API ---------- */
export function makeSlack(token) {
  return async (method, body = {}, get = false) => {
    const url = `https://slack.com/api/${method}` + (get ? `?${new URLSearchParams(body)}` : '');
    const r = await fetch(url, {
      method: get ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, ...(get ? {} : { 'Content-Type': 'application/json; charset=utf-8' }) },
      body: get ? undefined : JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) console.error('slack', method, j.error, JSON.stringify(j.response_metadata || ''));
    return j;
  };
}

// Checks the request really came from Slack (signing secret).
export async function verifySlack(headers, raw, secret) {
  const ts = headers.get('x-slack-request-timestamp');
  const sig = headers.get('x-slack-signature') || '';
  if (!ts || !secret || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`v0:${ts}:${raw}`)));
  const hex = 'v0=' + [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/* ---------- Helpers ---------- */
const cut = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');
const pt = (text) => ({ type: 'plain_text', text: cut(text, 75), emoji: true });
const md = (text) => ({ type: 'mrkdwn', text: cut(text, 2900) });
const link = (ctx, path) => (ctx.appUrl ? `${ctx.appUrl.replace(/\/$/, '')}/#${path}` : null);

// One change at a time: each action loads the latest data, applies the rule, and saves.
let chain = Promise.resolve();
const withLock = (fn) => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
};
async function loadState(ctx) {
  sync.useClient(ctx.client);
  clock.offset = 0;
  return sync.loadAll();
}
export function runAs(ctx, fn) {
  return withLock(async () => {
    const s = await loadState(ctx);
    if (!s) return { error: 'HB+ Tasks has not been set up yet.' };
    const r = fn(s);
    if (r && r.error) return r;
    await sync.saveNow(s);
    return { ...(r || {}), ok: true, s };
  });
}

/* ---------- Matching people (by email) ---------- */
export async function slackIdFor(ctx, user) {
  const { data } = await ctx.client.from('slack_users').select('*').eq('user_id', user.id).maybeSingle();
  if (data && (data.email || '').toLowerCase() === user.email.toLowerCase() && (data.slack_id || Date.now() - Date.parse(data.checked_at) < 86400000)) return data.slack_id;
  const r = await ctx.slack('users.lookupByEmail', { email: user.email }, true);
  const sid = r.ok ? r.user.id : null;
  await ctx.client.from('slack_users').upsert({ user_id: user.id, slack_id: sid, email: user.email.toLowerCase(), checked_at: new Date().toISOString() });
  return sid;
}
export async function hbUserForSlack(ctx, slackId) {
  const { data, error } = await ctx.client.from('slack_users').select('*').eq('slack_id', slackId).maybeSingle();
  if (error) throw new Error(`database (slack_users): ${error.message}`);
  if (data) return data.user_id;
  const r = await ctx.slack('users.info', { user: slackId }, true);
  const email = r.ok ? (r.user?.profile?.email || '').toLowerCase() : '';
  console.log('hb-slack: Slack user', slackId, 'email', email || `(none — ${r.error || 'email hidden; check the users:read.email scope'})`);
  if (!email) return null;
  const { data: u, error: e2 } = await ctx.client.from('users').select('*').eq('email', email).maybeSingle();
  if (e2) throw new Error(`database (users): ${e2.message}`);
  if (!u || u.status === 'inactive') return null;
  await ctx.client.from('slack_users').upsert({ user_id: u.id, slack_id: slackId, email, checked_at: new Date().toISOString() });
  return u.id;
}

/* ---------- DM layout ---------- */
const BTN = {
  accept: ['Accept', 'primary'],
  decline: ['Decline'],
  update: ['Update progress'],
  extension: ['Request extension'],
  block: ["I'm blocked"],
  submit: ['Submit', 'primary'],
  review: ['Review', 'primary'],
  unblock: ['Unblock', 'primary'],
  approve: ['Approve', 'primary'],
  reject: ['Reject', 'danger'],
};
export function dmBlocks(ctx, n, title) {
  const blocks = [{ type: 'section', text: md(n.message) }];
  const els = [];
  for (const key of n.buttons || []) {
    if (key === 'open') {
      const url = link(ctx, n.item_id ? `/task/${n.item_id}` : n.approval_id ? '/approvals' : '/sow');
      if (url) els.push({ type: 'button', action_id: 'open_link', text: pt('Open in app'), url });
    } else if (key === 'sow') {
      els.push({ type: 'button', action_id: 'sow_fill', text: pt('Fill SOW'), style: 'primary', value: '{}' });
      const url = link(ctx, '/sow?eod=1');
      if (url) els.push({ type: 'button', action_id: 'sow_link', text: pt('Open in app'), url });
    } else if (BTN[key]) {
      const [label, style] = BTN[key];
      els.push({ type: 'button', action_id: key, text: pt(label), ...(style ? { style } : {}), value: JSON.stringify({ n: n.id, i: n.item_id, a: n.approval_id, t: cut(title || '', 60) }) });
    }
  }
  if (els.length) blocks.push({ type: 'actions', block_id: 'hb_buttons', elements: els.slice(0, 25) });
  return blocks;
}
const plain = (t) => (t || '').replace(/\*/g, '');

/* ---------- Delivery (runs every minute) ---------- */
export async function deliver(ctx, { publishHome = false } = {}) {
  const nowIso = new Date().toISOString();
  const since = new Date(Date.now() - 2 * 86400000).toISOString();
  const notes = (await ctx.client.from('notifications').select('*').lte('deliver_at', nowIso).gte('created_at', since).order('created_at').range(0, 499)).data || [];
  const posts = (await ctx.client.from('channel_posts').select('*').gte('created_at', since).order('created_at').range(0, 99)).data || [];
  const ids = [...notes.map((n) => n.id), ...posts.map((p) => `post:${p.id}`)];
  if (!ids.length) return { sent: 0 };
  const done = (await ctx.client.from('slack_deliveries').select('id').in('id', ids)).data || [];
  const doneSet = new Set(done.map((d) => d.id));
  const record = (rows) => (rows.length ? ctx.client.from('slack_deliveries').upsert(rows.map((r) => ({ sent_at: nowIso, ...r }))) : null);

  // First run ever: don't flood people with the backlog.
  const anyRow = (await ctx.client.from('slack_deliveries').select('id').range(0, 0)).data || [];
  if (!anyRow.length) {
    await record(ids.map((id) => ({ id, kind: 'skipped' })));
    return { backfilled: ids.length };
  }

  const todo = notes.filter((n) => !doneSet.has(n.id));
  const userIds = [...new Set(todo.map((n) => n.user_id))];
  const users = userIds.length ? (await ctx.client.from('users').select('*').in('id', userIds)).data || [] : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const itemIds = [...new Set(todo.map((n) => n.item_id).filter(Boolean))];
  const items = itemIds.length ? (await ctx.client.from('work_items').select('*').in('id', itemIds)).data || [] : [];
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const sidCache = new Map();
  const sidOf = async (uid) => {
    if (!sidCache.has(uid)) {
      const u = userMap.get(uid);
      sidCache.set(uid, u && u.status !== 'inactive' ? await slackIdFor(ctx, u) : null);
    }
    return sidCache.get(uid);
  };
  let sent = 0;
  const rows = [];

  for (const n of todo.filter((x) => x.mode !== 'digest')) {
    const sid = await sidOf(n.user_id);
    if (!sid) {
      rows.push({ id: n.id, kind: 'skipped', user_id: n.user_id });
      continue;
    }
    const r = await ctx.slack('chat.postMessage', { channel: sid, text: plain(n.message), blocks: dmBlocks(ctx, n, titles.get(n.item_id)), unfurl_links: false });
    if (r.ok) {
      sent++;
      rows.push({ id: n.id, kind: 'dm', user_id: n.user_id, slack_channel: r.channel, slack_ts: r.ts });
    }
  }
  // 7 PM digest: one message per person.
  const digests = {};
  for (const n of todo.filter((x) => x.mode === 'digest')) (digests[n.user_id] = digests[n.user_id] || []).push(n);
  for (const [uid, list] of Object.entries(digests)) {
    const sid = await sidOf(uid);
    if (!sid) {
      list.forEach((n) => rows.push({ id: n.id, kind: 'skipped', user_id: uid }));
      continue;
    }
    const lines = list.slice(0, 30).map((n) => `• ${n.message}`).join('\n');
    const more = list.length > 30 ? `\n…and ${list.length - 30} more in the app.` : '';
    const url = link(ctx, '/tasks');
    const blocks = [{ type: 'header', text: pt('Your evening digest 🌇') }, { type: 'section', text: md(lines + more) }];
    if (url) blocks.push({ type: 'actions', elements: [{ type: 'button', action_id: 'open_link', text: pt('Open HB+ Tasks'), url }] });
    const r = await ctx.slack('chat.postMessage', { channel: sid, text: `Your evening digest (${list.length} updates)`, blocks, unfurl_links: false });
    if (r.ok) sent++;
    list.forEach((n) => rows.push({ id: n.id, kind: r.ok ? 'digest' : 'skipped', user_id: uid, slack_channel: r.channel, slack_ts: r.ts }));
  }
  // Channel posts (#credits-where-credits-due, announcements).
  for (const p of posts.filter((x) => !doneSet.has(`post:${x.id}`))) {
    const channel = (p.channel === 'credits' ? COMPANY.creditsChannel : COMPANY.announceChannel).replace(/^#/, '');
    const r = await ctx.slack('chat.postMessage', { channel, text: p.message });
    if (r.ok) sent++;
    rows.push({ id: `post:${p.id}`, kind: r.ok ? 'channel' : 'skipped', slack_channel: r.channel, slack_ts: r.ts });
  }
  await record(rows);
  const homes = publishHome ? await publishHomes(ctx) : 0;
  return { sent, recorded: rows.length, homes };
}

/* ---------- Home tab ---------- */
export function homeView(ctx, s, uid) {
  const top = todaysTop3(s, uid).ids.map((id) => itemById(s, id)).filter(Boolean);
  const waiting =
    s.items.filter((i) => (i.status === 'awaiting' && i.ownerId === uid && !i.declined) || (i.status === 'in_review' && i.reviewerId === uid) || (i.status === 'blocked' && i.blockedBy === uid)).length +
    approvalsFor(s, uid).length;
  const blocks = [
    { type: 'header', text: pt(`Hi ${firstName(s, uid)} 🌿`) },
    { type: 'section', text: md(`*Today's top 3*`) },
  ];
  if (!top.length) blocks.push({ type: 'context', elements: [md('Nothing planned yet — pick your top 3 in tonight’s SOW.')] });
  top.forEach((i, n) => {
    const f = flagsOf(s, i);
    const flag = f.overdue ? ' · ⚠️ overdue' : f.atRisk ? ' · at-risk' : '';
    const url = link(ctx, `/task/${i.id}`);
    blocks.push({
      type: 'section',
      text: md(`*${n + 1}. ${i.title}*\n${i.key} · due ${dueLabel(i.currentDeadline)}${flag}`),
      ...(url ? { accessory: { type: 'button', action_id: `home_open_${n}`, text: pt('Open'), url } } : {}),
    });
  });
  blocks.push({ type: 'divider' }, { type: 'section', text: md(`*Waiting on you:* ${waiting}`) });
  const els = [];
  const appUrl = link(ctx, '/sow');
  els.push({ type: 'button', action_id: 'sow_fill', text: pt('Fill SOW'), style: 'primary', value: '{}' });
  if (appUrl) els.push({ type: 'button', action_id: 'home_app', text: pt('Open HB+ Tasks'), url: appUrl });
  if (els.length) blocks.push({ type: 'actions', elements: els });
  blocks.push({ type: 'context', elements: [md(`Updated ${fmtDT(now())} IST · /task to add a task`)] });
  return { type: 'home', blocks };
}
export async function publishHomes(ctx) {
  const s = await withLock(() => loadState(ctx));
  if (!s) return 0;
  let n = 0;
  for (const u of activeUsers(s)) {
    const sid = await slackIdFor(ctx, u);
    if (!sid) continue;
    const r = await ctx.slack('views.publish', { user_id: sid, view: homeView(ctx, s, u.id) });
    if (r.ok) n++;
  }
  return n;
}

/* ---------- Pop-ups (modals) ---------- */
const TITLE = { accept: 'Accept task', decline: 'Decline task', update: 'Update progress', extension: 'Request extension', block: "I'm blocked", submit: 'Submit for review', review: 'Review', unblock: 'Unblock', approve: 'Approve', reject: 'Reject' };
const opt = (text, value) => ({ text: pt(text), value: String(value) });
const input = (block_id, label, element, optional = false, hint) => ({ type: 'input', block_id, label: pt(label), element: { action_id: 'v', ...element }, optional, ...(hint ? { hint: pt(hint) } : {}) });

export function actionModal(key, v, meta) {
  const blocks = [{ type: 'context', elements: [md(`*${v.t || 'Task'}*`)] }];
  if (key === 'update') blocks.push(input('stage', 'Stage', { type: 'static_select', options: [opt('Started · 25%', 25), opt('Halfway · 50%', 50), opt('Almost done · 75%', 75)] }, true, 'Checklist tasks: tick items in the app.'));
  if (key === 'extension') {
    blocks.push(input('date', 'New deadline', { type: 'datepicker', initial_date: dateKey(addDays(now(), 2)) }));
    blocks.push(input('time', 'Time (IST)', { type: 'timepicker', initial_time: '18:30' }, true));
  }
  if (key === 'block') blocks.push(input('blocker', 'Blocked by', { type: 'users_select' }));
  if (key === 'submit') blocks.push(input('proof', 'Proof link', { type: 'plain_text_input', placeholder: pt('https://…') }, false, 'Google Doc, Drive, Canva… — no uploads, just the link.'));
  if (key === 'review') {
    blocks.push(input('decision', 'Decision', { type: 'radio_buttons', options: [opt('Accept', 'accept'), opt('Send back', 'send_back')], initial_option: opt('Accept', 'accept') }));
    blocks.push(input('rating', 'Quality (if accepting)', { type: 'static_select', options: [opt('★ Below standard', 1), opt('★★ As expected', 2), opt('★★★ Exceptional', 3)], initial_option: opt('★★ As expected', 2) }, true, 'A reason is needed for ★ and ★★★.'));
  }
  blocks.push(input('comment', 'Comment', { type: 'plain_text_input', multiline: true }, false, 'Every action needs a short comment.'));
  return {
    type: 'modal',
    callback_id: 'hb_action',
    private_metadata: JSON.stringify({ key, v, ...meta }),
    title: pt(TITLE[key] || 'HB+ Tasks'),
    submit: pt(key === 'reject' ? 'Reject' : key === 'decline' ? 'Decline' : 'Save'),
    close: pt('Cancel'),
    blocks,
  };
}
const infoModal = (title, text) => ({ type: 'modal', title: pt(title), close: pt('Close'), blocks: [{ type: 'section', text: md(text) }] });

export function readValues(values = {}) {
  const out = {};
  for (const [block, acts] of Object.entries(values)) {
    const a = acts.v || Object.values(acts)[0] || {};
    out[block] = a.selected_option?.value ?? a.selected_date ?? a.selected_time ?? a.selected_user ?? a.value ?? null;
  }
  return out;
}

/* ---------- Actions ---------- */
const ENGINE = { accept: 'accept', decline: 'decline', update: 'update', submit: 'submit', review: 'review', unblock: 'unblock', extension: 'request_extension', block: 'block' };
const DONE_LABEL = { accept: 'Accepted', decline: 'Declined', update: 'Progress updated', submit: 'Marked complete — sent for review', review: 'Reviewed', unblock: 'Unblocked', extension: 'Extension requested', block: 'Marked blocked', approve: 'Approved', reject: 'Rejected' };

function findApproval(s, uid, v) {
  if (v.a) return s.approvals.find((a) => a.id === v.a);
  return s.approvals.find((a) => a.itemId === v.i && a.status === 'pending' && canDecide(s, uid, a));
}
function stillAllowed(s, uid, key, v) {
  if (key === 'approve' || key === 'reject') {
    const ap = findApproval(s, uid, v);
    return !!ap && canDecide(s, uid, ap);
  }
  const item = itemById(s, v.i);
  return !!item && allowedActions(s, uid, item).includes(ENGINE[key]);
}
function whoDidIt(s, v) {
  const ap = v.a && s.approvals.find((a) => a.id === v.a);
  if (ap && ap.decidedBy) return firstName(s, ap.decidedBy);
  const last = s.activity.filter((a) => a.itemId === v.i && a.userId).sort((a, b) => b.ts - a.ts)[0];
  return last ? firstName(s, last.userId) : 'someone';
}
async function markMessage(ctx, meta, text) {
  if (!meta.channel || !meta.ts) return;
  const { data } = await ctx.client.from('slack_deliveries').select('*').eq('slack_ts', meta.ts).maybeSingle();
  const note = data ? (await ctx.client.from('notifications').select('*').eq('id', data.id).maybeSingle()).data : null;
  const blocks = [{ type: 'section', text: md(note?.message || ' ') }, { type: 'context', elements: [md(text)] }];
  await ctx.slack('chat.update', { channel: meta.channel, ts: meta.ts, text: plain(note?.message || text), blocks });
}
async function dm(ctx, slackUser, text) {
  await ctx.slack('chat.postMessage', { channel: slackUser, text });
}
// Runs background work; if anything fails, the person gets a DM with the reason (never a silent failure).
export const safely = (ctx, slackUser, what, fn) =>
  Promise.resolve()
    .then(fn)
    .catch(async (e) => {
      console.error(`hb-slack: ${what} failed`, e);
      try {
        await dm(ctx, slackUser, `Sorry — something went wrong while ${what}: ${e?.message || e}. Nothing was saved. Please try again, or use the app.`);
      } catch (e2) {
        console.error('hb-slack: could not send the error DM', e2);
      }
    });

// After a button opens its pop-up, check the action is still possible ("Already done by X").
export async function staleCheck(ctx, slackUser, key, v, viewId, meta) {
  const s = await withLock(() => loadState(ctx));
  if (!s) return;
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) {
    if (viewId) await ctx.slack('views.update', { view_id: viewId, view: infoModal('HB+ Tasks', "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.") });
    return;
  }
  if (stillAllowed(s, uid, key, v)) return;
  const who = whoDidIt(s, v);
  if (viewId) await ctx.slack('views.update', { view_id: viewId, view: infoModal('Already done', `This is already done by *${who}* — nothing more needed here.`) });
  await markMessage(ctx, meta, `✔️ Already done by ${who}`);
}

export async function runAction(ctx, slackUser, meta, vals) {
  const { key, v } = meta;
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  let blockedBy = null;
  if (key === 'block' && vals.blocker) blockedBy = await hbUserForSlack(ctx, vals.blocker);
  if (key === 'block' && !blockedBy) return dm(ctx, slackUser, "That person isn't on HB+ Tasks yet, so I couldn't mark the task blocked.");
  const comment = (vals.comment || '').trim();
  const r = await runAs(ctx, (s) => {
    if (!stillAllowed(s, uid, key, v)) return { error: `Already done by ${whoDidIt(s, v)}.` };
    if (key === 'approve' || key === 'reject') return decideApproval(s, uid, findApproval(s, uid, v).id, key === 'approve', comment);
    const payload = { comment };
    if (key === 'update' && vals.stage) payload.stage = +vals.stage;
    if (key === 'extension') payload.newDeadline = atTime(vals.date, vals.time || P(s, 'defaultDeadlineTime'));
    if (key === 'block') payload.blockedBy = blockedBy;
    if (key === 'submit') payload.proofLink = (vals.proof || '').trim();
    if (key === 'review') {
      payload.decision = vals.decision || 'accept';
      payload.rating = +(vals.rating || 2);
    }
    return perform(s, uid, v.i, ENGINE[key], payload);
  });
  if (r.error) {
    await dm(ctx, slackUser, `Couldn't save that on *${v.t || 'the task'}*: ${r.error}`);
    if (/^Already done/.test(r.error)) await markMessage(ctx, meta, `✔️ ${r.error}`);
    return r;
  }
  await markMessage(ctx, meta, `✅ ${DONE_LABEL[key] || 'Done'} by you — “${cut(comment, 120)}”`);
  if (!meta.ts) {
    const it = itemById(r.s, v.i);
    const extra = key === 'submit' && it ? ` ${firstName(r.s, it.reviewerId)} will review it.` : '';
    await dm(ctx, slackUser, `✅ ${DONE_LABEL[key] || 'Done'} — *${v.t}*.${extra}`);
  }
  return r;
}

/* ---------- /task: the full "New" form — same fields and rules as the app ---------- */
export const NEW_TYPES = [['task', 'Task'], ['subtask', 'Sub-task'], ['project', 'Project'], ['stream', 'Stream'], ['recurring', 'Recurring task']];
const PM_OPTS = [['stages', 'Stages'], ['checklist', 'Checklist'], ['subtasks', 'Sub-tasks']];
const CYCLES = [['weekly', 'Weekly'], ['fortnightly', 'Fortnightly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']];
const NEW_SIZE = [opt('S · ≤2 days', 'S'), opt('M · 3–10 days', 'M'), opt('L · >10 days', 'L')];
const NEW_IMPACT = [opt('1 · Low', 1), opt('3 · Medium', 3), opt('5 · Critical', 5)];
export const KPI_MAX = 4;
const pick = (list, v) => list.find((o) => o.value === String(v));
const opts = (pairs) => pairs.map(([v, l]) => opt(l, v));
const dated = (t) => ['task', 'subtask', 'project'].includes(t);
const hasPM = (t) => ['task', 'subtask', 'recurring'].includes(t);

export function newDefaults({ invoker, title = '', desc = '' } = {}) {
  return {
    type: 'task', title: cut(title, 150), desc: cut(desc, 2900), owner: invoker || null, vertical: null,
    date: dateKey(addDays(now(), 3)), time: null, parent: null, projKey: '', size: 'M', impact: '3', reason: '', est: '',
    pm: 'stages', checklist: '', freq: 'weekly', every: '7', first: dateKey(now()), dueAfter: '5', cycle: 'monthly',
    kpis: [{ name: '', dir: '>=', target: '', unit: '', src: 'manual' }], links: '', contributors: [], goals: [], flags: [],
  };
}

// Reads every field of the form. Fields not shown for the current type fall back to defaults.
export function readNewForm(values = {}, base = newDefaults()) {
  const el = (b) => {
    // Some blocks carry a suffix (vertical.<owner>, parent.<type>) so they reset when the owner or type changes.
    const key = b in values ? b : Object.keys(values).find((k) => k.startsWith(`${b}.`));
    return key ? values[key].v || Object.values(values[key])[0] || {} : null;
  };
  const one = (b, d) => {
    const a = el(b);
    if (!a) return d;
    return a.selected_option?.value ?? a.selected_date ?? a.selected_time ?? a.selected_user ?? a.value ?? null;
  };
  const many = (b, d) => {
    const a = el(b);
    if (!a) return d;
    return a.selected_users || (a.selected_options || []).map((o) => o.value);
  };
  const f = { ...base };
  for (const k of ['type', 'title', 'desc', 'owner', 'vertical', 'date', 'time', 'parent', 'projKey', 'size', 'impact', 'reason', 'est', 'pm', 'checklist', 'freq', 'every', 'first', 'dueAfter', 'cycle', 'links']) f[k] = one(k, base[k]);
  for (const k of ['contributors', 'goals', 'flags']) f[k] = many(k, base[k]);
  f.type = f.type || 'task';
  const n = Math.max(1, base.kpis?.length || 1);
  f.kpis = Array.from({ length: n }, (_, i) => {
    const b = base.kpis?.[i] || { dir: '>=', src: 'manual' };
    return { name: one(`k${i}_name`, b.name) || '', dir: one(`k${i}_dir`, b.dir) || '>=', target: one(`k${i}_target`, b.target) || '', unit: one(`k${i}_unit`, b.unit) || '', src: one(`k${i}_src`, b.src) || 'manual' };
  });
  return f;
}

// What the form needs from the database: verticals, parents, owner's goals, hints, who may pin.
export function newFormInfo(s, creatorId, ownerId, f) {
  const owner = ownerId && userById(s, ownerId);
  const vertical = f.vertical || owner?.verticals.find((v) => v.main)?.vid || owner?.verticals[0]?.vid;
  const parents = ['task', 'subtask'].includes(f.type)
    ? s.items
        .filter((i) => !DONE.includes(i.status) && (f.type === 'subtask' ? i.type === 'task' : ['project', 'cycle'].includes(i.type)) && canSeeFull(s, creatorId, i))
        .sort((a, b) => (a.currentDeadline || Infinity) - (b.currentDeadline || Infinity))
        .slice(0, 99)
        .map((i) => ({ id: i.id, label: `${i.key} · ${i.title}` }))
    : [];
  const hints = [];
  if (owner) {
    const deadline = dated(f.type) && f.date ? atTime(f.date, f.time || P(s, 'defaultDeadlineTime')) : null;
    const extra = +f.est || SIZE_HOURS[f.size] || 16;
    const pct = loadFor(s, owner.id, startOfWeek(deadline || now())) + Math.round((extra / ((owner.hours || 9) * 6 * 0.8)) * 100);
    if (f.type !== 'stream') hints.push(`${pct > 100 ? '🔴' : pct >= 80 ? '🟠' : '🟢'} ${firstName(s, owner.id)} at ${pct}% load that week with this task.${pct > 100 ? ' Their manager will be told — consider another owner or date.' : ''}`);
    if (owner.id !== creatorId && P(s, 'crossVerticalApproval') && !sharesVertical(s, creatorId, owner.id) && !isFounder(s, creatorId)) {
      hints.push(`Needs ${firstName(s, managerOf(s, owner.id, vertical))}'s approval — different vertical.`);
    }
    if (owner.id === creatorId && !isFounder(s, creatorId)) hints.push(`Self-created: ${firstName(s, managerOf(s, creatorId, vertical))} will review it and confirm size & impact.`);
  }
  const pts = potentialPoints(s, { size: f.size, impact: +f.impact });
  const goals = owner ? s.goals.filter((g) => g.userId === owner.id && g.status === 'active' && (owner.id === creatorId || !g.private)).slice(0, 100) : [];
  return {
    verticals: s.verticals.map((v) => ({ id: v.id, label: v.name })),
    defaultVertical: vertical,
    parents,
    goals: goals.map((g) => ({ id: g.id, label: `${g.title} · ${GOAL_LABEL[g.type]}` })),
    hints,
    points: `Worth ${pts.base} base points · up to ${pts.max} if early with 3★`,
    pinOk: !!owner && (isFounder(s, creatorId) || isAbove(s, creatorId, owner.id)),
    defaultTime: P(s, 'defaultDeadlineTime'),
  };
}

export function newTaskView(f, info, meta = {}) {
  const t = f.type;
  const blocks = [];
  if (meta.err) blocks.push({ type: 'section', text: md(`⚠️ *Couldn't create it:* ${meta.err}`) });
  const iv = (v) => (v ? { initial_value: String(v) } : {});
  blocks.push({ type: 'input', block_id: 'type', dispatch_action: true, label: pt('What are you creating?'), element: { type: 'radio_buttons', action_id: 'v', options: opts(NEW_TYPES), initial_option: pick(opts(NEW_TYPES), t) } });
  blocks.push(input('title', 'Title', { type: 'plain_text_input', placeholder: pt('What needs to be done?'), ...iv(f.title) }));
  blocks.push({ type: 'input', block_id: 'owner', dispatch_action: true, label: pt('Owner (one person, accountable)'), element: { type: 'users_select', action_id: 'v', ...(f.owner ? { initial_user: f.owner } : {}) } });
  const vOpts = info.verticals.map((v) => opt(v.label, v.id));
  const vInit = pick(vOpts, f.vertical || info.defaultVertical);
  if (vOpts.length) blocks.push(input(`vertical.${f.owner || ''}`, 'Vertical', { type: 'static_select', options: vOpts, ...(vInit ? { initial_option: vInit } : {}) }, true, "Defaults to the owner's main vertical"));
  if (dated(t)) {
    blocks.push(input('date', 'Deadline (IST)', { type: 'datepicker', ...(f.date ? { initial_date: f.date } : {}) }));
    blocks.push(input('time', 'Time (IST)', { type: 'timepicker', initial_time: f.time || info.defaultTime || '18:30' }, true));
  }
  if (t === 'task' || t === 'subtask') {
    const pOpts = info.parents.map((p) => opt(p.label, p.id));
    // Sub-task: pick the main task, or "Not applicable" (then it's saved as a normal task).
    if (t === 'subtask') pOpts.unshift(opt('Not applicable — no main task', 'none'));
    const pInit = pick(pOpts, f.parent);
    const label = t === 'subtask' ? 'Parent task' : 'Project / cycle';
    const hint = t === 'subtask' ? (info.parents.length ? 'The main task this sits under. "Not applicable" saves it as a normal task.' : 'No open tasks yet — choose "Not applicable" to save it as a normal task.') : undefined;
    if (pOpts.length) blocks.push(input(`parent.${t}`, label, { type: 'static_select', options: pOpts.slice(0, 100), placeholder: pt(t === 'subtask' ? 'Choose a task' : 'None'), ...(pInit ? { initial_option: pInit } : {}) }, t !== 'subtask', hint));
    else blocks.push({ type: 'context', elements: [md('_No open projects or cycles — this will be a standalone task._')] });
  }
  if (t === 'project' || t === 'stream') blocks.push(input('projKey', 'Key prefix', { type: 'plain_text_input', max_length: 4, ...iv(f.projKey) }, true, 'e.g. DIW → task IDs DIW-01, DIW-02…'));
  blocks.push(input('size', 'Size', { type: 'static_select', options: NEW_SIZE, initial_option: pick(NEW_SIZE, f.size) || NEW_SIZE[1] }));
  blocks.push(input('impact', 'Impact', { type: 'static_select', options: NEW_IMPACT, initial_option: pick(NEW_IMPACT, f.impact) || NEW_IMPACT[1] }));
  blocks.push(input('reason', 'Why this impact? (one line)', { type: 'plain_text_input', placeholder: pt('e.g. client safety, revenue, launch…'), ...iv(f.reason) }, false, info.points));
  if (t !== 'stream') blocks.push(input('est', 'Estimated hours', { type: 'number_input', is_decimal_allowed: false, min_value: '1', ...iv(f.est) }, true, 'Leave empty to use the size (S=4, M=16, L=40)'));
  if (hasPM(t)) {
    blocks.push({ type: 'input', block_id: 'pm', dispatch_action: true, label: pt('Progress method'), element: { type: 'radio_buttons', action_id: 'v', options: opts(PM_OPTS), initial_option: pick(opts(PM_OPTS), f.pm) || opts(PM_OPTS)[0] } });
    if (f.pm === 'checklist') blocks.push(input('checklist', 'Checklist (one item per line)', { type: 'plain_text_input', multiline: true, ...iv(f.checklist) }));
  }
  if (t === 'recurring') {
    const fOpts = opts(Object.entries(FREQ_LABEL));
    blocks.push({ type: 'input', block_id: 'freq', dispatch_action: true, label: pt('Repeats'), element: { type: 'static_select', action_id: 'v', options: fOpts, initial_option: pick(fOpts, f.freq) || fOpts[1] } });
    if (f.freq === 'custom') blocks.push(input('every', 'Every N days', { type: 'number_input', is_decimal_allowed: false, min_value: '1', ...iv(f.every) }));
    blocks.push(input('first', 'First occurrence on', { type: 'datepicker', ...(f.first ? { initial_date: f.first } : {}) }));
    blocks.push(input('dueAfter', 'Each one is due after (days)', { type: 'number_input', is_decimal_allowed: false, min_value: '0', ...iv(f.dueAfter) }, true, 'At the default deadline time'));
  }
  if (t === 'stream') {
    blocks.push(input('cycle', 'Cycle length', { type: 'static_select', options: opts(CYCLES), initial_option: pick(opts(CYCLES), f.cycle) || opts(CYCLES)[2] }));
    blocks.push({ type: 'section', text: md('*KPIs* (at least one) — actuals are entered every Saturday with a source link; the manager verifies at cycle end.') });
    const dirs = [opt('≥ at least', '>='), opt('≤ at most', '<=')];
    const srcs = opts(KPI_SOURCES);
    f.kpis.forEach((k, i) => {
      blocks.push({ type: 'divider' });
      blocks.push(input(`k${i}_name`, `KPI ${i + 1} name`, { type: 'plain_text_input', placeholder: pt('e.g. Leads'), ...iv(k.name) }, i > 0));
      blocks.push(input(`k${i}_dir`, 'Direction', { type: 'static_select', options: dirs, initial_option: pick(dirs, k.dir) || dirs[0] }, true));
      blocks.push(input(`k${i}_target`, 'Target', { type: 'number_input', is_decimal_allowed: true, ...iv(k.target) }, i > 0));
      blocks.push(input(`k${i}_unit`, 'Unit', { type: 'plain_text_input', placeholder: pt('e.g. ₹, %, leads'), ...iv(k.unit) }, true));
      blocks.push(input(`k${i}_src`, 'Where the number comes from', { type: 'static_select', options: srcs, initial_option: pick(srcs, k.src) || srcs[0] }, true));
    });
    if (f.kpis.length < KPI_MAX) blocks.push({ type: 'actions', block_id: 'kpi_more', elements: [{ type: 'button', action_id: 'kpi_more', text: pt('+ KPI'), value: 'more' }] });
    blocks.push({ type: 'divider' });
  }
  blocks.push(input('desc', 'Description', { type: 'plain_text_input', multiline: true, placeholder: pt('What does done look like?'), ...iv(f.desc) }, true));
  blocks.push(input('links', 'Reference links', { type: 'plain_text_input', multiline: true, placeholder: pt('Brief | https://docs.google.com/…'), ...iv(f.links) }, true, 'One per line — "Label | https://…" or just the link. Links only, no uploads.'));
  blocks.push(input('contributors', 'Contributors', { type: 'multi_users_select', ...(f.contributors?.length ? { initial_users: f.contributors } : {}) }, true, 'Tagged helpers. Their piece becomes a sub-task they own.'));
  if (info.goals.length) {
    const gOpts = info.goals.map((g) => opt(g.label, g.id));
    const gInit = gOpts.filter((o) => (f.goals || []).includes(o.value));
    blocks.push(input('goals', 'Linked goals', { type: 'multi_static_select', options: gOpts, ...(gInit.length ? { initial_options: gInit } : {}) }, true, 'The goal page shows how many linked tasks are closed.'));
  }
  const flagOpts = [opt('Private (others see only "Private task", status, deadline)', 'private')];
  if (info.pinOk) flagOpts.push(opt('Pin (boosts their top-3)', 'pinned'));
  const fInit = flagOpts.filter((o) => (f.flags || []).includes(o.value));
  blocks.push(input('flags', 'Options', { type: 'checkboxes', options: flagOpts, ...(fInit.length ? { initial_options: fInit } : {}) }, true));
  if (info.hints.length) blocks.push({ type: 'context', elements: [md(info.hints.join('\n'))] });
  return {
    type: 'modal',
    callback_id: 'hb_new',
    private_metadata: JSON.stringify({ msg: meta.msg || null, kpiN: f.kpis.length }),
    title: pt('New'),
    submit: pt('Create'),
    close: pt('Close'),
    blocks: blocks.slice(0, 100),
  };
}

// Checks Slack can do on its own (no database), so mistakes show under the field right away.
export function newFormErrors(f) {
  const e = {};
  if (!(f.title || '').trim()) e.title = 'Give it a title.';
  if (!f.owner) e.owner = 'Pick one owner.';
  if (!(f.reason || '').trim()) e.reason = 'Add a one-line reason for the impact.';
  if (dated(f.type)) {
    if (!f.date) e.date = 'Set a deadline.';
    else if (f.date < dateKey(now())) e.date = 'Pick today or a later date.';
  }
  if (f.type === 'subtask' && !f.parent) e[`parent.${f.type}`] = 'Pick the main task, or "Not applicable".';
  if (hasPM(f.type) && f.pm === 'checklist' && !(f.checklist || '').trim()) e.checklist = 'Add at least one checklist item (one per line).';
  if (f.type === 'recurring' && !f.first) e.first = 'Pick the first date.';
  if (f.type === 'stream') {
    const named = f.kpis.filter((k) => (k.name || '').trim());
    if (!named.length) e.k0_name = 'A stream needs at least one KPI.';
    f.kpis.forEach((k, i) => {
      if ((k.name || '').trim() && (k.target === '' || isNaN(+k.target))) e[`k${i}_target`] = 'Add a target number.';
    });
  }
  const bad = parseLinks(f.links).find((l) => !/^https?:\/\/\S+\.\S+/.test(l.url));
  if (bad) e.links = `"${cut(bad.url, 40)}" isn't a link — it should start with https://`;
  return e;
}
export const parseLinks = (text) =>
  (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.lastIndexOf('|');
      return i >= 0 ? { label: l.slice(0, i).trim() || 'Link', url: l.slice(i + 1).trim() } : { label: 'Link', url: l };
    });

let formCache = { at: 0, s: null };
async function stateForForm(ctx) {
  if (formCache.s && Date.now() - formCache.at < 60000) return formCache.s;
  const s = await withLock(() => loadState(ctx));
  formCache = { at: Date.now(), s };
  return s;
}
export async function renderNewForm(ctx, slackUser, viewId, f, meta = {}, hash) {
  const creator = await hbUserForSlack(ctx, slackUser);
  if (!creator) return ctx.slack('views.update', { view_id: viewId, view: infoModal('New', "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.") });
  const s = await stateForForm(ctx);
  if (!s) return ctx.slack('views.update', { view_id: viewId, view: infoModal('New', 'HB+ Tasks has not been set up yet.') });
  const owner = f.owner ? await hbUserForSlack(ctx, f.owner) : null;
  const view = newTaskView(f, newFormInfo(s, creator, owner, f), meta);
  return ctx.slack('views.update', { view_id: viewId, ...(hash ? { hash } : {}), view });
}
export async function openNewForm(ctx, triggerId, slackUser, f, meta, background) {
  const res = await ctx.slack('views.open', { trigger_id: triggerId, view: infoModal('New', 'Loading the form… 🌿') });
  background(safely(ctx, slackUser, 'opening the form', () => renderNewForm(ctx, slackUser, res.view?.id, f, meta)));
}

export async function runNew(ctx, slackUser, f, meta, viewId) {
  const back = async (err) => {
    formCache.at = 0;
    const r = viewId ? await renderNewForm(ctx, slackUser, viewId, f, { ...meta, err }) : null;
    if (!r?.ok) await dm(ctx, slackUser, `Couldn't create *${f.title}*: ${err}`);
  };
  const creator = await hbUserForSlack(ctx, slackUser);
  if (!creator) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const owner = await hbUserForSlack(ctx, f.owner);
  if (!owner) return back("the owner isn't on HB+ Tasks yet (their Slack email must match their HB+ email).");
  const contributors = [];
  for (const c of f.contributors || []) {
    const id = await hbUserForSlack(ctx, c);
    if (id && id !== owner) contributors.push(id);
  }
  const links = parseLinks(f.links);
  if (meta.msg?.channel && meta.msg?.ts) {
    const p = await ctx.slack('chat.getPermalink', { channel: meta.msg.channel, message_ts: meta.msg.ts }, true);
    if (p.ok) links.unshift({ label: 'Slack message', url: p.permalink });
  }
  let newId = null;
  let pinDropped = false;
  const r = await runAs(ctx, (s) => {
    let pinned = (f.flags || []).includes('pinned');
    if (pinned && !(isFounder(s, creator) || isAbove(s, creator, owner))) {
      pinned = false;
      pinDropped = true;
    }
    const data = {
      type: f.type === 'recurring' ? 'task' : f.type,
      title: f.title,
      desc: f.desc || '',
      ownerId: owner,
      vertical: f.vertical || null,
      deadline: dated(f.type) ? atTime(f.date, f.time || P(s, 'defaultDeadlineTime')) : null,
      size: f.size,
      impact: +f.impact,
      impactReason: f.reason,
      estHours: f.est || '',
      progressMethod: f.pm || 'stages',
      parentId: f.parent || null,
      contributors,
      goalLinks: f.goals || [],
      links,
      checklist: (f.checklist || '').split('\n').map((x) => x.trim()).filter(Boolean),
      private: (f.flags || []).includes('private'),
      pinned,
      cycleLength: f.cycle,
      projKey: f.projKey,
      kpis: f.kpis
        .filter((k) => (k.name || '').trim())
        .map((k) => ({ name: k.name.trim(), target: +k.target, unit: k.unit || '', dir: k.dir, source: (k.src || 'manual').split(':')[0], sourceMetric: k.src && k.src !== 'manual' ? k.src.split(':')[1] : null })),
    };
    if (!['task', 'subtask'].includes(f.type) || f.parent === 'none') data.parentId = null;
    if (f.type === 'subtask' && f.parent === 'none') data.type = 'task';
    if (f.type === 'recurring') {
      const res = createRecurringRule(s, creator, { ...data, freq: f.freq, everyDays: f.every, dueAfterDays: f.dueAfter === '' || f.dueAfter == null ? undefined : f.dueAfter, firstRun: atTime(f.first, '09:00') });
      newId = res?.id || null;
      return res?.error ? res : { ok: true };
    }
    const res = createItem(s, creator, data);
    newId = res.id;
    return res;
  });
  if (r.error) return back(r.error);
  formCache.at = 0;
  const it = newId && itemById(r.s, newId);
  const url = link(ctx, newId ? `/task/${newId}` : '/tasks');
  const what = f.type === 'subtask' && f.parent === 'none' ? 'Task (no main task)' : { task: 'Task', subtask: 'Sub-task', project: 'Project', stream: 'Stream', recurring: 'Recurring task' }[f.type];
  const lines = [
    f.type === 'recurring'
      ? `✅ Recurring task *${f.title}* set up (${FREQ_LABEL[f.freq].toLowerCase()}).${it ? ` First one: *${it.key}*, due ${fmtDT(it.currentDeadline)}.` : ` First one appears on ${fmtDate(parseKey(f.first))}.`}`
      : `✅ ${what} *${it.key} · ${it.title}* created for ${owner === creator ? 'you' : nameOf(r.s, owner)}${it.currentDeadline ? ` — due ${fmtDT(it.currentDeadline)}` : ''}.`,
    ...(r.warnings || []).map((w) => `_${w}_`),
    ...(pinDropped ? ["_Not pinned — only founders and people above the owner can pin._"] : []),
    owner !== creator && it?.status === 'awaiting' ? `${firstName(r.s, owner)} has been asked on Slack to accept it.` : '',
    url ? `<${url}|Open in app>` : '',
  ].filter(Boolean);
  const view = { type: 'modal', title: pt('Created'), close: pt('Done'), blocks: [{ type: 'section', text: md(lines.join('\n')) }] };
  const u = viewId ? await ctx.slack('views.update', { view_id: viewId, view }) : null;
  if (!u?.ok) await dm(ctx, slackUser, lines.join('\n'));
  return r;
}

/* ---------- Phase 2: the daily SOW inside Slack ---------- */
const NT_CODES = ['Blocked', 'Re-prioritised', 'Leave or health', 'Underestimated', 'Forgot', 'Other'];
const STAGE_OPTS = [[25, 'Started · 25%'], [50, 'Halfway · 50%'], [75, 'Almost done · 75%']];

export function outcomesFrom(values = {}) {
  const out = {};
  for (const [block, acts] of Object.entries(values)) if (block.startsWith('o_')) out[block.slice(2)] = acts.v?.selected_option?.value || null;
  return out;
}
const trail = (n, text) => ({ type: 'context', elements: [md(`*Step ${n} of 2* · ${text}`)] });

export function sowStep1View(m, outcomes = {}) {
  const blocks = [trail(1, `${fmtDate(parseKey(m.day))} · one outcome per task`)];
  if (!m.items.length) blocks.push({ type: 'section', text: md('Nothing to report on today 🌿 — go straight to planning tomorrow.') });
  for (const it of m.items) {
    const o = outcomes[it.id];
    const opts = [opt(it.own ? '✓ Done' : '✓ My part done', 'done'), opt('Progress', 'progress'), opt('Not touched', 'not_touched')];
    blocks.push({
      type: 'input', block_id: `o_${it.id}`, dispatch_action: true, label: pt(it.t),
      element: { type: 'radio_buttons', action_id: 'v', options: opts, ...(o ? { initial_option: opts.find((x) => x.value === o) } : {}) },
    });
    if (o === 'done' && it.own) blocks.push(input(`p_${it.id}`, 'Proof link', { type: 'plain_text_input', placeholder: pt('https://…') }, false, 'Goes to your reviewer.'));
    if (o === 'progress') {
      if (it.m === 'stages') blocks.push(input(`s_${it.id}`, 'Stage now', { type: 'static_select', options: STAGE_OPTS.map(([v, l]) => opt(l, v)) }, true));
      blocks.push(input(`k_${it.id}`, 'Pick it up', { type: 'static_select', options: [opt('Tomorrow', 'tomorrow'), opt('In 2 days', 'plus2')], initial_option: opt('Tomorrow', 'tomorrow') }));
    }
    if (o === 'not_touched') blocks.push(input(`r_${it.id}`, 'Reason', { type: 'static_select', options: NT_CODES.map((c) => opt(c, c)) }));
    if (o) blocks.push(input(`c_${it.id}`, o === 'not_touched' ? 'Comment (required)' : 'Comment (optional)', { type: 'plain_text_input' }, o !== 'not_touched'));
  }
  return { type: 'modal', callback_id: 'hb_sow_1', private_metadata: JSON.stringify(m), title: pt('How did today go?'), submit: pt('Next: plan tomorrow'), close: pt('Cancel'), blocks: blocks.slice(0, 100) };
}

export function sowStep2View(m) {
  const blocks = [trail(2, `plan ${fmtDate(parseKey(m.forKey))} — suggested by impact × urgency`)];
  if (m.half) blocks.push({ type: 'context', elements: [md('Tomorrow is a half-day — at least 1 task.')] });
  const cand = m.cand;
  if (!cand.length) blocks.push({ type: 'section', text: md('No open tasks to plan. Submit to finish 🌿') });
  else {
    const options = cand.map((c) => opt(`${c.t}${c.o ? ' · overdue' : ` · ${c.d}`}`, c.id));
    [0, 1, 2].forEach((i) => {
      const initial = options.find((o) => o.value === m.sug[i]);
      blocks.push(input(`t${i + 1}`, `#${i + 1}`, { type: 'static_select', options, ...(initial ? { initial_option: initial } : {}) }, i > 0));
    });
    if (m.over.length) blocks.push(input('drop', 'Dropping an overdue task? One line on why', { type: 'plain_text_input' }, true));
  }
  return { type: 'modal', callback_id: 'hb_sow_2', private_metadata: JSON.stringify(m), title: pt('Plan tomorrow'), submit: pt('Submit SOW'), close: pt('Cancel'), blocks };
}

export async function openSow(ctx, slackUser, viewId, msg) {
  const show = (title, text) => viewId && ctx.slack('views.update', { view_id: viewId, view: infoModal(title, text) });
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) return show('Daily SOW', "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const s = await withLock(() => loadState(ctx));
  if (!s) return show('Daily SOW', 'HB+ Tasks has not been set up yet.');
  const today = dateKey(now());
  const open = openSowDays(s, uid);
  const day = open.length ? open[open.length - 1] : today;
  if (!sowRequired(s, uid, day)) return show('Daily SOW', 'No SOW needed today — you’re off, it’s a holiday or it’s Sunday. Rest well 🌿');
  if (sowDayOf(s, uid, day)?.submittedAt) {
    const url = link(ctx, '/sow');
    return show('Daily SOW', `Today's SOW is already in. Thank you! 🌿${url ? `\nTo change tomorrow's plan, <${url}|open the app>.` : ''}`);
  }
  const forKey = nextWorkingKey(s, day);
  const items = eodItems(s, uid, day).slice(0, 10);
  const at9 = atTime(forKey, '09:00');
  const m = {
    day,
    forKey,
    half: offDayOf(s, uid, forKey)?.code === 'Half-day',
    msg,
    items: items.map((i) => ({ id: i.id, t: cut(i.title, 60), own: i.ownerId === uid, m: i.progressMethod })),
    cand: rankCandidates(s, uid, forKey, at9)
      .slice(0, 15)
      .map(({ item }) => ({ id: item.id, t: cut(item.title, 34), d: dueLabel(item.currentDeadline), o: flagsOf(s, item, at9).overdue ? 1 : 0 })),
  };
  while (JSON.stringify(m).length > 2900 && m.cand.length > 3) m.cand.pop();
  await ctx.slack('views.update', { view_id: viewId, view: sowStep1View(m, {}) });
}

export async function sowStep1Submit(ctx, payload) {
  const m = JSON.parse(payload.view.private_metadata || '{}');
  const v = payload.view.state?.values || {};
  const val = (b) => {
    const a = v[b]?.v || {};
    return a.selected_option?.value ?? a.selected_date ?? a.value ?? null;
  };
  const errors = {};
  const entries = [];
  for (const it of m.items) {
    const outcome = val(`o_${it.id}`);
    if (!outcome) {
      errors[`o_${it.id}`] = 'Pick one.';
      continue;
    }
    const e = { itemId: it.id, outcome, comment: (val(`c_${it.id}`) || '').trim() };
    if (outcome === 'done' && it.own) {
      e.proofLink = (val(`p_${it.id}`) || '').trim();
      if (!/^https?:\/\/\S+\.\S+/.test(e.proofLink)) errors[`p_${it.id}`] = 'Add a link that starts with https://';
    }
    if (outcome === 'progress') {
      if (val(`s_${it.id}`)) e.stage = +val(`s_${it.id}`);
      e.pickup = val(`k_${it.id}`) || 'tomorrow';
    }
    if (outcome === 'not_touched') {
      e.reason = val(`r_${it.id}`);
      if (!e.reason) errors[`r_${it.id}`] = 'Pick a reason.';
      if (!e.comment) errors[`c_${it.id}`] = 'Add a short comment.';
    }
    entries.push(e);
  }
  if (Object.keys(errors).length) return { response_action: 'errors', errors };
  // Save step 1 and show step 2, planned around today's outcomes.
  await ctx.client.from('slack_sow_drafts').upsert({ id: payload.view.id, user_id: payload.user.id, sow_date: m.day, entries, created_at: new Date().toISOString() });
  const done = new Set(entries.filter((e) => e.outcome === 'done').map((e) => e.itemId));
  const later = new Set(entries.filter((e) => e.outcome === 'progress' && e.pickup === 'plus2').map((e) => e.itemId));
  const cand = m.cand.filter((c) => !done.has(c.id) && !later.has(c.id));
  const sug = cand.slice(0, 3).map((c) => c.id);
  const m2 = { day: m.day, forKey: m.forKey, half: m.half, msg: m.msg, draft: payload.view.id, cand, sug, over: cand.filter((c) => c.o && sug.includes(c.id)).map((c) => c.id) };
  return { response_action: 'update', view: sowStep2View(m2) };
}

export async function sowStep2Submit(ctx, payload, background) {
  const m = JSON.parse(payload.view.private_metadata || '{}');
  const vals = readValues(payload.view.state?.values);
  const top3 = [...new Set([vals.t1, vals.t2, vals.t3].filter(Boolean))];
  const dropped = m.over.filter((id) => !top3.includes(id));
  if (m.cand.length && !top3.length) return { response_action: 'errors', errors: { t1: 'Pick at least one task for tomorrow.' } };
  if (dropped.length && !(vals.drop || '').trim()) return { response_action: 'errors', errors: { drop: 'You dropped an overdue task — one line on why.' } };
  background(safely(ctx, payload.user.id, 'saving your SOW', () => finishSow(ctx, payload.user.id, m, top3, dropped, (vals.drop || '').trim())));
  return null;
}

export async function finishSow(ctx, slackUser, m, top3, dropped, dropNote) {
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks.");
  const { data: draft } = await ctx.client.from('slack_sow_drafts').select('*').eq('id', m.draft).maybeSingle();
  const raw = draft?.entries || [];
  const r = await runAs(ctx, (s) => {
    const next = nextWorkingKey(s, m.day);
    const entries = raw.map((e) => ({
      ...e,
      pickupDate: e.outcome === 'progress' ? (e.pickup === 'plus2' ? nextWorkingKey(s, next) : next) : null,
    }));
    return submitSOW(s, uid, m.day, entries, { forKey: m.forKey, top3, droppedOverdue: dropped, dropReasons: Object.fromEntries(dropped.map((id) => [id, dropNote])) });
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't save your SOW: ${r.error} Try again from the app or the Fill SOW button.`);
  await ctx.client.from('slack_sow_drafts').delete().eq('id', m.draft);
  const label = r.status === 'on_time' ? 'on time 🌿' : r.status === 'late' ? 'late (no penalty — streak restarts)' : 'logged';
  const plan = top3.map((id, i) => `${i + 1}. ${itemById(r.s, id)?.title}`).join('\n');
  await dm(ctx, slackUser, `✅ SOW for ${fmtDate(parseKey(m.day))} — ${label}.${plan ? `\n*${fmtDate(parseKey(m.forKey))}'s top 3:*\n${plan}` : ''}`);
  if (m.msg) await markMessage(ctx, m.msg, `✅ SOW logged ${r.status === 'on_time' ? 'on time' : r.status === 'late' ? 'late' : ''}`);
  return r;
}

/* ---------- Requests from Slack ---------- */
// Returns the JSON body to send back, or null for an empty 200 (which closes a pop-up).
export async function handleInteraction(ctx, payload, background) {
  if (payload.type === 'block_actions' && payload.actions?.[0]?.action_id === 'sow_fill') {
    const meta = { channel: payload.container?.channel_id || payload.channel?.id, ts: payload.container?.message_ts || payload.message?.ts };
    const res = await ctx.slack('views.open', { trigger_id: payload.trigger_id, view: infoModal('Daily SOW', 'Loading your day… 🌿') });
    background(safely(ctx, payload.user.id, 'opening your SOW', () => openSow(ctx, payload.user.id, res.view?.id, meta)));
    return null;
  }
  if (payload.type === 'block_actions' && payload.view?.callback_id === 'hb_sow_1') {
    // Outcome changed → show the matching follow-up questions.
    const m = JSON.parse(payload.view.private_metadata || '{}');
    await ctx.slack('views.update', { view_id: payload.view.id, hash: payload.view.hash, view: sowStep1View(m, outcomesFrom(payload.view.state?.values)) });
    return null;
  }
  if (payload.type === 'block_actions' && payload.view?.callback_id === 'hb_card') {
    const act = payload.actions?.[0];
    if (!act?.value) return null;
    const v = JSON.parse(act.value);
    const view = act.action_id === 'reassign' ? reassignModal(v) : BTN[act.action_id] ? actionModal(act.action_id, v, { fromCard: true }) : null;
    if (view) await ctx.slack('views.push', { trigger_id: payload.trigger_id, view });
    return null;
  }
  if (payload.type === 'view_submission' && payload.view.callback_id === 'hb_reassign') {
    const vals = readValues(payload.view.state.values);
    if (!vals.person) return { response_action: 'errors', errors: { person: 'Pick a person.' } };
    if (vals.person === payload.user.id && vals.mode === 'assignee') return { response_action: 'errors', errors: { person: "You can't hand a part to yourself." } };
    background(safely(ctx, payload.user.id, 'reassigning the task', () => runReassign(ctx, payload.user.id, JSON.parse(payload.view.private_metadata), vals)));
    return { response_action: 'clear' };
  }
  if (payload.type === 'block_actions' && payload.view?.callback_id === 'hb_bulk' && payload.actions?.[0]?.action_id === 'bulk_more') {
    const m = JSON.parse(payload.view.private_metadata || '{}');
    // Same block ids, so Slack keeps what was already typed.
    await ctx.slack('views.update', { view_id: payload.view.id, hash: payload.view.hash, view: bulkModal({ invoker: m.invoker, count: (m.count || 3) + 1 }) });
    return null;
  }
  if (payload.type === 'view_submission' && payload.view.callback_id === 'hb_bulk') {
    const m = JSON.parse(payload.view.private_metadata || '{}');
    const { rows, errors } = bulkRows(payload.view.state.values, m.count || 3);
    if (Object.keys(errors).length) return { response_action: 'errors', errors };
    background(safely(ctx, payload.user.id, 'creating the tasks', () => runBulk(ctx, payload.user.id, rows)));
    return null;
  }
  if (payload.type === 'block_actions' && payload.view?.callback_id === 'hb_new') {
    const m = JSON.parse(payload.view.private_metadata || '{}');
    const f = readNewForm(payload.view.state?.values, { ...newDefaults(), kpis: Array.from({ length: m.kpiN || 1 }, () => ({ dir: '>=', src: 'manual' })) });
    const changed = payload.actions?.[0]?.block_id;
    if (changed === 'owner') f.vertical = null;
    if (changed === 'type') f.parent = null;
    if (payload.actions?.[0]?.action_id === 'kpi_more' && f.kpis.length < KPI_MAX) f.kpis.push({ name: '', dir: '>=', target: '', unit: '', src: 'manual' });
    background(safely(ctx, payload.user.id, 'updating the form', () => renderNewForm(ctx, payload.user.id, payload.view.id, f, { msg: m.msg }, payload.view.hash)));
    return null;
  }
  if (payload.type === 'view_submission' && payload.view.callback_id === 'hb_sow_1') return sowStep1Submit(ctx, payload);
  if (payload.type === 'view_submission' && payload.view.callback_id === 'hb_sow_2') return sowStep2Submit(ctx, payload, background);
  if (payload.type === 'block_actions') {
    const act = payload.actions?.[0];
    if (!act || !act.value || !BTN[act.action_id]) return null; // links ("Open in app") need nothing
    const v = JSON.parse(act.value);
    const meta = { channel: payload.container?.channel_id || payload.channel?.id, ts: payload.container?.message_ts || payload.message?.ts };
    const res = await ctx.slack('views.open', { trigger_id: payload.trigger_id, view: actionModal(act.action_id, v, meta) });
    if (!res.ok) console.error('hb-slack: views.open failed', res.error);
    background(safely(ctx, payload.user.id, 'checking that button', () => staleCheck(ctx, payload.user.id, act.action_id, v, res.view?.id, meta)));
    return null;
  }
  if (payload.type === 'message_action' && payload.callback_id === 'create_task_from_message') {
    const text = payload.message?.text || '';
    const first = text.split('\n')[0].replace(/<[^>|]+\|([^>]+)>/g, '$1').replace(/<[^>]+>/g, '').trim();
    await openNewForm(ctx, payload.trigger_id, payload.user.id, newDefaults({ invoker: payload.user.id, title: first, desc: text }), { msg: { channel: payload.channel?.id, ts: payload.message?.ts } }, background);
    return null;
  }
  if (payload.type === 'view_submission') {
    const vals = readValues(payload.view.state.values);
    const meta = JSON.parse(payload.view.private_metadata || '{}');
    if (payload.view.callback_id === 'hb_action') {
      if (meta.key === 'submit' && !/^https?:\/\/\S+\.\S+/.test((vals.proof || '').trim())) return { response_action: 'errors', errors: { proof: 'Add a link that starts with https://' } };
      if (meta.key === 'review' && vals.decision !== 'send_back' && ['1', '3'].includes(String(vals.rating)) && (vals.comment || '').trim().length < 3) {
        return { response_action: 'errors', errors: { comment: 'Add a one-line reason for ★ or ★★★.' } };
      }
      background(safely(ctx, payload.user.id, `saving “${DONE_LABEL[meta.key] || 'your update'}”`, () => runAction(ctx, payload.user.id, meta, vals)));
      return meta.fromCard ? { response_action: 'clear' } : null;
    }
    if (payload.view.callback_id === 'hb_new') {
      const f = readNewForm(payload.view.state.values, { ...newDefaults(), kpis: Array.from({ length: meta.kpiN || 1 }, () => ({ dir: '>=', src: 'manual' })) });
      const errors = newFormErrors(f);
      if (Object.keys(errors).length) return { response_action: 'errors', errors };
      background(safely(ctx, payload.user.id, 'creating it', () => runNew(ctx, payload.user.id, f, { msg: meta.msg }, payload.view.id)));
      return { response_action: 'update', view: infoModal('New', `Creating *${cut(f.title, 80)}*… 🌿`) };
    }
  }
  return null;
}
export const TASK_ID = /^[A-Za-z]{2,5}-\d{1,5}$/;
const HELP = [
  '*HB+ Tasks in Slack*',
  '• `/task` or `/task Write ice bath SOP` — the full New form: task, sub-task, project, stream or recurring task',
  '• `/task MKT-14` — open a task: mark complete, reassign, update, extend…',
  '• `/task bulk` — add several tasks at once, each with its own owner, deadline, size and impact (`/task bulk 5` opens 5)',
  '• *Fill SOW* — in your 6:30 PM nudge or on the HB+ Tasks Home tab',
].join('\n');

export async function handleCommand(ctx, form, background = () => {}) {
  const text = (form.get('text') || '').trim();
  const user = form.get('user_id');
  const trigger = form.get('trigger_id');
  if (/^help$/i.test(text)) return { response_type: 'ephemeral', text: HELP };
  if (/^bulk\b/i.test(text)) {
    const n = parseInt(text.replace(/^bulk\s*/i, ''), 10);
    await ctx.slack('views.open', { trigger_id: trigger, view: bulkModal({ invoker: user, count: Number.isFinite(n) ? n : 3 }) });
    return null;
  }
  if (TASK_ID.test(text)) {
    const res = await ctx.slack('views.open', { trigger_id: trigger, view: infoModal('HB+ task', `Opening *${text.toUpperCase()}*…`) });
    background(safely(ctx, user, `opening ${text.toUpperCase()}`, () => openTaskCard(ctx, user, text, res.view?.id)));
    return null;
  }
  await openNewForm(ctx, trigger, user, newDefaults({ invoker: user, title: text }), {}, background);
  return null;
}

/* ---------- /task <ID>: the task card ---------- */
const CARD_ACTIONS = [
  ['accept', 'accept', 'Accept', 'primary'],
  ['submit', 'submit', 'Mark complete', 'primary'],
  ['review', 'review', 'Review', 'primary'],
  ['update', 'update', 'Update progress'],
  ['extension', 'request_extension', 'Request extension'],
  ['block', 'block', "I'm blocked"],
  ['unblock', 'unblock', 'Unblock'],
];
export function taskCardView(ctx, s, uid, item) {
  const allowed = allowedActions(s, uid, item);
  const v = { i: item.id, t: cut(item.title, 60) };
  const modes = [allowed.includes('change_owner') && 'owner', allowed.includes('give_assignee') && 'assignee'].filter(Boolean);
  const f = flagsOf(s, item);
  const flags = [f.overdue && '⚠️ overdue', f.atRisk && 'at-risk', item.assigneeId && `with ${firstName(s, item.assigneeId)}`].filter(Boolean).join(' · ');
  const els = CARD_ACTIONS.filter(([, eng]) => allowed.includes(eng)).map(([key, , label, style]) => ({ type: 'button', action_id: key, text: pt(label), ...(style ? { style } : {}), value: JSON.stringify(v) }));
  if (modes.length) els.push({ type: 'button', action_id: 'reassign', text: pt('Reassign'), value: JSON.stringify({ ...v, modes }) });
  const url = link(ctx, `/task/${item.id}`);
  if (url) els.push({ type: 'button', action_id: 'open_link', text: pt('Open in app'), url });
  const blocks = [
    { type: 'section', text: md(`*${item.key} · ${item.title}*`) },
    {
      type: 'section',
      fields: [
        md(`*Status*\n${STATUS[item.status]?.label || item.status}${flags ? ` · ${flags}` : ''}`),
        md(`*Owner*\n${nameOf(s, item.ownerId)}`),
        md(`*Due*\n${item.currentDeadline ? fmtDT(item.currentDeadline) : 'No end date'}`),
        md(`*Progress*\n${progressOf(s, item)}%`),
        md(`*Size · Impact*\n${item.size} · ${item.impact}`),
        md(`*Reviewer*\n${nameOf(s, item.reviewerId)}`),
      ],
    },
  ];
  if (item.desc) blocks.push({ type: 'context', elements: [md(cut(item.desc, 300))] });
  if (els.length) blocks.push({ type: 'actions', block_id: 'card', elements: els.slice(0, 25) });
  else blocks.push({ type: 'context', elements: [md('Nothing for you to do on this task right now.')] });
  return { type: 'modal', callback_id: 'hb_card', title: pt(item.key), close: pt('Close'), blocks };
}
export async function openTaskCard(ctx, slackUser, key, viewId) {
  const show = (text) => viewId && ctx.slack('views.update', { view_id: viewId, view: infoModal('HB+ task', text) });
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) return show("I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const s = await withLock(() => loadState(ctx));
  const item = s && s.items.find((i) => i.key.toLowerCase() === key.toLowerCase());
  if (!item) return show(`No task with ID *${key.toUpperCase()}*. Check the ID in the app (top-left of the task page).`);
  if (!canSeeFull(s, uid, item)) return show(`*${item.key}* is a private task.`);
  await ctx.slack('views.update', { view_id: viewId, view: taskCardView(ctx, s, uid, item) });
}

/* ---------- Reassign: make owner / give a part ---------- */
export function reassignModal(v) {
  const opts = [];
  if (v.modes.includes('owner')) opts.push(opt('Make them the owner — they become accountable (they accept; their manager approves if needed)', 'owner'));
  if (v.modes.includes('assignee')) opts.push(opt('Give them a part — you stay the owner, they hand it back', 'assignee'));
  return {
    type: 'modal',
    callback_id: 'hb_reassign',
    private_metadata: JSON.stringify(v),
    title: pt('Reassign'),
    submit: pt('Reassign'),
    close: pt('Cancel'),
    blocks: [
      { type: 'context', elements: [md(`*${v.t}*`)] },
      input('person', 'To', { type: 'users_select' }),
      input('mode', 'How', { type: 'radio_buttons', options: opts, initial_option: opts[0] }),
      input('comment', 'Comment', { type: 'plain_text_input', multiline: true }, false, 'Every action needs a short comment.'),
    ],
  };
}
export async function runReassign(ctx, slackUser, v, vals) {
  const uid = await hbUserForSlack(ctx, slackUser);
  if (!uid) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks.");
  const target = vals.person ? await hbUserForSlack(ctx, vals.person) : null;
  if (!target) return dm(ctx, slackUser, "That person isn't on HB+ Tasks yet (their Slack email must match their HB+ email).");
  const mode = vals.mode === 'assignee' ? 'assignee' : 'owner';
  let before = null;
  const r = await runAs(ctx, (s) => {
    before = itemById(s, v.i)?.status;
    return mode === 'owner'
      ? perform(s, uid, v.i, 'change_owner', { newOwnerId: target, comment: vals.comment })
      : perform(s, uid, v.i, 'give_assignee', { assigneeId: target, comment: vals.comment });
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't reassign *${v.t}*: ${r.error}`);
  const who = firstName(r.s, target);
  const msg =
    mode === 'assignee'
      ? `✅ *${v.t}* — ${who} now has a part. You're still the owner; they'll hand it back when done.`
      : ['awaiting', 'pending_approval'].includes(before)
      ? `✅ *${v.t}* moved to ${who}. They've been asked to accept it.`
      : (() => {
          const ap = r.s.approvals.filter((x) => x.itemId === v.i && x.type === 'owner_change' && x.status === 'pending').pop();
          const approver = ap ? ap.approverIds.map((id) => firstName(r.s, id)).join(' or ') : 'their manager';
          return `✅ Owner change for *${v.t}* requested — ${approver} approves, then ${firstName(r.s, target)} accepts. Points already earned stay with the current owner.`;
        })();
  return dm(ctx, slackUser, msg);
}

/* ---------- /task bulk: a proper form, one section per task ---------- */
export const BULK_MAX = 10; // Slack allows 100 blocks per pop-up; each task uses 9
const SIZE_OPTS = [opt('S · ≤2 days', 'S'), opt('M · 3–10 days', 'M'), opt('L · >10 days', 'L')];
const IMPACT_OPTS = [opt('1 · Low', 1), opt('3 · Medium', 3), opt('5 · Critical', 5)];
export function bulkModal({ invoker, count = 3 }) {
  const n = Math.max(1, Math.min(BULK_MAX, count));
  const blocks = [{ type: 'context', elements: [md('Fill in as many tasks as you need — empty sections are skipped. Each task gets its own owner, deadline, size and impact.')] }];
  for (let i = 0; i < n; i++) {
    blocks.push({ type: 'divider' }, { type: 'header', text: pt(`Task ${i + 1}`) });
    blocks.push(
      input(`t${i}_title`, 'Title', { type: 'plain_text_input', placeholder: pt('What needs to be done?') }, true),
      input(`t${i}_desc`, 'Description', { type: 'plain_text_input', multiline: true, placeholder: pt('What does done look like?') }, true),
      input(`t${i}_owner`, 'Owner', { type: 'users_select', ...(invoker ? { initial_user: invoker } : {}) }, true),
      input(`t${i}_due`, 'Deadline (6:30 PM IST)', { type: 'datepicker', initial_date: dateKey(addDays(now(), 3)) }, true),
      input(`t${i}_size`, 'Size', { type: 'static_select', options: SIZE_OPTS, initial_option: SIZE_OPTS[1] }, true),
      input(`t${i}_impact`, 'Impact', { type: 'static_select', options: IMPACT_OPTS, initial_option: IMPACT_OPTS[1] }, true),
      input(`t${i}_reason`, 'Why this impact? (one line)', { type: 'plain_text_input' }, true)
    );
  }
  if (n < BULK_MAX) blocks.push({ type: 'actions', block_id: 'bulk_more', elements: [{ type: 'button', action_id: 'bulk_more', text: pt('+ Add another task'), value: String(n) }] });
  else blocks.push({ type: 'context', elements: [md(`That's the most for one go (${BULK_MAX}). Submit these, then run \`/task bulk\` again.`)] });
  return {
    type: 'modal',
    callback_id: 'hb_bulk',
    private_metadata: JSON.stringify({ count: n, invoker }),
    title: pt('Add tasks'),
    submit: pt('Create tasks'),
    close: pt('Cancel'),
    blocks,
  };
}
// Reads the filled-in sections; returns { rows, errors } (errors keyed by block for Slack).
export function bulkRows(values, count) {
  const v = readValues(values);
  const rows = [];
  const errors = {};
  for (let i = 0; i < count; i++) {
    const title = (v[`t${i}_title`] || '').trim();
    if (!title) continue;
    const row = {
      title: cut(title, 150),
      desc: (v[`t${i}_desc`] || '').trim(),
      owner: v[`t${i}_owner`],
      due: v[`t${i}_due`],
      size: v[`t${i}_size`] || 'M',
      impact: +(v[`t${i}_impact`] || 3),
      reason: (v[`t${i}_reason`] || '').trim(),
    };
    if (!row.owner) errors[`t${i}_owner`] = 'Pick an owner.';
    if (!row.due) errors[`t${i}_due`] = 'Pick a deadline.';
    else if (row.due < dateKey(now())) errors[`t${i}_due`] = 'Pick today or a later date.';
    if (!row.reason) errors[`t${i}_reason`] = 'Add a one-line reason for the impact.';
    rows.push(row);
  }
  if (!rows.length) errors.t0_title = 'Add at least one task.';
  return { rows, errors };
}
export async function runBulk(ctx, slackUser, rows) {
  const creator = await hbUserForSlack(ctx, slackUser);
  if (!creator) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks.");
  const owners = {};
  for (const r0 of rows) if (!(r0.owner in owners)) owners[r0.owner] = await hbUserForSlack(ctx, r0.owner);
  const created = [];
  const failed = [];
  const r = await runAs(ctx, (s) => {
    for (const row of rows) {
      const ownerId = owners[row.owner];
      if (!ownerId) {
        failed.push(`${row.title} — the owner isn't on HB+ Tasks yet`);
        continue;
      }
      const res = createItem(s, creator, {
        type: 'task', title: row.title, desc: row.desc, ownerId, deadline: atTime(row.due, P(s, 'defaultDeadlineTime')),
        size: row.size, impact: row.impact, impactReason: row.reason, progressMethod: 'stages',
      });
      if (res.error) failed.push(`${row.title} — ${res.error}`);
      else created.push(res.id);
    }
    return created.length ? { ok: true } : { error: failed[0] || 'Nothing to create.' };
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't create the tasks: ${r.error}`);
  const list = created
    .map((id) => itemById(r.s, id))
    .map((it) => `• *${it.key}* ${it.title} — ${it.ownerId === creator ? 'you' : firstName(r.s, it.ownerId)} · ${it.size} · Impact ${it.impact} · due ${fmtDT(it.currentDeadline)}`)
    .join('\n');
  const url = link(ctx, '/tasks');
  await dm(
    ctx,
    slackUser,
    `✅ Created ${created.length} task${created.length > 1 ? 's' : ''}:\n${list}` +
      (failed.length ? `\n\nCouldn't create:\n${failed.map((x) => `• ${x}`).join('\n')}` : '') +
      (url ? `\n<${url}|Open My Tasks>` : '')
  );
  return r;
}

/* ---------- Supabase Edge Function entry point (Deno) ---------- */
if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    const env = (k) => Deno.env.get(k);
    const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY') || env('HB_SERVICE_KEY');
    if (!serviceKey) console.error('hb-slack: no service key found (SUPABASE_SERVICE_ROLE_KEY)');
    const client = createClient(env('SUPABASE_URL'), serviceKey, { auth: { persistSession: false } });
    const ctx = { client, slack: makeSlack(env('SLACK_BOT_TOKEN')), appUrl: env('HB_APP_URL') };
    const jobs = [];
    const background = (p) => {
      const job = Promise.resolve(p).catch((e) => console.error(e));
      if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(job);
      else jobs.push(job); // no background support: finish before replying
    };
    try {
      // Schedule: send DMs, digest and posts.
      if (req.headers.get('x-cron-secret') !== null) {
        if (req.headers.get('x-cron-secret') !== env('HB_CRON_SECRET')) return new Response('Unauthorized', { status: 401 });
        return Response.json(await deliver(ctx, { publishHome: new Date().getUTCMinutes() % 10 === 0 }));
      }
      // Slack: buttons, pop-ups, /task, shortcut.
      const raw = await req.text();
      if (!(await verifySlack(req.headers, raw, env('SLACK_SIGNING_SECRET')))) return new Response('Invalid Slack signature', { status: 401 });
      const form = new URLSearchParams(raw);
      const out = form.get('command') ? await handleCommand(ctx, form, background) : await handleInteraction(ctx, JSON.parse(form.get('payload') || '{}'), background);
      if (jobs.length) await Promise.all(jobs);
      return out ? Response.json(out) : new Response('', { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response('', { status: 200 });
    }
  });
}
