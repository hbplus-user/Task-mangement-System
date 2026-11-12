// Phase 3: goals and performance reviews (PRD §1: "task score is one part of performance;
// leave room for top goals, behavioural/skill goals, health goals, extra initiatives and KPIs").
import { P } from './policy.js';
import { uid, userById, firstName, nameOf, notify, log, isFA, reportTree, mainManager, itemById, isWorkItem, children, ownersManager, isFounder } from './core.js';
import { deliveryScore, fyQuarter, fyYear } from './scoring.js';
import { sowCompliance } from './sow.js';
import { cycleAchievement } from './actions.js';
import { now, DAY, startOfMonth, addMonths, endOfMonth, dateKey, parseKey, fmtDate, monthName, fromIst, ist } from '../lib/time.js';

const err = (message) => ({ error: message });

export const GOAL_TYPES = [
  ['top', 'Top goal'],
  ['behaviour', 'Behaviour / skill'],
  ['health', 'Health'],
  ['initiative', 'Extra initiative'],
  ['kpi', 'KPI'],
];
export const GOAL_LABEL = Object.fromEntries(GOAL_TYPES);
export const MEASURES = [
  ['number', 'Number'],
  ['percent', 'Percent'],
  ['done', 'Done / not done'],
];

// Visibility (PRD §8): self sees own; managers see their tree; founders/admins see all.
export const canSeePerson = (s, viewer, target) => viewer === target || isFA(s, viewer) || reportTree(s, viewer).includes(target);
export const canManagePerson = (s, viewer, target) => viewer !== target && (isFA(s, viewer) || reportTree(s, viewer).includes(target));

/* ---------- Periods ---------- */
// Financial-year quarters (Apr–Mar), the full year, and the last few months.
export function periodOptions(ts = now()) {
  const out = [];
  let q = fyQuarter(ts);
  for (let i = 0; i < 4; i++) {
    const start = q.start;
    const end = endOfMonth(q.months[2]);
    out.push({ key: dateKey(start) + ':q', label: q.label, start: dateKey(start), end: dateKey(end) });
    q = fyQuarter(addMonths(start, -1));
  }
  const y = fyYear(ts);
  out.push({ key: dateKey(y.months[0]) + ':y', label: y.label, start: dateKey(y.months[0]), end: dateKey(endOfMonth(y.months[11])) });
  for (let m = 0; m < 3; m++) {
    const ms = startOfMonth(addMonths(startOfMonth(ts), -m));
    out.push({ key: dateKey(ms) + ':m', label: `${monthName(ms, true)} ${ist(ms).y}`, start: dateKey(ms), end: dateKey(endOfMonth(ms)) });
  }
  return out;
}

/* ---------- Goals ---------- */
export function goalProgress(g) {
  if (g.measure === 'done') return (g.current || 0) >= 1 ? 100 : 0;
  const target = +g.target;
  const cur = +(g.current || 0);
  if (!target) return 0;
  const raw = g.dir === '<=' ? (cur <= 0 ? 0 : cur <= target ? 1 : target / cur) : cur / target;
  return Math.round(Math.max(0, Math.min(raw, 1.2)) * 100);
}
// Expected progress for "on track" — straight line through the period.
export function goalHealth(g, at = now()) {
  if (g.status === 'achieved') return 'achieved';
  if (g.status === 'dropped') return 'dropped';
  const p = goalProgress(g);
  if (p >= 100) return 'achieved';
  const start = parseKey(g.periodStart);
  const end = parseKey(g.periodEnd) + DAY;
  const expected = Math.max(0, Math.min(1, (at - start) / Math.max(1, end - start))) * 100;
  if (at > end) return 'missed';
  if (p >= expected - 10) return 'on_track';
  if (p >= expected - 30) return 'behind';
  return 'off_track';
}
export const HEALTH_LABEL = { achieved: 'Achieved', dropped: 'Dropped', missed: 'Missed', on_track: 'On track', behind: 'A little behind', off_track: 'Needs attention' };
export const HEALTH_TONE = { achieved: 'ok', dropped: 'blocked', missed: 'overdue', on_track: 'ok', behind: 'risk', off_track: 'overdue' };

export function createGoal(s, by, d) {
  if (!d.userId) return err('Pick whose goal this is.');
  if (!canSeePerson(s, by, d.userId)) return err('You can only set goals for yourself or people in your team.');
  if (!GOAL_LABEL[d.type]) return err('Pick a goal type.');
  if (!d.title?.trim()) return err('Give the goal a title.');
  if (!d.periodStart || !d.periodEnd || d.periodEnd < d.periodStart) return err('Set a period (start and end).');
  if (d.measure !== 'done' && !(+d.target > 0)) return err('Set a target above zero.');
  const g = {
    id: uid('g'),
    userId: d.userId,
    type: d.type,
    title: d.title.trim(),
    desc: d.desc || '',
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    measure: d.measure || 'number',
    dir: d.dir === '<=' ? '<=' : '>=',
    target: d.measure === 'done' ? 1 : +d.target,
    current: +(d.current || 0),
    unit: d.unit || (d.measure === 'percent' ? '%' : ''),
    weight: Math.max(1, Math.min(5, +d.weight || 1)),
    private: d.type === 'health' ? true : !!d.private,
    status: 'active',
    createdBy: by,
    createdAt: now(),
    checkins: [],
  };
  s.goals.push(g);
  log(s, by, null, 'Goal added', null, `${nameOf(s, g.userId)}: ${g.title}`);
  if (by !== g.userId) notify(s, g.userId, `🎯 ${firstName(s, by)} set a ${GOAL_LABEL[g.type].toLowerCase()} goal for you: *${g.title}* (${fmtDate(parseKey(g.periodStart))} – ${fmtDate(parseKey(g.periodEnd))}).`, { mode: 'digest' });
  else if (!g.private) notify(s, mainManager(s, by), `🎯 ${firstName(s, by)} added a goal: *${g.title}*.`, { mode: 'digest' });
  return { id: g.id };
}

export function updateGoal(s, by, goalId, patch) {
  const g = s.goals.find((x) => x.id === goalId);
  if (!g) return err('Goal not found.');
  if (!canSeePerson(s, by, g.userId)) return err("You can't change this goal.");
  for (const k of ['title', 'desc', 'periodStart', 'periodEnd', 'target', 'unit', 'weight', 'dir', 'private']) {
    if (patch[k] === undefined) continue;
    if (k === 'private' && g.type === 'health') continue;
    const v = ['target', 'weight'].includes(k) ? +patch[k] : patch[k];
    if (v !== g[k]) {
      log(s, by, null, `Goal ${k}`, String(g[k] ?? ''), String(v));
      g[k] = v;
    }
  }
  return { ok: true };
}

export function checkInGoal(s, by, goalId, value, note) {
  const g = s.goals.find((x) => x.id === goalId);
  if (!g) return err('Goal not found.');
  if (!canSeePerson(s, by, g.userId)) return err("You can't update this goal.");
  if (value === '' || value == null || isNaN(+value)) return err('Enter the current value.');
  if (!note?.trim()) return err('Add a short note — what moved?');
  const before = goalProgress(g);
  g.checkins = [...(g.checkins || []), { id: uid('gc'), ts: now(), value: +value, note: note.trim(), by }];
  g.current = +value;
  g.lastCheckIn = now();
  const after = goalProgress(g);
  if (after >= 100 && !g.achievedAt) {
    g.achievedAt = now();
    notify(s, [g.userId, mainManager(s, g.userId)], `🏁 Goal reached: *${g.title}* — ${g.current}${g.unit} of ${g.target}${g.unit}. Lovely work, ${firstName(s, g.userId)}!`, { exclude: [by] });
  }
  log(s, by, null, `Goal check-in: ${g.title}`, `${before}%`, `${after}%`);
  return { ok: true };
}

export function setGoalStatus(s, by, goalId, status, note) {
  const g = s.goals.find((x) => x.id === goalId);
  if (!g) return err('Goal not found.');
  if (!canSeePerson(s, by, g.userId)) return err("You can't change this goal.");
  if (!['active', 'achieved', 'dropped'].includes(status)) return err('Unknown status.');
  if (!note?.trim()) return err('Add a short reason.');
  log(s, by, null, `Goal ${status}: ${g.title}`, g.status, status);
  g.status = status;
  g.statusNote = note.trim();
  if (status === 'achieved' && !g.achievedAt) g.achievedAt = now();
  return { ok: true };
}

export const goalsFor = (s, viewer, userId) => s.goals.filter((g) => g.userId === userId && canSeePerson(s, viewer, g.userId));
export const linkedTasks = (s, goalId) => s.items.filter((i) => (i.goalLinks || []).includes(goalId));
const overlaps = (g, start, end) => g.periodStart <= end && g.periodEnd >= start;

/* ---------- Performance summary ---------- */
export const PERF_COMPONENTS = [
  ['tasks', 'Task delivery', 'perfWTasks'],
  ['goals', 'Top goals & initiatives', 'perfWGoals'],
  ['behaviour', 'Behaviour & skills', 'perfWBehaviour'],
  ['kpi', 'Stream KPIs', 'perfWKpi'],
  ['sow', 'Daily SOW', 'perfWSow'],
  ['health', 'Health goals', 'perfWHealth'],
];

function avgGoals(list) {
  const live = list.filter((g) => g.status !== 'dropped');
  if (!live.length) return null;
  const w = live.reduce((a, g) => a + (g.weight || 1), 0);
  return Math.round(live.reduce((a, g) => a + goalProgress(g) * (g.weight || 1), 0) / w);
}

// Everything a review needs for one person and period. Each component is "% of target" (100 = on target, max 120).
export function perfSummary(s, userId, startKey, endKey) {
  const start = parseKey(startKey);
  const end = parseKey(endKey) + DAY - 1;
  const until = Math.min(end, now());
  // Delivery Score per month in the period
  const months = [];
  for (let m = startOfMonth(start); m <= until; m = startOfMonth(addMonths(m, 1))) {
    const d = deliveryScore(s, userId, m);
    months.push({ label: monthName(m), score: d.score });
  }
  const scored = months.filter((m) => m.score != null);
  const delivery = scored.length ? Math.round(scored.reduce((a, m) => a + m.score, 0) / scored.length) : null;
  const goals = s.goals.filter((g) => g.userId === userId && overlaps(g, startKey, endKey));
  // Stream KPI cycles owned in the period
  const cycles = s.items.filter((i) => i.type === 'cycle' && i.ownerId === userId && i.cycleStart >= start && i.cycleStart <= end && (i.verified || i.currentDeadline < now()));
  const cycleAvg = cycles.length ? Math.round((cycles.reduce((a, c) => a + cycleAchievement(s, c), 0) / cycles.length) * 100) : null;
  const kpiGoals = avgGoals(goals.filter((g) => g.type === 'kpi'));
  const kpi = cycleAvg != null && kpiGoals != null ? Math.round((cycleAvg + kpiGoals) / 2) : cycleAvg ?? kpiGoals;
  const values = {
    tasks: delivery == null ? null : Math.max(0, Math.min(delivery, 120)),
    goals: avgGoals(goals.filter((g) => g.type === 'top' || g.type === 'initiative')),
    behaviour: avgGoals(goals.filter((g) => g.type === 'behaviour')),
    kpi: kpi == null ? null : Math.min(kpi, 120),
    sow: sowCompliance(s, [userId], start, until),
    health: avgGoals(goals.filter((g) => g.type === 'health')),
  };
  const components = PERF_COMPONENTS.map(([key, label, wKey]) => ({ key, label, value: values[key], weight: +P(s, wKey) || 0 }));
  const counted = components.filter((c) => c.value != null && c.weight > 0);
  const wsum = counted.reduce((a, c) => a + c.weight, 0);
  const composite = wsum ? Math.round(counted.reduce((a, c) => a + c.value * c.weight, 0) / wsum) : null;
  // Task stats
  const ev = s.scoreEvents.filter((e) => e.userId === userId && e.type === 'task' && !e.reversed && e.ts >= start && e.ts <= end);
  const stats = {
    closed: ev.length,
    onTime: ev.length ? Math.round((ev.filter((e) => e.meta?.onTime).length / ev.length) * 100) : null,
    avgRating: ev.length ? Math.round((ev.reduce((a, e) => a + (e.meta?.rating || 2), 0) / ev.length) * 10) / 10 : null,
    impact5: ev.filter((e) => e.meta?.onTime && e.meta?.impact === 5).length,
    extensions: s.approvals.filter((a) => a.type === 'extension' && a.requesterId === userId && a.status === 'approved' && a.decidedAt >= start && a.decidedAt <= end).length,
  };
  return { months, components, composite, stats, goals: goals.map((g) => ({ id: g.id, type: g.type, title: g.title, progress: goalProgress(g), status: g.status, private: g.private })), cycles: cycles.map((c) => ({ id: c.id, title: c.title, pct: Math.round(cycleAchievement(s, c) * 100) })) };
}
export const RATING_LABEL = { 1: 'Needs significant support', 2: 'Partly meeting expectations', 3: 'Meeting expectations', 4: 'Exceeding expectations', 5: 'Outstanding' };

/* ---------- Reviews ---------- */
export function saveReview(s, by, d) {
  if (!canManagePerson(s, by, d.userId)) return err('Only their manager, a founder or an admin can write this review.');
  if (!d.periodStart || !d.periodEnd) return err('Pick a period.');
  if (d.share) {
    if (![1, 2, 3, 4, 5].includes(+d.rating)) return err('Pick an overall rating before sharing.');
    if (!d.strengths?.trim() || !d.improve?.trim()) return err('Add strengths and one area to grow before sharing.');
  }
  let r = d.id ? s.reviews.find((x) => x.id === d.id) : s.reviews.find((x) => x.userId === d.userId && x.periodStart === d.periodStart && x.periodEnd === d.periodEnd && x.reviewerId === by && x.status === 'draft');
  if (r && r.status !== 'draft') return err('This review was already shared. Start a new one for changes.');
  const summary = perfSummary(s, d.userId, d.periodStart, d.periodEnd);
  if (!r) {
    r = { id: uid('rv'), userId: d.userId, reviewerId: by, createdAt: now(), status: 'draft' };
    s.reviews.push(r);
  }
  Object.assign(r, {
    periodLabel: d.periodLabel || `${d.periodStart} – ${d.periodEnd}`,
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    snapshot: { composite: summary.composite, components: summary.components, stats: summary.stats },
    rating: d.rating ? +d.rating : null,
    strengths: d.strengths || '',
    improve: d.improve || '',
    notes: d.notes || '',
    updatedAt: now(),
  });
  if (d.share) {
    r.status = 'shared';
    r.sharedAt = now();
    log(s, by, null, 'Review shared', null, `${nameOf(s, r.userId)} · ${r.periodLabel}`);
    notify(s, r.userId, `📝 ${firstName(s, by)} shared your ${r.periodLabel} review. Have a read and acknowledge it in Goals → My reviews.`, {});
  }
  return { ok: true, id: r.id };
}

export function acknowledgeReview(s, by, reviewId, note) {
  const r = s.reviews.find((x) => x.id === reviewId);
  if (!r || r.userId !== by) return err('Only the person reviewed can acknowledge this.');
  if (r.status !== 'shared') return err('This review is not waiting for acknowledgement.');
  r.status = 'acknowledged';
  r.ackAt = now();
  r.ackNote = (note || '').trim();
  log(s, by, null, 'Review acknowledged', null, r.periodLabel);
  notify(s, r.reviewerId, `${firstName(s, by)} acknowledged their ${r.periodLabel} review${r.ackNote ? `: “${r.ackNote}”` : '.'}`, {});
  return { ok: true };
}
export const reviewsFor = (s, viewer, userId) =>
  s.reviews.filter((r) => r.userId === userId && (r.reviewerId === viewer || isFA(s, viewer) || reportTree(s, viewer).includes(userId) || (viewer === userId && r.status !== 'draft')));
