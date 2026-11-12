import { P, policyVersionAt } from './policy.js';
import { now, DAY, HOUR, atTime, addDays, startOfDay, dateKey } from '../lib/time.js';
import { hourOf } from '../lib/time.js';

export const uid = (p = 'x') => `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

/* ---------- Labels ---------- */
export const STATUS = {
  pending_approval: { label: 'Pending approval', tone: 'gold' },
  awaiting: { label: 'Awaiting acceptance', tone: 'neutral' },
  open: { label: 'Open', tone: 'ok' },
  in_progress: { label: 'In progress', tone: 'ok' },
  blocked: { label: 'Blocked', tone: 'blocked' },
  in_review: { label: 'In review', tone: 'review' },
  closed: { label: 'Closed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'blocked' },
  skipped: { label: 'Skipped', tone: 'blocked' },
};
export const TYPE_LABEL = { stream: 'Stream', cycle: 'Cycle', project: 'Project', task: 'Task', subtask: 'Sub-task' };
export const IMPACT_LABEL = { 1: 'Low', 3: 'Medium', 5: 'Critical' };
export const SIZE_HOURS = { S: 4, M: 16, L: 40 };
export const STAGES = [
  [0, 'Not started'],
  [25, 'Started'],
  [50, 'Halfway'],
  [75, 'Almost done'],
  [100, 'Submitted'],
];
export const OFF_CODES = ['Planned leave', 'Sick-Health', 'Company holiday', 'Comp-off', 'Half-day', 'Field-Event', 'Training', 'Travel', 'Other'];
export const NOT_TOUCHED_CODES = ['Blocked', 'Re-prioritised', 'Leave or health', 'Underestimated', 'Forgot', 'Other'];
export const ABILITIES = [
  ['users', 'Manage users'],
  ['verticals', 'Manage verticals'],
  ['holidays', 'Holiday calendar'],
  ['offboarding', 'Offboarding'],
  ['company', 'Company view'],
  ['reports', 'Reports & export'],
  ['syslog', 'System activity log'],
  ['policy', 'Policy & Scoring Settings'],
];

export const LIVE = ['pending_approval', 'awaiting', 'open', 'in_progress', 'blocked', 'in_review'];
export const WORKING = ['open', 'in_progress'];
export const DONE = ['closed', 'cancelled', 'skipped'];
export const isLive = (it) => LIVE.includes(it.status);
export const isWorkItem = (it) => it.type === 'task' || it.type === 'subtask';

/* ---------- People ---------- */
export const userById = (s, id) => s.users.find((u) => u.id === id);
export const itemById = (s, id) => s.items.find((i) => i.id === id);
export const nameOf = (s, id) => userById(s, id)?.name || '—';
export const firstName = (s, id) => (userById(s, id)?.name || '—').split(' ')[0];
export const activeUsers = (s) => s.users.filter((u) => u.status !== 'inactive');
export const isFounder = (s, id) => userById(s, id)?.role === 'founder';
export const isAdmin = (s, id) => userById(s, id)?.role === 'admin';
export const isFA = (s, id) => isFounder(s, id) || isAdmin(s, id);
export const founders = (s) => s.users.filter((u) => u.role === 'founder' && u.status !== 'inactive').map((u) => u.id);
export const verticalById = (s, id) => s.verticals.find((v) => v.id === id);
export const mainVertical = (u) => (u?.verticals.find((v) => v.main) || u?.verticals[0])?.vid;

export function can(s, id, ability) {
  const u = userById(s, id);
  if (!u) return false;
  if (u.role === 'founder' || u.role === 'admin') return true;
  return (u.customRoles || []).some((rid) => s.roles.find((r) => r.id === rid)?.abilities.includes(ability));
}

export function managerOf(s, id, vid) {
  const u = userById(s, id);
  if (!u) return null;
  const v = u.verticals.find((x) => x.vid === vid) || u.verticals.find((x) => x.main) || u.verticals[0];
  return v?.managerId || null;
}
export const mainManager = (s, id) => managerOf(s, id, mainVertical(userById(s, id)));
export const directReports = (s, id) => activeUsers(s).filter((u) => u.id !== id && u.verticals.some((v) => v.managerId === id)).map((u) => u.id);
export const isManager = (s, id) => directReports(s, id).length > 0;
export function reportTree(s, id) {
  const seen = new Set();
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const r of directReports(s, cur)) {
      if (!seen.has(r) && r !== id) {
        seen.add(r);
        queue.push(r);
      }
    }
  }
  return [...seen];
}
export const isAbove = (s, mgr, id) => reportTree(s, mgr).includes(id);
export const sharesVertical = (s, a, b) => {
  const A = userById(s, a)?.verticals.map((v) => v.vid) || [];
  return (userById(s, b)?.verticals || []).some((v) => A.includes(v.vid));
};
export const ownersManager = (s, item) => managerOf(s, item.ownerId, item.vertical);
// People a manager/founder/admin can see in Team views.
export function teamScope(s, id) {
  if (isFA(s, id)) return activeUsers(s).map((u) => u.id);
  return reportTree(s, id);
}

export function reviewerFor(s, creatorId, ownerId, vid) {
  if (creatorId !== ownerId) return creatorId;
  if (isFounder(s, ownerId) && P(s, 'foundersReviewOwn')) return ownerId;
  if (P(s, 'selfTaskReviewer') === 'self') return ownerId;
  return managerOf(s, ownerId, vid) || ownerId;
}

/* ---------- Items ---------- */
export const children = (s, id) => s.items.filter((i) => i.parentId === id);
export const rootOf = (s, item) => {
  let cur = item;
  let guard = 0;
  while (cur?.parentId && guard++ < 10) cur = itemById(s, cur.parentId);
  return cur;
};
export const projectOf = (s, item) => {
  let cur = item.parentId ? itemById(s, item.parentId) : null;
  while (cur) {
    if (cur.type === 'project' || cur.type === 'stream') return cur;
    cur = cur.parentId ? itemById(s, cur.parentId) : null;
  }
  return null;
};

export function nextKey(s, parentId, vid) {
  let prefix = verticalById(s, vid)?.key || 'HB';
  let cur = parentId ? itemById(s, parentId) : null;
  while (cur) {
    if (cur.projKey) {
      prefix = cur.projKey;
      break;
    }
    cur = cur.parentId ? itemById(s, cur.parentId) : null;
  }
  s.seq[prefix] = (s.seq[prefix] || 0) + 1;
  return `${prefix}-${String(s.seq[prefix]).padStart(2, '0')}`;
}

export function progressOf(s, item) {
  if (item.status === 'closed') return 100;
  if (item.progressMethod === 'checklist') {
    const list = item.checklist || [];
    return list.length ? Math.round((list.filter((c) => c.done).length / list.length) * 100) : item.progress || 0;
  }
  if (item.progressMethod === 'subtasks') {
    const kids = children(s, item.id).filter((k) => !['cancelled', 'skipped'].includes(k.status));
    if (!kids.length) return item.progress || 0;
    return Math.round(kids.reduce((a, k) => a + (k.status === 'closed' || k.status === 'in_review' ? 100 : progressOf(s, k)), 0) / kids.length);
  }
  return item.stage ?? item.progress ?? 0;
}
export const progressText = (s, item) => {
  if (item.progressMethod === 'checklist' && item.checklist?.length) {
    return `${item.checklist.filter((c) => c.done).length}/${item.checklist.length}`;
  }
  return `${progressOf(s, item)}%`;
};

// Deadline with blocked time paused (up to the allowed pause).
export function allowedPauseMs(s, item) {
  return (P(s, 'blockedFreeDays') + (item.blockedApprovedDays || 0)) * DAY;
}
export function effectiveDeadline(s, item, at = now()) {
  if (!item.currentDeadline) return null;
  let d = item.currentDeadline + (item.pausedMs || 0);
  if (item.status === 'blocked' && item.blockedAt) d += Math.min(at - item.blockedAt, allowedPauseMs(s, item));
  return d;
}
export function isOverdue(s, item, at = now()) {
  if (!['awaiting', 'open', 'in_progress', 'blocked'].includes(item.status)) return false;
  const d = effectiveDeadline(s, item, at);
  return d != null && d < at;
}
export function isAtRisk(s, item, at = now()) {
  if (!WORKING.includes(item.status) || item.type === 'stream') return false;
  if (isOverdue(s, item, at)) return false;
  const d = effectiveDeadline(s, item, at);
  const last = item.lastUpdateAt || item.acceptedAt || item.createdAt;
  if (at - last > P(s, 'atRiskNoUpdateDays') * DAY) return true;
  return d != null && d - at <= P(s, 'atRiskHours') * HOUR && progressOf(s, item) < P(s, 'atRiskProgress');
}
export function flagsOf(s, item, at = now()) {
  return {
    overdue: isOverdue(s, item, at),
    atRisk: isAtRisk(s, item, at),
    withAssignee: !!item.assigneeId,
    private: !!item.private,
    pinned: !!item.pinned,
  };
}
// Tone used for the coloured left edge of task cards.
export function healthTone(s, item) {
  if (item.status === 'blocked') return 'blocked';
  if (item.status === 'in_review') return 'review';
  const f = flagsOf(s, item);
  if (f.overdue) return 'overdue';
  if (f.atRisk) return 'risk';
  return 'ok';
}

export function canSeeFull(s, viewer, item) {
  if (!item.private) {
    // A private ancestor hides children from outsiders, except their own sub-task.
    const parent = item.parentId ? itemById(s, item.parentId) : null;
    if (parent && parent.private && ![item.ownerId, item.assigneeId].includes(viewer)) return canSeeFull(s, viewer, parent);
    return true;
  }
  if (isFounder(s, viewer)) return true;
  return [item.creatorId, item.ownerId, item.assigneeId, ownersManager(s, item)].includes(viewer);
}

export const baseOf = (s, item, ts = now()) => (P(s, `size${item.size}`, ts) || 1) * (item.impact || 1);

/* ---------- Load ---------- */
export function loadFor(s, id, weekStart) {
  const u = userById(s, id);
  if (!u) return 0;
  const end = weekStart + 7 * DAY;
  const isThisWeek = weekStart <= now() && now() < end;
  let hours = 0;
  for (const it of s.items) {
    if (it.ownerId !== id || !isWorkItem(it) || !['awaiting', 'open', 'in_progress', 'blocked'].includes(it.status)) continue;
    const d = it.currentDeadline;
    if (!d) continue;
    if ((d >= weekStart && d < end) || (isThisWeek && d < weekStart)) {
      hours += (it.estHours || 0) * (1 - progressOf(s, it) / 100);
    }
  }
  const capacity = (u.hours || 9) * 6 * 0.8;
  return Math.round((hours / capacity) * 100);
}
export const loadTone = (pct) => (pct > 100 ? 'overdue' : pct >= 80 ? 'risk' : 'ok');

/* ---------- Log, notifications, comments ---------- */
export function log(s, actorId, itemId, action, from = null, to = null) {
  s.activity.push({ id: uid('a'), ts: now(), userId: actorId, itemId, action, from, to });
}

function deliverAt(s, ts, mode, quietOk) {
  if (mode === 'digest') {
    const seven = atTime(ts, '19:00');
    return ts <= seven ? seven : atTime(addDays(ts, 1), '19:00');
  }
  const h = hourOf(ts);
  if (quietOk || (h >= 8 && h < 21)) return ts;
  return h >= 21 ? atTime(addDays(ts, 1), '08:00') : atTime(ts, '08:00');
}

// Simulated Slack DM. Instant = DM now (held 9 PM–8 AM), Digest = 7 PM summary.
export function notify(s, userIds, text, opts = {}) {
  const { itemId = null, approvalId = null, mode = 'instant', buttons = [], critical = true, quietOk = false, kind = 'info', exclude = [] } = opts;
  const ts = now();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))].filter((x) => !exclude.includes(x));
  for (const id of ids) {
    const u = userById(s, id);
    if (!u || u.status === 'inactive') continue;
    if (!critical && itemId && (u.muted || []).includes(itemId)) continue;
    s.notifications.push({ id: uid('n'), userId: id, text, itemId, approvalId, mode, buttons, kind, ts, deliverAt: deliverAt(s, ts, mode, quietOk), read: false });
  }
  if (s.notifications.length > 1500) s.notifications.splice(0, s.notifications.length - 1500);
}
export function post(s, channel, text) {
  s.channel.push({ id: uid('c'), channel, text, ts: now() });
}

export function addComment(s, authorId, itemId, text, actionLabel = null, parentCommentId = null) {
  if (!text?.trim()) return;
  const c = { id: uid('m'), itemId, userId: authorId, text: text.trim(), action: actionLabel, ts: now(), parentId: parentCommentId };
  s.comments.push(c);
  const item = itemById(s, itemId);
  if (!item || actionLabel) return c; // Action comments are covered by the action's own notifications.
  const mentioned = [];
  for (const m of text.matchAll(/@([A-Za-z]+)/g)) {
    const u = activeUsers(s).find((x) => x.name.split(' ')[0].toLowerCase() === m[1].toLowerCase());
    if (u && u.id !== authorId) mentioned.push(u.id);
  }
  const who = firstName(s, authorId);
  if (mentioned.length) {
    notify(s, mentioned, `${who} mentioned you on *${item.title}*: “${text.trim().slice(0, 140)}”`, { itemId, buttons: ['open'] });
  }
  notify(s, [item.ownerId, item.assigneeId, item.creatorId], `${who} commented on *${item.title}*: “${text.trim().slice(0, 100)}”`, {
    itemId,
    mode: 'digest',
    critical: false,
    exclude: [authorId, ...mentioned],
  });
  return c;
}

/* ---------- Score events ---------- */
export function scoreEvent(s, userId, itemId, type, code, points, note, ts = now(), meta = {}) {
  const ev = {
    id: uid('e'),
    userId,
    itemId,
    type,
    code,
    points: Math.round(points * 10) / 10,
    note,
    ts,
    policyVersion: policyVersionAt(s, ts),
    trial: !!P(s, 'trialMode', ts),
    meta,
  };
  s.scoreEvents.push(ev);
  return ev;
}

export const once = (s, key) => {
  if (s.flags[key]) return false;
  s.flags[key] = now();
  return true;
};

export const isHoliday = (s, k) => s.holidays.find((h) => h.date === k);
export const sameDay = (a, b) => startOfDay(a) === startOfDay(b);
export const dk = dateKey;
