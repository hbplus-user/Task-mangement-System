import { P } from './policy.js';
import {
  firstName, ownersManager, mainManager, founders, notify, post, scoreEvent, once, flagsOf, effectiveDeadline, allowedPauseMs,
  activeUsers, isManager, isFounder, children, userById, managerOf, nameOf, teamScope, isWorkItem, progressOf,
} from './core.js';
import { closeWithRating, requestApproval, pendingFor, runRecurring, startCycle, checkProjectClose } from './actions.js';
import { sowRequired, sowDay, sowStatus, sowDayOf } from './sow.js';
import { leaderboard, tierOf, deliveryScore } from './scoring.js';
import { now, DAY, HOUR, atTime, addKey, dateKey, parseKey, startOfWeek, startOfMonth, addMonths, fmtDT, monthName, weekday, endOfMonth, isWorkingDay } from '../lib/time.js';
import { hourOf } from '../lib/time.js';

// Runs every minute (and on load). Returns true if anything changed.
export function tick(s) {
  const t = now();
  const before = s.notifications.length + s.scoreEvents.length + s.items.length + s.approvals.length + s.sowDays.length;
  const flagCount = Object.keys(s.flags).length;

  for (const item of s.items) {
    const f = flagsOf(s, item, t);
    const om = ownersManager(s, item);
    // Not accepted after 24h (P11 + nudge)
    if (item.status === 'awaiting' && !item.declined && t - (item.assignedAt || item.createdAt) > P(s, 'notAcceptedNudgeH') * HOUR && once(s, `na:${item.id}:${item.ownerId}:${item.assignedAt}`)) {
      notify(s, [item.ownerId, item.creatorId], `Gentle nudge: *${item.title}* is still waiting for ${firstName(s, item.ownerId)} to accept. Accept, or Discuss if something's unclear.`, { itemId: item.id, buttons: ['accept', 'open'] });
      scoreEvent(s, item.ownerId, item.id, 'not_accepted', 'P11', -P(s, 'notAccepted'), `Not accepted within ${P(s, 'notAcceptedNudgeH')}h`);
    }
    // Review reminders and auto-accept
    if (item.status === 'in_review' && item.submittedAt) {
      const waited = t - item.submittedAt;
      const auto = +P(s, 'autoAcceptH');
      if (waited > P(s, 'reviewNudgeH') * HOUR && once(s, `rv:${item.id}:${item.submittedAt}`)) {
        notify(s, item.reviewerId, `*${item.title}* has been waiting for your review for ${Math.floor(waited / HOUR)}h. A quick look keeps ${firstName(s, item.ownerId)} moving.`, { itemId: item.id, buttons: ['review', 'open'] });
      }
      if (auto > 0 && waited > auto * HOUR) {
        closeWithRating(s, item, 2, null, true);
        notify(s, managerOf(s, item.reviewerId, item.vertical), `*${item.title}* auto-closed at 2★ — ${firstName(s, item.reviewerId)} didn't review it within ${auto}h.`, { itemId: item.id, mode: 'digest' });
      }
    }
    if (['open', 'in_progress', 'awaiting'].includes(item.status) && item.currentDeadline && item.type !== 'stream') {
      const d = effectiveDeadline(s, item, t);
      if (d - t <= DAY && d > t && once(s, `due24:${item.id}:${d}`)) {
        notify(s, [item.ownerId, item.assigneeId], `⏰ *${item.title}* is due ${fmtDT(d)}. You've got this — anything you need?`, { itemId: item.id, buttons: ['update', 'submit', 'open'] });
      }
      if (f.atRisk && once(s, `risk:${item.id}:${dateKey(t)}`)) {
        const days = Math.max(0, Math.round((d - t) / DAY));
        notify(s, [item.ownerId, om], `Quick check-in on *${item.title}* — due in ${days} day${days === 1 ? '' : 's'}, ${progressOf(s, item)}% done. What would help you finish strong?`, { itemId: item.id, buttons: ['update', 'extension', 'block', 'open'] });
      }
      if (f.overdue && once(s, `over:${item.id}:${item.currentDeadline}`)) {
        notify(s, [item.ownerId, item.creatorId, om], `*${item.title}* passed its deadline (${fmtDT(d)}). Let's close the loop — share an update or a new plan.`, { itemId: item.id, buttons: ['update', 'extension', 'block', 'open'] });
      }
    }
    // Blocked beyond the free pause → owner's manager approves each extra day
    if (item.status === 'blocked' && item.blockedAt && t - item.blockedAt > allowedPauseMs(s, item) && !pendingFor(s, item, 'blocked_extra')) {
      const n = (item.blockedApprovedDays || 0) + P(s, 'blockedFreeDays') + 1;
      if (once(s, `bx:${item.id}:${n}`)) {
        requestApproval(s, 'blocked_extra', item, item.ownerId, [om], { day: n }, `*${item.title}* has been blocked by ${firstName(s, item.blockedBy)} for over ${n - 1} days. Pause the deadline clock for day ${n}?`);
        notify(s, item.ownerId, `*${item.title}* has been blocked for ${n - 1} days. ${firstName(s, om)} has been asked to approve more paused time.`, { itemId: item.id });
      }
    }
    // Stream cycles: start the next cycle at cycle end; remind manager to verify
    if (item.type === 'stream' && !['cancelled', 'closed'].includes(item.status)) {
      const cycles = children(s, item.id).filter((c) => c.type === 'cycle').sort((a, b) => a.cycleStart - b.cycleStart);
      const last = cycles[cycles.length - 1];
      if (last && t > last.currentDeadline) {
        const kpis = s.kpis.filter((k) => k.itemId === last.id).map((k) => ({ name: k.name, target: k.target, unit: k.unit, dir: k.dir, agg: k.agg, source: k.source, sourceMetric: k.sourceMetric }));
        const c = startCycle(s, item, parseKey(addKey(dateKey(last.currentDeadline), 1)), kpis);
        notify(s, item.ownerId, `New cycle for *${item.title}* has started (targets copied from last cycle — edit if needed).`, { itemId: c.id });
        notify(s, ownersManager(s, item), `*${last.title}* has ended. Please verify the KPI actuals to close it.`, { itemId: last.id, buttons: ['open'] });
      }
      for (const c of cycles.filter((c) => !c.verified && t > c.currentDeadline + 3 * DAY)) {
        if (once(s, `kpiver:${c.id}`)) notify(s, ownersManager(s, item), `KPIs for *${c.title}* still need your verification (cycle ended ${fmtDT(c.currentDeadline)}).`, { itemId: c.id, buttons: ['open'] });
      }
      if (weekday(t) === 6 && hourOf(t) >= 10 && once(s, `kpisat:${item.id}:${dateKey(t)}`)) {
        notify(s, item.ownerId, `📊 It's Saturday — time to enter this week's KPI actuals for *${item.title}* (with a source link).`, { itemId: last?.id || item.id, buttons: ['open'] });
      }
    }
  }
  // Projects that may have closed
  for (const p of s.items.filter((i) => i.type === 'project' && ['open', 'in_progress'].includes(i.status))) checkProjectClose(s, p.id);
  // Recurring rules
  for (const r of s.recurring) runRecurring(s, r);

  // Daily SOW
  const today = dateKey(t);
  for (const u of activeUsers(s)) {
    for (let i = 1; i <= 21; i++) {
      const k = addKey(today, -i);
      if (!sowRequired(s, u.id, k) || sowStatus(s, u.id, k, t) !== 'missed') continue;
      const d = sowDay(s, u.id, k);
      if (d.missedPenalized) continue;
      d.missedPenalized = true;
      if (!d.submittedAt) d.status = 'missed';
      scoreEvent(s, u.id, null, 'sow_missed', 'P7', -P(s, 'sowMissed'), `Daily SOW for ${k} not submitted by ${P(s, 'sowDeadline')} next day`, Math.min(t, atTime(addKey(k, 1), P(s, 'sowDeadline'))));
      notify(s, u.id, `Your SOW for ${k} didn't come in by 10 AM. It's still needed — take 3 minutes to fill it when you can.`, { buttons: ['sow'], quietOk: true });
      notify(s, mainManager(s, u.id), `10 AM report: ${firstName(s, u.id)} missed the SOW for ${k}.`, { mode: 'instant', critical: true });
      const ws = startOfWeek(parseKey(k));
      const misses = s.sowDays.filter((x) => x.userId === u.id && x.missedPenalized && startOfWeek(parseKey(x.date)) === ws).length;
      if (misses >= 3 && once(s, `miss3:${u.id}:${ws}`)) {
        scoreEvent(s, u.id, null, 'sow_missed3', 'P8', -P(s, 'sowMissed3'), '3 SOW misses in one week');
        notify(s, [mainManager(s, u.id), ...founders(s)], `${nameOf(s, u.id)} has missed 3 SOWs this week. A supportive check-in might help.`, { exclude: [u.id] });
      }
    }
    // Nudges 6:30 PM and 9 PM
    if (sowRequired(s, u.id, today) && !sowDayOf(s, u.id, today)?.submittedAt) {
      if (t >= atTime(today, P(s, 'sowNudge1')) && once(s, `n1:${u.id}:${today}`)) {
        notify(s, u.id, 'Wrapping up? 🌿 Take 3 minutes to log today and pick tomorrow\'s top 3.', { buttons: ['sow'], quietOk: true, kind: 'sow' });
      }
      if (t >= atTime(today, P(s, 'sowNudge2')) && once(s, `n2:${u.id}:${today}`)) {
        notify(s, u.id, 'Still time to log today 🌙 — your SOW counts as on time until 11:59 PM.', { buttons: ['sow'], quietOk: true, kind: 'sow' });
      }
    }
  }

  // Monday 9 AM digest for managers & founders
  const ws = startOfWeek(t);
  if (weekday(t) === 1 && t >= atTime(today, '09:00')) {
    for (const u of activeUsers(s).filter((u) => isManager(s, u.id) || isFounder(s, u.id))) {
      if (!once(s, `mon:${u.id}:${ws}`)) continue;
      const team = teamScope(s, u.id);
      const open = s.items.filter((i) => team.includes(i.ownerId) && isWorkItem(i));
      const overdue = open.filter((i) => flagsOf(s, i).overdue).length;
      const due = open.filter((i) => i.currentDeadline >= ws && i.currentDeadline < ws + 7 * DAY && !['closed', 'cancelled'].includes(i.status)).length;
      notify(s, u.id, `☀️ Monday digest — your team has ${due} tasks due this week and ${overdue} overdue. Pending approvals are in your inbox.`, { kind: 'digest' });
    }
  }
  // Monthly: perfect SOW month (R7) + top performers post
  const lastMonth = startOfMonth(addMonths(startOfMonth(t), -1));
  const mKey = dateKey(lastMonth);
  if (once(s, `month:${mKey}`)) {
    for (const u of activeUsers(s)) {
      let req = 0;
      let ok = 0;
      for (let d = lastMonth; d <= endOfMonth(lastMonth); d += DAY) {
        const k = dateKey(d + 2 * HOUR);
        if (!sowRequired(s, u.id, k)) continue;
        req++;
        if (sowStatus(s, u.id, k) === 'on_time') ok++;
      }
      if (req >= 20 && ok === req) {
        scoreEvent(s, u.id, null, 'sow_month', 'R7', P(s, 'sowMonthBonus'), `Perfect SOW month (${monthName(lastMonth, true)})`, atTime(endOfMonth(lastMonth), '23:00'));
      }
    }
    const top = leaderboard(s, lastMonth).slice(0, 5);
    if (top.length) {
      post(s, 'credits', `🏆 Top performers for ${monthName(lastMonth, true)}:\n${top.map((r, i) => `${i + 1}. ${nameOf(s, r.id)} — ${tierOf(s, r.score).name}`).join('\n')}\nThank you for the ownership, everyone!`);
    }
  }

  const after = s.notifications.length + s.scoreEvents.length + s.items.length + s.approvals.length + s.sowDays.length;
  return after !== before || Object.keys(s.flags).length !== flagCount;
}
