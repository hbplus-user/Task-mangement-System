import { P } from './policy.js';
import { baseOf, scoreEvent, userById, activeUsers, isFounder, isWorkItem, itemById } from './core.js';
import { now, DAY, HOUR, startOfMonth, endOfMonth, addMonths, startOfWeek, dateKey } from '../lib/time.js';
import { yearOf, monthIndex, fromIst } from '../lib/time.js';

const r1 = (n) => Math.round(n * 10) / 10;

// Points a task would earn, for the "Potential points" hint.
export function potentialPoints(s, item) {
  const b = baseOf(s, item);
  return { base: b, max: r1(b * P(s, 'earlyMult') * P(s, 'q3')) };
}

// Called when a reviewer accepts (or the system auto-accepts).
export function scoreTaskClose(s, item, ts = now()) {
  const b = baseOf(s, item, ts);
  const rating = item.rating || 2;
  const q = P(s, `q${rating}`, ts);
  const deadline = item.deadlineAtSubmit ?? item.currentDeadline;
  const submitted = item.submittedAt ?? ts;
  const diff = deadline - submitted;
  let tm = 1;
  let when = 'on time';
  if (diff >= P(s, 'earlyH', ts) * HOUR) {
    tm = P(s, 'earlyMult', ts);
    const days = Math.floor(diff / DAY);
    when = days >= 1 ? `${days} day${days > 1 ? 's' : ''} early` : 'early';
  } else if (diff < 0) {
    when = 'late';
  }
  const pts = b * tm * q;
  const codes = [diff >= 0 ? 'R1' : null, tm > 1 ? 'R2' : null, rating === 3 ? 'R3' : rating === 1 ? 'P6' : null].filter(Boolean).join(' ');
  const main = scoreEvent(s, item.ownerId, item.id, 'task', codes || 'R1', pts, `Base ${b} × ${tm} timeliness × ${q} quality (${rating}★, ${when})`, ts, {
    early: tm > 1,
    onTime: diff >= 0,
    impact: item.impact,
    rating,
  });
  let latePts = 0;
  if (diff < 0) {
    const daysLate = -diff / DAY;
    const [code, frac, label] =
      daysLate <= 1 ? ['P1', P(s, 'late1', ts), 'up to 1 day'] : daysLate <= 3 ? ['P2', P(s, 'late2', ts), '2–3 days'] : ['P3', P(s, 'late3', ts), 'more than 3 days'];
    latePts = -b * frac;
    scoreEvent(s, item.ownerId, item.id, 'late', code, latePts, `Submitted late (${label}): −${frac * 100}% of Base ${b}`, ts);
  }
  return { pts: r1(pts), latePts: r1(latePts), when, base: b, rating };
}

// Reopen: points reversed until re-submitted. Extension penalties stay.
export function reverseTaskPoints(s, item) {
  for (const ev of s.scoreEvents.filter((e) => e.itemId === item.id && ['task', 'late', 'project', 'cycle'].includes(e.type) && !e.reversed)) {
    ev.reversed = true;
    scoreEvent(s, ev.userId, item.id, 'reversal', 'REV', -ev.points, `Reversed on reopen: ${ev.note}`);
  }
}

/* ---------- Delivery Score & tiers ---------- */
// Delivery Score = points earned ÷ points available (tasks due this month so far, at on-time & 2★) × 100
export function deliveryScore(s, userId, monthTs = now()) {
  const from = startOfMonth(monthTs);
  const to = Math.min(endOfMonth(monthTs), Math.max(now(), from));
  let available = 0;
  for (const it of s.items) {
    if (it.ownerId !== userId || !(isWorkItem(it) || it.type === 'cycle') || ['cancelled', 'skipped'].includes(it.status)) continue;
    const d = it.currentDeadline;
    if (!d || d < from || d > endOfMonth(monthTs)) continue;
    if (d <= to || it.status === 'closed') available += baseOf(s, it, d);
  }
  const earned = s.scoreEvents.filter((e) => e.userId === userId && e.ts >= from && e.ts <= endOfMonth(monthTs)).reduce((a, e) => a + e.points, 0);
  return { score: available ? Math.round((earned / available) * 100) : null, earned: r1(earned), available: r1(available) };
}

export function tierOf(s, score) {
  if (score == null) return { name: 'No tasks yet', key: 'none', emoji: '' };
  if (score >= P(s, 'tierPlatinum')) return { name: 'Platinum', key: 'platinum', emoji: '💎' };
  if (score >= P(s, 'tierGold')) return { name: 'Gold', key: 'gold', emoji: '🥇' };
  if (score >= P(s, 'tierSilver')) return { name: 'Silver', key: 'silver', emoji: '🥈' };
  if (score >= P(s, 'tierBronze')) return { name: 'Bronze', key: 'bronze', emoji: '🥉' };
  return { name: 'Needs support', key: 'support', emoji: '' };
}
// Private mood icon — never shown publicly.
export function moodOf(score) {
  if (score == null) return { icon: '🙂', label: 'Getting started' };
  if (score >= 95) return { icon: '😊', label: 'On track' };
  if (score >= 65) return { icon: '😐', label: 'Watch out' };
  return { icon: '😟', label: 'Needs attention' };
}

/* ---------- Badges (lifetime) ---------- */
export function badgesOf(s, userId) {
  const evs = s.scoreEvents.filter((e) => e.userId === userId && !e.reversed);
  const byMonth = {};
  const res = [];
  for (const e of evs.filter((e) => e.type === 'task' && e.meta?.early)) {
    const m = dateKey(startOfMonth(e.ts));
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  if (Object.values(byMonth).some((n) => n >= 5)) res.push({ key: 'early', name: 'Early Bird', how: '5 tasks submitted early in one month' });
  const weeks = evs.filter((e) => e.code === 'R6').map((e) => startOfWeek(e.ts)).sort((a, b) => a - b);
  let run = 1;
  let best = weeks.length ? 1 : 0;
  for (let i = 1; i < weeks.length; i++) {
    run = Math.round((weeks[i] - weeks[i - 1]) / (7 * DAY)) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  if (best >= 4) res.push({ key: 'streak', name: 'Streak Master', how: '4 consecutive weeks of 6/6 SOW' });
  // Closer: a full past month with tasks and zero late submissions
  for (let m = 1; m <= 6; m++) {
    const ms = startOfMonth(addMonths(now(), -m));
    const me = endOfMonth(ms);
    const due = s.items.filter((i) => i.ownerId === userId && isWorkItem(i) && i.currentDeadline >= ms && i.currentDeadline <= me && i.status !== 'cancelled');
    if (due.length >= 3 && !evs.some((e) => e.type === 'late' && e.ts >= ms && e.ts <= me) && due.every((i) => i.status === 'closed')) {
      res.push({ key: 'closer', name: 'Closer', how: 'A full month with zero overdue tasks' });
      break;
    }
  }
  if (evs.filter((e) => e.code === 'R8').length >= 5) res.push({ key: 'unblocker', name: 'Unblocker', how: 'Unblocked 5 colleagues within 24h' });
  const q = {};
  for (const e of evs.filter((e) => e.type === 'task' && e.meta?.onTime && e.meta?.impact === 5)) {
    const k = `${yearOf(e.ts)}-Q${Math.floor(monthIndex(e.ts) / 3)}`;
    q[k] = (q[k] || 0) + 1;
  }
  if (Object.values(q).some((n) => n >= 3)) res.push({ key: 'impact', name: 'Big Impact', how: 'Closed 3 Impact-5 tasks on time in a quarter' });
  return res;
}
export const ALL_BADGES = [
  ['Early Bird', '5 tasks submitted early in one month'],
  ['Streak Master', '4 consecutive weeks of 6/6 SOW'],
  ['Closer', 'A full month with zero overdue tasks'],
  ['Unblocker', 'Unblocked 5 colleagues within 24h'],
  ['Big Impact', 'Closed 3 Impact-5 tasks on time in a quarter'],
];

/* ---------- Boards & rewards ---------- */
function tieStats(s, userId, from, to) {
  const tasks = s.scoreEvents.filter((e) => e.userId === userId && e.type === 'task' && e.ts >= from && e.ts <= to && !e.reversed);
  const onTime = tasks.length ? tasks.filter((e) => e.meta?.onTime).length / tasks.length : 0;
  const impact5 = tasks.filter((e) => e.meta?.onTime && e.meta?.impact === 5).length;
  const streaks = s.scoreEvents.filter((e) => e.userId === userId && e.code === 'R6' && e.ts >= from && e.ts <= to).length;
  return { onTime, impact5, streaks };
}
// Ranked people for a month. Ties: on-time %, Impact-5 on time, SOW streak.
export function leaderboard(s, monthTs = now(), { excludeFounders = false, people = null } = {}) {
  const from = startOfMonth(monthTs);
  const to = endOfMonth(monthTs);
  const ids = people || activeUsers(s).map((u) => u.id);
  return ids
    .filter((id) => !(excludeFounders && isFounder(s, id)))
    .map((id) => ({ id, ...deliveryScore(s, id, monthTs), ...tieStats(s, id, from, to) }))
    .filter((r) => r.score != null)
    .sort((a, b) => b.score - a.score || b.onTime - a.onTime || b.impact5 - a.impact5 || b.streaks - a.streaks);
}

// Financial year (Apr–Mar) quarter boundaries.
export function fyQuarter(ts = now()) {
  const m = monthIndex(ts);
  const fyStartYear = m >= 3 ? yearOf(ts) : yearOf(ts) - 1;
  const qi = Math.floor(((m + 9) % 12) / 3);
  const start = fromIst(fyStartYear, 3 + qi * 3, 1);
  return { start, months: [0, 1, 2].map((i) => fromIst(fyStartYear, 3 + qi * 3 + i, 1)), label: `Q${qi + 1} FY${String(fyStartYear + 1).slice(-2)}` };
}
export function fyYear(ts = now()) {
  const y = monthIndex(ts) >= 3 ? yearOf(ts) : yearOf(ts) - 1;
  return { label: `FY${String(y).slice(-2)}–${String(y + 1).slice(-2)}`, months: Array.from({ length: 12 }, (_, i) => fromIst(y, 3 + i, 1)) };
}

export function winnersReport(s, monthTs) {
  const board = leaderboard(s, monthTs, { excludeFounders: true });
  const q = fyQuarter(monthTs);
  const pastMonths = q.months.filter((m) => m <= monthTs);
  const platCount = {};
  const qBoard = {};
  for (const m of pastMonths) {
    for (const r of leaderboard(s, m, { excludeFounders: true })) {
      if (tierOf(s, r.score).key === 'platinum') platCount[r.id] = (platCount[r.id] || 0) + 1;
      qBoard[r.id] = qBoard[r.id] || { id: r.id, earned: 0, available: 0 };
      qBoard[r.id].earned += r.earned;
      qBoard[r.id].available += r.available;
    }
  }
  const quarterRank = Object.values(qBoard)
    .map((r) => ({ ...r, score: r.available ? Math.round((r.earned / r.available) * 100) : 0 }))
    .sort((a, b) => b.score - a.score);
  const y = fyYear(monthTs);
  const yPlat = {};
  for (const m of y.months.filter((m) => m <= monthTs)) {
    for (const r of leaderboard(s, m, { excludeFounders: true })) if (tierOf(s, r.score).key === 'platinum') yPlat[r.id] = (yPlat[r.id] || 0) + 1;
  }
  return {
    monthTop5: board.slice(0, 5),
    monthWinner: board[0] || null,
    quarter: q,
    quarterPlatinum2: Object.entries(platCount).filter(([, n]) => n >= 2).map(([id, n]) => ({ id, n })),
    quarterWinner: quarterRank[0] || null,
    year: y,
    yearPlatinum4: Object.entries(yPlat).filter(([, n]) => n >= 4).map(([id, n]) => ({ id, n })),
    yearMostPlatinum: Object.entries(yPlat).sort((a, b) => b[1] - a[1])[0] || null,
  };
}

export function monthEvents(s, userId, monthTs = now()) {
  const from = startOfMonth(monthTs);
  const to = endOfMonth(monthTs);
  return s.scoreEvents.filter((e) => e.userId === userId && e.ts >= from && e.ts <= to).sort((a, b) => b.ts - a.ts);
}
export const eventTitle = (s, e) => (e.itemId ? itemById(s, e.itemId)?.title : null) || EVENT_LABEL[e.type] || e.type;
export const EVENT_LABEL = {
  task: 'Task closed',
  late: 'Late submission',
  extension: 'Extension',
  sow_missed: 'Daily SOW missed',
  sow_missed3: '3 SOW misses in a week',
  streak: 'SOW 6/6 week',
  sow_month: 'Perfect SOW month',
  unblock: 'Unblocked a colleague',
  fast_accept: 'Fast acceptance',
  not_accepted: 'Not accepted within 24h',
  recurring_missed: 'Recurring occurrence missed',
  project: 'Project',
  cycle: 'Stream cycle',
  reversal: 'Reversed',
  adjustment: 'Score adjustment (appeal)',
};
export { userById };
