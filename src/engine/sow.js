import { P } from './policy.js';
import {
  uid, itemById, firstName, mainManager, isHoliday, flagsOf, effectiveDeadline, isWorkItem, notify, scoreEvent, once, addComment,
  activeUsers, userById, OFF_CODES,
} from './core.js';
import { perform } from './actions.js';
import { now, DAY, atTime, addKey, parseKey, dateKey, isWorkingDay, startOfWeek, startOfDay, startOfMonth, endOfMonth, fmtDate } from '../lib/time.js';

export const offDayOf = (s, userId, k) => s.offDays.find((o) => o.userId === userId && o.date === k);
export const sowDayOf = (s, userId, k) => s.sowDays.find((d) => d.userId === userId && d.date === k);
export function sowDay(s, userId, k) {
  let d = sowDayOf(s, userId, k);
  if (!d) {
    d = { id: uid('s'), userId, date: k, top3: [], entries: [], submittedAt: null, status: null };
    s.sowDays.push(d);
  }
  return d;
}

// SOW needed Mon–Sat, except company holidays and off days (half-day still needs a SOW).
export function sowRequired(s, userId, k) {
  if (!isWorkingDay(k) || isHoliday(s, k)) return false;
  const off = offDayOf(s, userId, k);
  const u = userById(s, userId);
  if (u?.joinedOn && k < u.joinedOn) return false;
  return !off || off.code === 'Half-day';
}
export function classify(s, k, submittedAt) {
  if (submittedAt <= atTime(k, '23:59') + 59 * 1000) return 'on_time';
  if (submittedAt <= atTime(addKey(k, 1), P(s, 'sowDeadline'))) return 'late';
  return 'missed';
}
// on_time | late | missed | pending | off | holiday | sunday | future
export function sowStatus(s, userId, k, at = now()) {
  if (!isWorkingDay(k)) return 'sunday';
  if (isHoliday(s, k)) return 'holiday';
  const off = offDayOf(s, userId, k);
  if (off && off.code !== 'Half-day') return 'off';
  const d = sowDayOf(s, userId, k);
  if (d?.submittedAt) return d.status || classify(s, k, d.submittedAt);
  if (k > dateKey(at)) return 'future';
  if (at > atTime(addKey(k, 1), P(s, 'sowDeadline'))) return 'missed';
  return 'pending';
}
export const SOW_LABEL = { on_time: 'On time', late: 'Late', missed: 'Missed', pending: 'Not yet', off: 'Off', holiday: 'Holiday', sunday: '—', future: '—' };

export function weekStreak(s, userId, at = now()) {
  const ws = startOfWeek(at);
  let onTime = 0;
  let required = 0;
  const days = [];
  for (let i = 0; i < 6; i++) {
    const k = dateKey(ws + i * DAY + 2 * 3600 * 1000);
    const st = sowStatus(s, userId, k, at);
    if (sowRequired(s, userId, k)) required++;
    if (st === 'on_time') onTime++;
    days.push({ k, st });
  }
  return { onTime, required, days };
}

// Last required day still open (late SOW is still mandatory).
export function openSowDays(s, userId, at = now()) {
  const res = [];
  for (let i = 1; i <= 7; i++) {
    const k = addKey(dateKey(at), -i);
    if (!sowRequired(s, userId, k)) continue;
    const d = sowDayOf(s, userId, k);
    if (!d?.submittedAt) res.push(k);
  }
  return res;
}

/* ---------- Top 3 ---------- */
export function myOpenWork(s, userId) {
  return s.items.filter((i) => (isWorkItem(i) || i.type === 'cycle') && (i.ownerId === userId || i.assigneeId === userId) && ['open', 'in_progress', 'blocked', 'in_review'].includes(i.status));
}
export function urgencyOf(s, item, at = now()) {
  const d = effectiveDeadline(s, item, at);
  if (d == null) return P(s, 'urgFar');
  const days = (d - at) / DAY;
  if (days < 0) return P(s, 'urgOverdue');
  if (days <= 2) return P(s, 'urgNear');
  if (days <= 7) return P(s, 'urgMid');
  return P(s, 'urgFar');
}
export function priorityOf(s, item, at = now()) {
  const f = flagsOf(s, item, at);
  return item.impact * urgencyOf(s, item, at) + (f.atRisk ? P(s, 'wAtRisk') : 0) + (item.pinned ? P(s, 'wPinned') : 0);
}
export function rankCandidates(s, userId, forKey, at = now()) {
  return myOpenWork(s, userId)
    .filter((i) => !['blocked', 'in_review'].includes(i.status))
    .filter((i) => !i.pickupDate || i.pickupDate <= forKey)
    .map((i) => ({ item: i, p: priorityOf(s, i, at) }))
    .sort((a, b) => b.p - a.p || (a.item.currentDeadline || 0) - (b.item.currentDeadline || 0));
}
export const suggestTop3 = (s, userId, forKey, at) => rankCandidates(s, userId, forKey, at).slice(0, 3).map((x) => x.item.id);

export function todaysTop3(s, userId, k = dateKey(now())) {
  const d = sowDayOf(s, userId, k);
  const valid = (id) => {
    const i = itemById(s, id);
    return i && (i.ownerId === userId || i.assigneeId === userId) && !['cancelled', 'skipped'].includes(i.status);
  };
  if (d?.top3?.length) return { ids: d.top3.filter(valid), planned: true };
  return { ids: suggestTop3(s, userId, k), planned: false };
}

// Tasks to report on in the end-of-day update: top 3 + due today + touched today.
export function eodItems(s, userId, k) {
  const { ids } = todaysTop3(s, userId, k);
  const from = parseKey(k);
  const to = from + DAY;
  const touched = new Set(s.activity.filter((a) => a.userId === userId && a.itemId && a.ts >= from && a.ts < to).map((a) => a.itemId));
  const set = new Set(ids);
  for (const i of myOpenWork(s, userId)) {
    if (i.currentDeadline && startOfDay(i.currentDeadline) === from) set.add(i.id);
    if (touched.has(i.id)) set.add(i.id);
  }
  return [...set].map((id) => itemById(s, id)).filter((i) => i && ['open', 'in_progress', 'blocked'].includes(i.status) && (i.ownerId === userId || i.assigneeId === userId));
}

export function nextWorkingKey(s, k) {
  let n = addKey(k, 1);
  for (let g = 0; g < 10 && (!isWorkingDay(n) || isHoliday(s, n)); g++) n = addKey(n, 1);
  return n;
}

/* ---------- Submit ---------- */
// entries: [{itemId, outcome:'done'|'progress'|'not_touched', proofLink, progress, checklist, stage, pickupDate, reason, comment}]
export function submitSOW(s, userId, k, entries, plan) {
  const errors = [];
  for (const e of entries) {
    if (!e.outcome) errors.push('Pick Done, Progress or Not touched for every task.');
    if (e.outcome === 'not_touched' && (!e.reason || !e.comment?.trim())) errors.push('“Not touched” needs a reason and a short comment.');
    if (e.outcome === 'done') {
      const it = itemById(s, e.itemId);
      if (it.ownerId === userId && !/^https?:\/\/\S+\.\S+/.test(e.proofLink || '')) errors.push(`Add a proof link for “${it.title}”.`);
    }
  }
  const half = offDayOf(s, userId, plan.forKey)?.code === 'Half-day';
  if (!plan.top3.length && !half) errors.push('Pick at least one task for tomorrow.');
  if (half && plan.top3.length < 1) errors.push('Half-day: pick at least 1 task.');
  for (const id of plan.droppedOverdue || []) if (!plan.dropReasons?.[id]?.trim()) errors.push('Add a one-line reason for each overdue task you dropped.');
  if (errors.length) return { error: [...new Set(errors)][0] };

  for (const e of entries) {
    const it = itemById(s, e.itemId);
    const note = e.comment?.trim();
    if (e.outcome === 'done') {
      if (it.ownerId === userId) {
        const r = perform(s, userId, it.id, 'submit', { proofLink: e.proofLink, comment: note || 'Done — submitted from my daily SOW.' });
        if (r.error) return r;
      } else {
        perform(s, userId, it.id, 'assign_back', { comment: note || 'My part is done — handing back (daily SOW).' });
      }
    } else if (e.outcome === 'progress') {
      if (['open', 'in_progress'].includes(it.status)) {
        const r = perform(s, userId, it.id, 'update', { progress: e.progress, stage: e.stage, checklist: e.checklist, pickupDate: e.pickupDate, comment: note || 'Progress logged in daily SOW.' });
        if (r.error) return r;
      }
      it.pickupDate = e.pickupDate || it.pickupDate;
    } else {
      addComment(s, userId, it.id, `Not touched today — ${e.reason}: ${note}`, 'Daily SOW');
    }
  }
  const day = sowDay(s, userId, k);
  day.entries = entries.map((e) => ({ itemId: e.itemId, outcome: e.outcome, reason: e.reason || null, comment: e.comment || '', pickupDate: e.pickupDate || null }));
  day.submittedAt = now();
  day.status = classify(s, k, day.submittedAt);
  const next = sowDay(s, userId, plan.forKey);
  next.top3 = plan.top3;
  next.plannedAt = now();
  next.dropReasons = plan.dropReasons || {};

  // R6: all required days this week on time
  if (day.status === 'on_time') {
    const ws = startOfWeek(parseKey(k));
    const keys = Array.from({ length: 6 }, (_, i) => dateKey(ws + i * DAY + 2 * 3600 * 1000));
    const req = keys.filter((x) => sowRequired(s, userId, x));
    const lastReq = req[req.length - 1];
    if (req.length && k === lastReq && req.every((x) => sowStatus(s, userId, x) === 'on_time') && once(s, `streak:${userId}:${ws}`)) {
      scoreEvent(s, userId, null, 'streak', 'R6', P(s, 'sowWeekBonus'), `SOW ${req.length}/${req.length} on time this week`);
      notify(s, userId, `🔥 ${req.length}/${req.length} on-time SOWs this week! +${P(s, 'sowWeekBonus')} points. Lovely rhythm.`, { quietOk: true });
    }
  }
  return { ok: true, status: day.status };
}

export function markOff(s, userId, k, code, reason) {
  if (!OFF_CODES.includes(code)) return { error: 'Pick a reason code.' };
  if (code === 'Other' && !reason?.trim()) return { error: 'Tell us a little about “Other”.' };
  if (offDayOf(s, userId, k)) return { error: `${fmtDate(parseKey(k))} is already marked off.` };
  s.offDays.push({ id: uid('o'), userId, date: k, code, reason: reason || '', ts: now() });
  s.activity.push({ id: uid('a'), ts: now(), userId, itemId: null, action: 'Marked off day', from: null, to: `${k} · ${code}` });
  const ms = startOfMonth(parseKey(k));
  const me = endOfMonth(ms);
  const personal = s.offDays.filter((o) => o.userId === userId && o.code !== 'Company holiday' && parseKey(o.date) >= ms && parseKey(o.date) <= me).length;
  if (personal > P(s, 'offDaysBeforeAlert') && code !== 'Company holiday') {
    notify(s, mainManager(s, userId), `${firstName(s, userId)} has marked ${personal} personal off days this month (latest: ${code}). Maybe check in on how they're doing.`, {});
  }
  return { ok: true };
}

export function sowCompliance(s, userIds, from, to) {
  let req = 0;
  let ok = 0;
  for (const id of userIds) {
    for (let t = startOfDay(from); t <= to && t <= now(); t += DAY) {
      const k = dateKey(t + 2 * 3600 * 1000);
      if (!sowRequired(s, id, k)) continue;
      const st = sowStatus(s, id, k);
      if (st === 'pending' || st === 'future') continue;
      req++;
      if (st === 'on_time' || st === 'late') ok++;
    }
  }
  return req ? Math.round((ok / req) * 100) : null;
}
export { activeUsers };
