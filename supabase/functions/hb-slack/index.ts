// @ts-nocheck
// Built from server/hb-slack.js with `npm run build:function`. Do not edit by hand.

// server/hb-slack.js
import { createClient as createClient2 } from "npm:@supabase/supabase-js@2.45.4";

// src/lib/supabase.js
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
var env = {};
var url = env.VITE_SUPABASE_URL;
var key = env.VITE_SUPABASE_ANON_KEY;
var supabase = url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
var DEMO_LOGIN = env.VITE_DEMO_LOGIN === "true";

// src/lib/time.js
var MIN = 60 * 1e3;
var HOUR = 60 * MIN;
var DAY = 24 * HOUR;
var IST = 330 * MIN;
var clock = { offset: 0 };
var now = () => Date.now() + clock.offset;
var ist = (ts) => {
  const d = new Date(ts + IST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
};
var fromIst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo, d, h, mi) - IST;
var pad = (n) => String(n).padStart(2, "0");
var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
var dateKey = (ts) => {
  const p = ist(ts);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`;
};
var parseKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return fromIst(y, m - 1, d);
};
var startOfDay = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d);
};
var addDays = (ts, n) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d + n, p.h, p.mi) + (ts - fromIst(p.y, p.mo, p.d, p.h, p.mi));
};
var addKey = (k, n) => dateKey(addDays(parseKey(k), n));
var atTime = (dayOrTs, hhmm = "18:30") => {
  const base = typeof dayOrTs === "string" ? parseKey(dayOrTs) : startOfDay(dayOrTs);
  const p = ist(base);
  const [h, m] = hhmm.split(":").map(Number);
  return fromIst(p.y, p.mo, p.d, h, m || 0);
};
var startOfWeek = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d - (p.dow + 6) % 7);
};
var addMonths = (ts, n) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo + n, Math.min(p.d, 28), p.h, p.mi);
};
var weekday = (ts) => ist(ts).dow;
var hourOf = (ts) => ist(ts).h;
var isWorkingDay = (k) => weekday(parseKey(k)) !== 0;
var fmtTime = (ts) => {
  const p = ist(ts);
  const ap = p.h >= 12 ? "PM" : "AM";
  return `${p.h % 12 || 12}:${pad(p.mi)} ${ap}`;
};
var fmtDate = (ts, withYear = false) => {
  if (!ts) return "\u2014";
  const p = ist(ts);
  return `${DOW[p.dow]} ${p.d} ${MON[p.mo]}${withYear ? " " + p.y : ""}`;
};
var fmtShort = (ts) => {
  const p = ist(ts);
  return `${p.d} ${MON[p.mo]}`;
};
var fmtDT = (ts) => ts ? `${fmtDate(ts)}, ${fmtTime(ts)}` : "\u2014";
var dueLabel = (ts) => {
  const n = now();
  if (ts < n) return `Overdue ${Math.max(1, Math.floor((n - ts) / DAY))}d`;
  const days = Math.round((startOfDay(ts) - startOfDay(n)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return DOW[ist(ts).dow];
  return fmtShort(ts);
};

// src/engine/policy.js
var COMPANY = {
  name: "HB+",
  // Google Workspace domain allowed to sign in (set VITE_COMPANY_DOMAIN in .env.local).
  domain: (typeof import.meta !== "undefined" && void 0 || "hbplus.fit").toLowerCase(),
  creditsChannel: "#credits-where-credits-due",
  announceChannel: "#hb-announcements"
};
var DEFAULT_POLICY = {
  // Rules
  crossVerticalApproval: true,
  extensionApprover: "either",
  // creator | manager | either
  freeExtNoticeH: 48,
  freeExtensions: 1,
  selfTaskReviewer: "manager",
  // manager | self
  foundersReviewOwn: true,
  autoAcceptH: 48,
  // 0 = never
  blockedFreeDays: 3,
  commentRequired: true,
  acceptToOwn: true,
  notAcceptedNudgeH: 24,
  sowNudge1: "18:30",
  sowNudge2: "21:00",
  sowDeadline: "10:00",
  defaultDeadlineTime: "18:30",
  offDaysBeforeAlert: 4,
  atRiskNoUpdateDays: 3,
  atRiskHours: 48,
  atRiskProgress: 50,
  reviewNudgeH: 36,
  // Top-3 ranking weights
  wAtRisk: 3,
  wPinned: 3,
  urgFar: 1,
  // due > 7 days
  urgMid: 2,
  // 3–7 days
  urgNear: 3,
  // ≤ 2 days
  urgOverdue: 4,
  // Base & multipliers
  sizeS: 1,
  sizeM: 3,
  sizeL: 5,
  earlyH: 24,
  earlyMult: 1.2,
  q1: 0.5,
  q2: 1,
  q3: 1.5,
  kpiCap: 120,
  // Rewards
  projectOnTimeBonus: 1,
  // × project base (R4)
  sowWeekBonus: 5,
  // R6
  sowMonthBonus: 15,
  // R7
  unblockBonus: 2,
  // R8
  unblockWithinH: 24,
  fastAcceptBonus: 1,
  // R9
  fastAcceptH: 4,
  // Penalties (fraction of Base unless noted)
  late1: 0.5,
  // P1 up to 1 day
  late2: 1,
  // P2 2–3 days
  late3: 1.5,
  // P3 > 3 days (cap)
  extLateNotice: 0.2,
  // P4
  extRepeat: 0.3,
  // P5
  sowMissed: 3,
  // P7 points
  sowMissed3: 5,
  // P8 points
  recurringMissed: 1,
  // P9 × base
  projectLate: 0.5,
  // P10
  notAccepted: 1,
  // P11 points
  // Tiers (Delivery Score)
  tierPlatinum: 110,
  tierGold: 95,
  tierSilver: 80,
  tierBronze: 65,
  // Pilot
  trialMode: false,
  setupSprintOpen: false,
  // Performance reviews (Phase 3) — weights for the overall summary
  perfWTasks: 40,
  perfWGoals: 25,
  perfWBehaviour: 10,
  perfWKpi: 15,
  perfWSow: 10,
  perfWHealth: 0
};
var HOURS_OPTS = [24, 48, 72];
var POLICY_GROUPS = [
  {
    title: "Ownership & approvals",
    fields: [
      { key: "crossVerticalApproval", label: "Cross-vertical approval", type: "bool" },
      { key: "acceptToOwn", label: "Accept-to-own step", type: "bool" },
      { key: "notAcceptedNudgeH", label: "Not-accepted nudge after", type: "number", unit: "h" },
      { key: "selfTaskReviewer", label: "Reviewer for self-created tasks", type: "select", options: [["manager", "Manager"], ["self", "Self"]] },
      { key: "foundersReviewOwn", label: "Founders review own tasks", type: "bool" },
      { key: "autoAcceptH", label: "Review auto-accept after", type: "select", options: [...HOURS_OPTS.map((h) => [h, `${h}h`]), [0, "Never"]] },
      { key: "reviewNudgeH", label: "Remind reviewer after", type: "number", unit: "h" },
      { key: "commentRequired", label: "Comment required on every action", type: "bool" }
    ]
  },
  {
    title: "Deadlines, extensions & blocks",
    fields: [
      { key: "extensionApprover", label: "Who approves extensions", type: "select", options: [["creator", "Creator"], ["manager", "Owner's manager"], ["either", "Either"]] },
      { key: "freeExtNoticeH", label: "Free extension notice", type: "number", unit: "h" },
      { key: "freeExtensions", label: "Number of free extensions", type: "select", options: [[0, "0"], [1, "1"], [2, "2"]] },
      { key: "blockedFreeDays", label: "Blocked pause without approval", type: "number", unit: "days", min: 1, max: 7 },
      { key: "defaultDeadlineTime", label: "Default deadline time", type: "time" },
      { key: "atRiskNoUpdateDays", label: "At-risk: no update for", type: "number", unit: "days" },
      { key: "atRiskHours", label: "At-risk: deadline within", type: "number", unit: "h" },
      { key: "atRiskProgress", label: "At-risk: progress below", type: "number", unit: "%" }
    ]
  },
  {
    title: "Daily SOW",
    fields: [
      { key: "sowNudge1", label: "First SOW nudge", type: "time" },
      { key: "sowNudge2", label: "Second SOW nudge", type: "time" },
      { key: "sowDeadline", label: "SOW missed after (next day)", type: "time" },
      { key: "offDaysBeforeAlert", label: "Personal off days before manager alert", type: "number", unit: "/month" }
    ]
  },
  {
    title: "Top-3 ranking weights",
    fields: [
      { key: "wAtRisk", label: "Bonus if at-risk", type: "number" },
      { key: "wPinned", label: "Bonus if pinned by a manager", type: "number" },
      { key: "urgFar", label: "Urgency: due > 7 days", type: "number" },
      { key: "urgMid", label: "Urgency: due 3\u20137 days", type: "number" },
      { key: "urgNear", label: "Urgency: due \u2264 2 days", type: "number" },
      { key: "urgOverdue", label: "Urgency: overdue", type: "number" }
    ]
  },
  {
    title: "Points: base & multipliers",
    fields: [
      { key: "sizeS", label: "Size S value", type: "number" },
      { key: "sizeM", label: "Size M value", type: "number" },
      { key: "sizeL", label: "Size L value", type: "number" },
      { key: "earlyH", label: "Early = submitted at least", type: "number", unit: "h before" },
      { key: "earlyMult", label: "Early multiplier (R2)", type: "number", step: 0.1 },
      { key: "q1", label: "1\u2605 multiplier (P6)", type: "number", step: 0.1 },
      { key: "q2", label: "2\u2605 multiplier", type: "number", step: 0.1 },
      { key: "q3", label: "3\u2605 multiplier (R3)", type: "number", step: 0.1 },
      { key: "kpiCap", label: "Stream KPI achievement cap", type: "number", unit: "%" }
    ]
  },
  {
    title: "Rewards (+)",
    fields: [
      { key: "projectOnTimeBonus", label: "R4 Project closed on time", type: "number", unit: "\xD7 project Base", step: 0.1 },
      { key: "sowWeekBonus", label: "R6 SOW 6/6 on time in a week", type: "number", unit: "pts" },
      { key: "sowMonthBonus", label: "R7 Perfect SOW month", type: "number", unit: "pts" },
      { key: "unblockBonus", label: "R8 Unblocked someone", type: "number", unit: "pts" },
      { key: "unblockWithinH", label: "R8 window", type: "number", unit: "h" },
      { key: "fastAcceptBonus", label: "R9 Fast acceptance", type: "number", unit: "pts" },
      { key: "fastAcceptH", label: "R9 window", type: "number", unit: "h" }
    ]
  },
  {
    title: "Penalties (\u2212)",
    fields: [
      { key: "late1", label: "P1 Late up to 1 day", type: "number", unit: "\xD7 Base", step: 0.1 },
      { key: "late2", label: "P2 Late 2\u20133 days", type: "number", unit: "\xD7 Base", step: 0.1 },
      { key: "late3", label: "P3 Late > 3 days (cap)", type: "number", unit: "\xD7 Base", step: 0.1 },
      { key: "extLateNotice", label: "P4 Extension with short notice", type: "number", unit: "\xD7 Base", step: 0.05 },
      { key: "extRepeat", label: "P5 2nd+ extension", type: "number", unit: "\xD7 Base each", step: 0.05 },
      { key: "sowMissed", label: "P7 Daily SOW missed", type: "number", unit: "pts" },
      { key: "sowMissed3", label: "P8 3 SOW misses in a week", type: "number", unit: "pts extra" },
      { key: "recurringMissed", label: "P9 Recurring occurrence missed", type: "number", unit: "\xD7 Base", step: 0.1 },
      { key: "projectLate", label: "P10 Project closed late", type: "number", unit: "\xD7 project Base", step: 0.1 },
      { key: "notAccepted", label: "P11 Not accepted within 24h", type: "number", unit: "pts" }
    ]
  },
  {
    title: "Tiers (Delivery Score)",
    fields: [
      { key: "tierPlatinum", label: "Platinum from", type: "number" },
      { key: "tierGold", label: "Gold from", type: "number" },
      { key: "tierSilver", label: "Silver from", type: "number" },
      { key: "tierBronze", label: "Bronze from", type: "number" },
      { key: "trialMode", label: "Trial mode (pilot: scores visible, not counted for rewards)", type: "bool" },
      { key: "setupSprintOpen", label: "Setup sprint open (everyone enters their current open tasks)", type: "bool" }
    ]
  },
  {
    title: "Performance reviews (weights for the overall summary)",
    fields: [
      { key: "perfWTasks", label: "Task delivery (Delivery Score)", type: "number", unit: "%" },
      { key: "perfWGoals", label: "Top goals & extra initiatives", type: "number", unit: "%" },
      { key: "perfWBehaviour", label: "Behaviour & skill goals", type: "number", unit: "%" },
      { key: "perfWKpi", label: "Stream KPIs & KPI goals", type: "number", unit: "%" },
      { key: "perfWSow", label: "Daily SOW compliance", type: "number", unit: "%" },
      { key: "perfWHealth", label: "Health goals (private \u2014 0 keeps them out of the score)", type: "number", unit: "%" }
    ]
  }
];
var POLICY_LABEL = Object.fromEntries(POLICY_GROUPS.flatMap((g) => g.fields.map((f2) => [f2.key, f2.label])));
function P(s, key2, ts = now()) {
  let val = DEFAULT_POLICY[key2];
  let best = -Infinity;
  for (const v of s.policyVersions) {
    if (v.key === key2 && v.effectiveFrom <= ts && v.effectiveFrom >= best) {
      best = v.effectiveFrom;
      val = v.newValue;
    }
  }
  return val;
}
function policyVersionAt(s, ts = now()) {
  const applied = s.policyVersions.filter((v) => v.effectiveFrom <= ts);
  return `v1.${applied.length}`;
}

// src/engine/core.js
var uid = (p = "x") => `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
var STATUS = {
  pending_approval: { label: "Pending approval", tone: "gold" },
  awaiting: { label: "Awaiting acceptance", tone: "neutral" },
  open: { label: "Open", tone: "ok" },
  in_progress: { label: "In progress", tone: "ok" },
  blocked: { label: "Blocked", tone: "blocked" },
  in_review: { label: "In review", tone: "review" },
  closed: { label: "Closed", tone: "ok" },
  cancelled: { label: "Cancelled", tone: "blocked" },
  skipped: { label: "Skipped", tone: "blocked" }
};
var IMPACT_LABEL = { 1: "Low", 3: "Medium", 5: "Critical" };
var SIZE_HOURS = { S: 4, M: 16, L: 40 };
var WORKING = ["open", "in_progress"];
var DONE = ["closed", "cancelled", "skipped"];
var isWorkItem = (it) => it.type === "task" || it.type === "subtask";
var userById = (s, id) => s.users.find((u) => u.id === id);
var itemById = (s, id) => s.items.find((i) => i.id === id);
var nameOf = (s, id) => userById(s, id)?.name || "\u2014";
var firstName = (s, id) => (userById(s, id)?.name || "\u2014").split(" ")[0];
var activeUsers = (s) => s.users.filter((u) => u.status !== "inactive");
var isFounder = (s, id) => userById(s, id)?.role === "founder";
var founders = (s) => s.users.filter((u) => u.role === "founder" && u.status !== "inactive").map((u) => u.id);
var verticalById = (s, id) => s.verticals.find((v) => v.id === id);
var mainVertical = (u) => (u?.verticals.find((v) => v.main) || u?.verticals[0])?.vid;
function managerOf(s, id, vid) {
  const u = userById(s, id);
  if (!u) return null;
  const v = u.verticals.find((x) => x.vid === vid) || u.verticals.find((x) => x.main) || u.verticals[0];
  return v?.managerId || null;
}
var mainManager = (s, id) => managerOf(s, id, mainVertical(userById(s, id)));
var directReports = (s, id) => activeUsers(s).filter((u) => u.id !== id && u.verticals.some((v) => v.managerId === id)).map((u) => u.id);
var isManager = (s, id) => directReports(s, id).length > 0;
function reportTree(s, id) {
  const seen = /* @__PURE__ */ new Set();
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
var isAbove = (s, mgr, id) => reportTree(s, mgr).includes(id);
var sharesVertical = (s, a, b) => {
  const A = userById(s, a)?.verticals.map((v) => v.vid) || [];
  return (userById(s, b)?.verticals || []).some((v) => A.includes(v.vid));
};
var ownersManager = (s, item) => managerOf(s, item.ownerId, item.vertical);
function reviewerFor(s, creatorId, ownerId, vid) {
  if (creatorId !== ownerId) return creatorId;
  if (isFounder(s, ownerId) && P(s, "foundersReviewOwn")) return ownerId;
  if (P(s, "selfTaskReviewer") === "self") return ownerId;
  return managerOf(s, ownerId, vid) || ownerId;
}
var children = (s, id) => s.items.filter((i) => i.parentId === id);
function nextKey(s, parentId, vid) {
  let prefix = verticalById(s, vid)?.key || "HB";
  let cur = parentId ? itemById(s, parentId) : null;
  while (cur) {
    if (cur.projKey) {
      prefix = cur.projKey;
      break;
    }
    cur = cur.parentId ? itemById(s, cur.parentId) : null;
  }
  s.seq[prefix] = (s.seq[prefix] || 0) + 1;
  return `${prefix}-${String(s.seq[prefix]).padStart(2, "0")}`;
}
function progressOf(s, item) {
  if (item.status === "closed") return 100;
  if (item.progressMethod === "checklist") {
    const list = item.checklist || [];
    return list.length ? Math.round(list.filter((c) => c.done).length / list.length * 100) : item.progress || 0;
  }
  if (item.progressMethod === "subtasks") {
    const kids = children(s, item.id).filter((k) => !["cancelled", "skipped"].includes(k.status));
    if (!kids.length) return item.progress || 0;
    return Math.round(kids.reduce((a, k) => a + (k.status === "closed" || k.status === "in_review" ? 100 : progressOf(s, k)), 0) / kids.length);
  }
  return item.stage ?? item.progress ?? 0;
}
function allowedPauseMs(s, item) {
  return (P(s, "blockedFreeDays") + (item.blockedApprovedDays || 0)) * DAY;
}
function effectiveDeadline(s, item, at = now()) {
  if (!item.currentDeadline) return null;
  let d = item.currentDeadline + (item.pausedMs || 0);
  if (item.status === "blocked" && item.blockedAt) d += Math.min(at - item.blockedAt, allowedPauseMs(s, item));
  return d;
}
function isOverdue(s, item, at = now()) {
  if (!["awaiting", "open", "in_progress", "blocked"].includes(item.status)) return false;
  const d = effectiveDeadline(s, item, at);
  return d != null && d < at;
}
function isAtRisk(s, item, at = now()) {
  if (!WORKING.includes(item.status) || item.type === "stream") return false;
  if (isOverdue(s, item, at)) return false;
  const d = effectiveDeadline(s, item, at);
  const last2 = item.lastUpdateAt || item.acceptedAt || item.createdAt;
  if (at - last2 > P(s, "atRiskNoUpdateDays") * DAY) return true;
  return d != null && d - at <= P(s, "atRiskHours") * HOUR && progressOf(s, item) < P(s, "atRiskProgress");
}
function flagsOf(s, item, at = now()) {
  return {
    overdue: isOverdue(s, item, at),
    atRisk: isAtRisk(s, item, at),
    withAssignee: !!item.assigneeId,
    private: !!item.private,
    pinned: !!item.pinned
  };
}
function canSeeFull(s, viewer, item) {
  if (!item.private) {
    const parent = item.parentId ? itemById(s, item.parentId) : null;
    if (parent && parent.private && ![item.ownerId, item.assigneeId].includes(viewer)) return canSeeFull(s, viewer, parent);
    return true;
  }
  if (isFounder(s, viewer)) return true;
  return [item.creatorId, item.ownerId, item.assigneeId, ownersManager(s, item)].includes(viewer);
}
var baseOf = (s, item, ts = now()) => (P(s, `size${item.size}`, ts) || 1) * (item.impact || 1);
function loadFor(s, id, weekStart) {
  const u = userById(s, id);
  if (!u) return 0;
  const end = weekStart + 7 * DAY;
  const isThisWeek = weekStart <= now() && now() < end;
  let hours = 0;
  for (const it of s.items) {
    if (it.ownerId !== id || !isWorkItem(it) || !["awaiting", "open", "in_progress", "blocked"].includes(it.status)) continue;
    const d = it.currentDeadline;
    if (!d) continue;
    if (d >= weekStart && d < end || isThisWeek && d < weekStart) {
      hours += (it.estHours || 0) * (1 - progressOf(s, it) / 100);
    }
  }
  const capacity = (u.hours || 9) * 6 * 0.8;
  return Math.round(hours / capacity * 100);
}
function log(s, actorId, itemId, action, from = null, to = null) {
  s.activity.push({ id: uid("a"), ts: now(), userId: actorId, itemId, action, from, to });
}
function deliverAt(s, ts, mode, quietOk) {
  if (mode === "digest") {
    const seven = atTime(ts, "19:00");
    return ts <= seven ? seven : atTime(addDays(ts, 1), "19:00");
  }
  const h = hourOf(ts);
  if (quietOk || h >= 8 && h < 21) return ts;
  return h >= 21 ? atTime(addDays(ts, 1), "08:00") : atTime(ts, "08:00");
}
function notify(s, userIds, text, opts2 = {}) {
  const { itemId = null, approvalId = null, mode = "instant", buttons = [], critical = true, quietOk = false, kind = "info", exclude = [] } = opts2;
  const ts = now();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))].filter((x) => !exclude.includes(x));
  for (const id of ids) {
    const u = userById(s, id);
    if (!u || u.status === "inactive") continue;
    if (!critical && itemId && (u.muted || []).includes(itemId)) continue;
    s.notifications.push({ id: uid("n"), userId: id, text, itemId, approvalId, mode, buttons, kind, ts, deliverAt: deliverAt(s, ts, mode, quietOk), read: false });
  }
  if (s.notifications.length > 1500) s.notifications.splice(0, s.notifications.length - 1500);
}
function addComment(s, authorId, itemId, text, actionLabel = null, parentCommentId = null) {
  if (!text?.trim()) return;
  const c = { id: uid("m"), itemId, userId: authorId, text: text.trim(), action: actionLabel, ts: now(), parentId: parentCommentId };
  s.comments.push(c);
  const item = itemById(s, itemId);
  if (!item || actionLabel) return c;
  const mentioned = [];
  for (const m of text.matchAll(/@([A-Za-z]+)/g)) {
    const u = activeUsers(s).find((x) => x.name.split(" ")[0].toLowerCase() === m[1].toLowerCase());
    if (u && u.id !== authorId) mentioned.push(u.id);
  }
  const who = firstName(s, authorId);
  if (mentioned.length) {
    notify(s, mentioned, `${who} mentioned you on *${item.title}*: \u201C${text.trim().slice(0, 140)}\u201D`, { itemId, buttons: ["open"] });
  }
  notify(s, [item.ownerId, item.assigneeId, item.creatorId], `${who} commented on *${item.title}*: \u201C${text.trim().slice(0, 100)}\u201D`, {
    itemId,
    mode: "digest",
    critical: false,
    exclude: [authorId, ...mentioned]
  });
  return c;
}
function scoreEvent(s, userId, itemId, type, code, points, note, ts = now(), meta = {}) {
  const ev = {
    id: uid("e"),
    userId,
    itemId,
    type,
    code,
    points: Math.round(points * 10) / 10,
    note,
    ts,
    policyVersion: policyVersionAt(s, ts),
    trial: !!P(s, "trialMode", ts),
    meta
  };
  s.scoreEvents.push(ev);
  return ev;
}
var once = (s, key2) => {
  if (s.flags[key2]) return false;
  s.flags[key2] = now();
  return true;
};
var isHoliday = (s, k) => s.holidays.find((h) => h.date === k);

// src/engine/scoring.js
var r1 = (n) => Math.round(n * 10) / 10;
function potentialPoints(s, item) {
  const b = baseOf(s, item);
  return { base: b, max: r1(b * P(s, "earlyMult") * P(s, "q3")) };
}
function scoreTaskClose(s, item, ts = now()) {
  const b = baseOf(s, item, ts);
  const rating = item.rating || 2;
  const q = P(s, `q${rating}`, ts);
  const deadline = item.deadlineAtSubmit ?? item.currentDeadline;
  const submitted = item.submittedAt ?? ts;
  const diff2 = deadline - submitted;
  let tm = 1;
  let when = "on time";
  if (diff2 >= P(s, "earlyH", ts) * HOUR) {
    tm = P(s, "earlyMult", ts);
    const days = Math.floor(diff2 / DAY);
    when = days >= 1 ? `${days} day${days > 1 ? "s" : ""} early` : "early";
  } else if (diff2 < 0) {
    when = "late";
  }
  const pts = b * tm * q;
  const codes = [diff2 >= 0 ? "R1" : null, tm > 1 ? "R2" : null, rating === 3 ? "R3" : rating === 1 ? "P6" : null].filter(Boolean).join(" ");
  const main = scoreEvent(s, item.ownerId, item.id, "task", codes || "R1", pts, `Base ${b} \xD7 ${tm} timeliness \xD7 ${q} quality (${rating}\u2605, ${when})`, ts, {
    early: tm > 1,
    onTime: diff2 >= 0,
    impact: item.impact,
    rating
  });
  let latePts = 0;
  if (diff2 < 0) {
    const daysLate = -diff2 / DAY;
    const [code, frac, label] = daysLate <= 1 ? ["P1", P(s, "late1", ts), "up to 1 day"] : daysLate <= 3 ? ["P2", P(s, "late2", ts), "2\u20133 days"] : ["P3", P(s, "late3", ts), "more than 3 days"];
    latePts = -b * frac;
    scoreEvent(s, item.ownerId, item.id, "late", code, latePts, `Submitted late (${label}): \u2212${frac * 100}% of Base ${b}`, ts);
  }
  return { pts: r1(pts), latePts: r1(latePts), when, base: b, rating };
}
function reverseTaskPoints(s, item) {
  for (const ev of s.scoreEvents.filter((e) => e.itemId === item.id && ["task", "late", "project", "cycle"].includes(e.type) && !e.reversed)) {
    ev.reversed = true;
    scoreEvent(s, ev.userId, item.id, "reversal", "REV", -ev.points, `Reversed on reopen: ${ev.note}`);
  }
}

// src/engine/actions.js
var err = (message) => ({ error: message });
var isUrl = (u) => /^https?:\/\/\S+\.\S+/.test((u || "").trim());
var ACTION_LABEL = {
  accept: "Accepted ownership",
  decline: "Declined",
  update: "Updated progress",
  give_assignee: "Gave to assignee",
  assign_back: "Assigned back to owner",
  block: "Marked blocked",
  unblock: "Unblocked",
  request_extension: "Requested extension",
  submit: "Submitted for review",
  review: "Reviewed",
  cancel: "Cancel",
  reopen: "Reopened",
  change_owner: "Change owner",
  edit: "Edited",
  skip: "Requested skip",
  pin: "Pin",
  verify_cycle: "Verified KPIs",
  flag_size: "Flagged size/impact"
};
function createItem(s, creatorId, d) {
  const type = d.type;
  if (!d.title?.trim()) return err("Give it a title.");
  if (!d.ownerId) return err("Pick one owner.");
  if (!["S", "M", "L"].includes(d.size)) return err("Pick a size.");
  if (![1, 3, 5].includes(+d.impact)) return err("Pick an impact.");
  if (!d.impactReason?.trim()) return err("Add a one-line reason for the impact.");
  if (type !== "stream" && !d.deadline) return err("Set a deadline.");
  if (type === "subtask" && !d.parentId) return err("A sub-task needs a parent task.");
  if (type === "stream" && !(d.kpis || []).filter((k) => k.name).length) return err("A stream needs at least one KPI.");
  const owner = userById(s, d.ownerId);
  const vertical = d.vertical || owner.verticals.find((v) => v.main)?.vid || owner.verticals[0]?.vid;
  const parent = d.parentId ? itemById(s, d.parentId) : null;
  if (parent && d.deadline && parent.currentDeadline && d.deadline > effectiveDeadline(s, parent)) {
    return err(`Deadline is after the parent's deadline (${fmtDT(parent.currentDeadline)}). Extend \u201C${parent.title}\u201D first.`);
  }
  const t = now();
  const item = {
    id: uid("i"),
    key: nextKey(s, d.parentId, vertical),
    projKey: (type === "project" || type === "stream") && d.projKey ? d.projKey.toUpperCase().slice(0, 4) : null,
    type,
    parentId: d.parentId || null,
    title: d.title.trim(),
    desc: d.desc || "",
    vertical,
    creatorId,
    ownerId: d.ownerId,
    assigneeId: null,
    contributors: d.contributors || [],
    reviewerId: reviewerFor(s, creatorId, d.ownerId, vertical),
    size: d.size,
    impact: +d.impact,
    impactReason: d.impactReason.trim(),
    estHours: +d.estHours || SIZE_HOURS[d.size],
    progressMethod: type === "project" || type === "stream" ? "subtasks" : d.progressMethod || "stages",
    progress: 0,
    stage: 0,
    checklist: (d.checklist || []).filter(Boolean).map((text) => ({ id: uid("k"), text, done: false })),
    originalDeadline: d.deadline || null,
    currentDeadline: d.deadline || null,
    pickupDate: null,
    status: "awaiting",
    private: !!d.private,
    pinned: !!d.pinned,
    links: (d.links || []).filter((l) => l.url),
    goalLinks: d.goalLinks || [],
    proofLinks: [],
    rating: null,
    recurringId: d.recurringId || null,
    cycleLength: type === "stream" ? d.cycleLength || "monthly" : null,
    pausedMs: 0,
    extensionsCount: 0,
    createdAt: t,
    assignedAt: t,
    lastUpdateAt: t
  };
  s.items.push(item);
  log(s, creatorId, item.id, "Created", null, `${item.key} \xB7 owner ${nameOf(s, item.ownerId)}`);
  if (d.comment) addComment(s, creatorId, item.id, d.comment, "Created");
  const self = creatorId === d.ownerId;
  const crossVertical = !self && P(s, "crossVerticalApproval") && !sharesVertical(s, creatorId, d.ownerId) && !isFounder(s, creatorId);
  const result = { id: item.id, warnings: [] };
  if (crossVertical) {
    item.status = "pending_approval";
    const mgr = managerOf(s, d.ownerId, vertical);
    requestApproval(s, "cross_vertical", item, creatorId, [mgr], {}, `${firstName(s, creatorId)} wants to give *${item.title}* to ${firstName(s, d.ownerId)} (${verticalById(s, vertical)?.name}).`);
    result.warnings.push(`Sent to ${firstName(s, mgr)} for approval \u2014 different vertical.`);
  } else if (self || !P(s, "acceptToOwn") || d.autoAccept) {
    item.status = "open";
    item.acceptedAt = t;
    if (self && item.reviewerId !== creatorId && !d.recurringId && !d.setup && (type === "task" || type === "subtask")) {
      requestApproval(
        s,
        "self_review",
        item,
        creatorId,
        [item.reviewerId],
        { size: item.size, impact: item.impact },
        `${firstName(s, creatorId)} created *${item.title}* for themselves \u2014 size ${item.size}, impact ${item.impact} (\u201C${item.impactReason}\u201D). Confirm or adjust.`
      );
    }
  } else {
    sendAssignedDM(s, item);
  }
  if (type === "stream") {
    startCycle(s, item, startOfDay(t), d.kpis || []);
  }
  if (isWorkItem(item) && item.currentDeadline) {
    const pct = loadFor(s, item.ownerId, startOfWeek(item.currentDeadline));
    if (pct > 100) {
      result.warnings.push(`${firstName(s, item.ownerId)} is at ${pct}% load that week.`);
      notify(s, ownersManager(s, item), `Heads up: ${firstName(s, item.ownerId)} is now at ${pct}% load after *${item.title}* was added by ${firstName(s, creatorId)}.`, { itemId: item.id });
    }
  }
  return result;
}
function sendAssignedDM(s, item) {
  notify(
    s,
    item.ownerId,
    `Hi ${firstName(s, item.ownerId)} \u{1F44B} ${firstName(s, item.creatorId)} has trusted you with *${item.title}* (Impact: ${IMPACT_LABEL[item.impact]} \xB7 Due ${fmtDT(item.currentDeadline)}). Tap Accept to own it, or Discuss if anything's unclear.`,
    { itemId: item.id, buttons: ["accept", "decline", "open"] }
  );
  notify(s, ownersManager(s, item), `${firstName(s, item.creatorId)} assigned *${item.title}* to ${firstName(s, item.ownerId)}.`, { itemId: item.id, mode: "digest", exclude: [item.creatorId] });
}
var CYCLE_DAYS = { weekly: 7, fortnightly: 14 };
function cycleEnd(start, length) {
  if (CYCLE_DAYS[length]) return atTime(addDays(start, CYCLE_DAYS[length] - 1), "18:30");
  const months = length === "quarterly" ? 3 : 1;
  return atTime(addDays(addMonths(start, months), -1), "18:30");
}
function startCycle(s, stream, start, kpiTemplates) {
  const n = children(s, stream.id).filter((c2) => c2.type === "cycle").length + 1;
  const end = cycleEnd(start, stream.cycleLength);
  const c = {
    ...stream,
    id: uid("i"),
    key: nextKey(s, stream.id, stream.vertical),
    projKey: null,
    type: "cycle",
    parentId: stream.id,
    title: `${stream.title} \xB7 Cycle ${n}`,
    desc: "",
    status: "in_progress",
    progressMethod: "stages",
    stage: 0,
    checklist: [],
    links: [],
    originalDeadline: end,
    currentDeadline: end,
    cycleStart: start,
    createdAt: now(),
    acceptedAt: now(),
    lastUpdateAt: now(),
    verified: false
  };
  s.items.push(c);
  for (const k of kpiTemplates.filter((k2) => k2.name)) {
    s.kpis.push({ id: uid("k"), itemId: c.id, name: k.name, target: +k.target, unit: k.unit || "", dir: k.dir || ">=", agg: k.agg || (k.dir === "<=" ? "latest" : "sum"), source: k.source || "manual", sourceMetric: k.sourceMetric || null, actuals: [] });
  }
  log(s, null, c.id, "Cycle started", null, `${fmtDate(start)} \u2192 ${fmtDate(end)}`);
  return c;
}
function kpiActual(k) {
  if (!k.actuals.length) return null;
  if (k.agg === "latest") return k.actuals[k.actuals.length - 1].value;
  return k.actuals.reduce((a, x) => a + +x.value, 0);
}
function kpiAchievement(s, k) {
  const a = kpiActual(k);
  if (a == null || !k.target) return 0;
  const raw = k.dir === "<=" ? a <= 0 ? 1 : k.target / a : a / k.target;
  return Math.min(raw, P(s, "kpiCap") / 100);
}
function cycleAchievement(s, cycle) {
  const ks = s.kpis.filter((k) => k.itemId === cycle.id);
  if (!ks.length) return 0;
  return ks.reduce((a, k) => a + kpiAchievement(s, k), 0) / ks.length;
}
function requestApproval(s, type, item, requesterId, approverIds, payload, text) {
  const ap = { id: uid("p"), type, itemId: item?.id || null, requesterId, approverIds: [...new Set(approverIds.filter(Boolean))], status: "pending", payload, text, ts: now() };
  if (!ap.approverIds.length) ap.approverIds = founders(s);
  s.approvals.push(ap);
  notify(s, ap.approverIds, `Approval needed: ${text}`, { itemId: item?.id, approvalId: ap.id, buttons: ["approve", "reject", "open"], kind: "approval", exclude: [requesterId] });
  return ap;
}
var pendingFor = (s, item, type) => s.approvals.find((a) => a.itemId === item.id && a.type === type && a.status === "pending");
var canDecide = (s, userId, ap) => ap.status === "pending" && (ap.approverIds.includes(userId) || isFounder(s, userId)) && ap.requesterId !== userId;
var approvalsFor = (s, userId) => s.approvals.filter((a) => canDecide(s, userId, a));
var APPROVAL_LABEL = {
  cross_vertical: "Cross-vertical",
  extension: "Extension",
  owner_change: "Owner change",
  cancel: "Cancel",
  skip: "Skip occurrence",
  blocked_extra: "Blocked > 3 days",
  setup: "Setup sprint",
  self_review: "Confirm size & impact"
};
function decideApproval(s, userId, apId, approve, comment, changes = {}) {
  const ap = s.approvals.find((a) => a.id === apId);
  if (!ap || !canDecide(s, userId, ap)) return err("This approval is no longer waiting on you.");
  if (P(s, "commentRequired") && !comment?.trim()) return err("Add a short comment with your decision.");
  ap.status = approve ? "approved" : "rejected";
  ap.decidedBy = userId;
  ap.decidedAt = now();
  ap.comment = comment;
  const item = ap.itemId ? itemById(s, ap.itemId) : null;
  const who = firstName(s, userId);
  if (item) {
    log(s, userId, item.id, `${APPROVAL_LABEL[ap.type]} ${approve ? "approved" : "rejected"}`);
    addComment(s, userId, item.id, comment, `${approve ? "Approved" : "Rejected"}: ${APPROVAL_LABEL[ap.type]}`);
  }
  const b = item ? baseOf(s, item) : 0;
  switch (ap.type) {
    case "cross_vertical":
      if (approve) {
        item.status = "awaiting";
        item.assignedAt = now();
        item.rejected = null;
        sendAssignedDM(s, item);
        notify(s, item.creatorId, `${who} approved giving *${item.title}* to ${firstName(s, item.ownerId)}.`, { itemId: item.id });
      } else {
        item.rejected = { by: userId, reason: comment };
        notify(s, item.creatorId, `${who} didn't approve *${item.title}* for ${firstName(s, item.ownerId)}: \u201C${comment}\u201D. Pick another owner or cancel it.`, { itemId: item.id });
      }
      break;
    case "extension":
      if (approve) {
        const old = item.currentDeadline;
        item.currentDeadline = ap.payload.newDeadline;
        item.extensionsCount = (item.extensionsCount || 0) + 1;
        log(s, userId, item.id, "Deadline extended", fmtDT(old), fmtDT(item.currentDeadline));
        const notes = [];
        if (ap.payload.noticeH < P(s, "freeExtNoticeH")) {
          const pts = -b * P(s, "extLateNotice");
          scoreEvent(s, item.ownerId, item.id, "extension", "P4", pts, `Extension asked less than ${P(s, "freeExtNoticeH")}h before deadline`);
          notes.push(`${pts} pts (short notice)`);
        }
        if (ap.payload.nth > P(s, "freeExtensions")) {
          const pts = -b * P(s, "extRepeat");
          scoreEvent(s, item.ownerId, item.id, "extension", "P5", pts, `Extension #${ap.payload.nth} on this task`);
          notes.push(`${pts} pts (extension #${ap.payload.nth})`);
        }
        notify(s, item.ownerId, `\u2705 Extension approved for *${item.title}* \u2014 new deadline ${fmtDT(item.currentDeadline)}${notes.length ? " \xB7 " + notes.join(", ") : " \xB7 no points lost"}.`, { itemId: item.id });
      } else {
        notify(s, item.ownerId, `${who} couldn't approve the extension on *${item.title}*: \u201C${comment}\u201D. Deadline stays ${fmtDT(item.currentDeadline)}.`, { itemId: item.id });
      }
      break;
    case "owner_change":
      if (approve) {
        const old = item.ownerId;
        item.ownerId = ap.payload.newOwnerId;
        item.assigneeId = null;
        item.prevStatus = ["awaiting", "pending_approval"].includes(item.status) ? null : item.status;
        item.status = "awaiting";
        item.assignedAt = now();
        item.declined = null;
        item.reviewerId = reviewerFor(s, item.creatorId, item.ownerId, item.vertical);
        log(s, userId, item.id, "Owner changed", nameOf(s, old), nameOf(s, item.ownerId));
        sendAssignedDM(s, item);
        notify(s, old, `*${item.title}* has moved to ${firstName(s, item.ownerId)}. Points you already earned on it stay with you.`, { itemId: item.id });
      }
      break;
    case "cancel":
      if (approve) doCancel(s, userId, item, ap.payload.reason);
      else notify(s, ap.requesterId, `${who} kept *${item.title}* open: \u201C${comment}\u201D.`, { itemId: item.id });
      break;
    case "skip":
      if (approve) {
        item.status = "skipped";
        log(s, userId, item.id, "Status", "open", "skipped");
        notify(s, item.ownerId, `This occurrence of *${item.title}* is skipped. No penalty.`, { itemId: item.id });
      }
      break;
    case "blocked_extra":
      if (approve) {
        item.blockedApprovedDays = (item.blockedApprovedDays || 0) + 1;
        notify(s, item.ownerId, `${who} approved one more paused day on *${item.title}*. The deadline clock stays paused.`, { itemId: item.id });
      } else {
        notify(s, item.ownerId, `${who} didn't extend the pause on *${item.title}* \u2014 the clock is running again. Let's find a way around the block.`, { itemId: item.id });
      }
      break;
    case "self_review":
      if (approve) {
        for (const k of ["size", "impact"]) {
          if (changes[k] != null && changes[k] !== item[k]) {
            log(s, userId, item.id, `Manager set ${k}`, item[k], changes[k]);
            item[k] = changes[k];
          }
        }
        if (changes.size && changes.size !== ap.payload.size) item.estHours = { S: 4, M: 16, L: 40 }[changes.size];
        ap.payload.confirmedSize = item.size;
        ap.payload.confirmedImpact = item.impact;
        item.sizeConfirmedBy = userId;
        notify(s, item.ownerId, `${who} confirmed *${item.title}* at size ${item.size} \xB7 impact ${item.impact}.`, { itemId: item.id, mode: "digest" });
      }
      break;
    case "setup": {
      const ids = ap.payload.itemIds || [];
      for (const id of ids) {
        const it = itemById(s, id);
        if (!it || it.status !== "pending_approval") continue;
        if (approve) {
          it.status = (it.stage || 0) > 0 ? "in_progress" : "open";
          it.acceptedAt = now();
          log(s, userId, it.id, "Setup sprint approved", "Pending approval", it.status);
        } else {
          it.status = "cancelled";
          it.cancelReason = `Setup list sent back: ${comment}`;
          it.closedAt = now();
          log(s, userId, it.id, "Setup sprint sent back", "Pending approval", "cancelled");
        }
      }
      notify(s, ap.requesterId, approve ? `\u2705 ${who} approved your setup list (${ids.length} tasks). They're on your board now.` : `${who} sent your setup list back: \u201C${comment}\u201D. Please re-add the tasks with the changes.`, { buttons: ["open"] });
      break;
    }
    default:
  }
  if (!["cross_vertical", "extension", "setup", "self_review"].includes(ap.type) && ap.requesterId) {
    notify(s, ap.requesterId, `${who} ${approve ? "approved" : "rejected"} your ${APPROVAL_LABEL[ap.type].toLowerCase()} request${item ? ` on *${item.title}*` : ""}.`, { itemId: item?.id, exclude: [item?.ownerId] });
  }
  return { ok: true };
}
function canCancelDirect(s, userId, item) {
  return isFounder(s, userId) || ownersManager(s, item) === userId || item.creatorId === userId && isManager(s, userId);
}
function canEditSizeImpact(s, userId, item) {
  return isFounder(s, userId) || item.creatorId === userId || ownersManager(s, item) === userId;
}
function allowedActions(s, userId, item) {
  if (!item) return [];
  const st = item.status;
  const owner = item.ownerId === userId;
  const assignee = item.assigneeId === userId;
  const F = isFounder(s, userId);
  const om = ownersManager(s, item) === userId;
  const creator = item.creatorId === userId;
  const working = ["open", "in_progress"].includes(st);
  const container = item.type === "project" || item.type === "stream";
  const a = [];
  if (st === "awaiting" && owner && !item.declined) a.push("accept", "decline");
  if (working && (owner || assignee) && item.type !== "stream") a.push("update");
  if (working && owner && !item.assigneeId && !container) a.push("give_assignee");
  if (item.assigneeId && (owner || assignee) && [...["open", "in_progress", "blocked"]].includes(st)) a.push("assign_back");
  if (working && (owner || assignee) && !container) a.push("block");
  if (st === "blocked" && (owner || assignee || item.blockedBy === userId || F)) a.push("unblock");
  if (["open", "in_progress", "blocked"].includes(st) && owner && item.currentDeadline && !pendingFor(s, item, "extension")) a.push("request_extension");
  if (working && owner && !container && item.type !== "cycle") a.push("submit");
  if (st === "in_review" && (item.reviewerId === userId || F)) a.push("review");
  if (item.type === "cycle" && !item.verified && item.currentDeadline < now() && (om || F || isAbove(s, userId, item.ownerId))) a.push("verify_cycle");
  if (!DONE.includes(st) && (canCancelDirect(s, userId, item) || creator) && !pendingFor(s, item, "cancel") && item.type !== "cycle") a.push("cancel");
  if (["closed", "cancelled"].includes(st) && (item.reviewerId === userId || om || F)) a.push("reopen");
  if (!DONE.includes(st) && (creator || om || F) && !pendingFor(s, item, "owner_change") && item.type !== "cycle") a.push("change_owner");
  if (creator || owner || om || F) a.push("edit");
  if (owner && !canEditSizeImpact(s, userId, item) && !DONE.includes(st)) a.push("flag_size");
  if (item.recurringId && owner && ["awaiting", "open", "in_progress"].includes(st) && !pendingFor(s, item, "skip")) a.push("skip");
  if ((om || F || isAbove(s, userId, item.ownerId)) && !DONE.includes(st)) a.push("pin");
  return a;
}
function perform(s, userId, itemId, action, payload = {}) {
  const item = itemById(s, itemId);
  if (!item) return err("Task not found.");
  if (!allowedActions(s, userId, item).includes(action)) return err("That action isn't available to you on this task right now.");
  const comment = (payload.comment || "").trim();
  const needsComment = !["pin", "edit"].includes(action);
  if (needsComment && P(s, "commentRequired") && !comment) return err("Add a short comment \u2014 every action needs one.");
  const who = firstName(s, userId);
  const t = now();
  const b = baseOf(s, item);
  const om = ownersManager(s, item);
  let label = ACTION_LABEL[action];
  switch (action) {
    case "accept": {
      item.status = item.prevStatus || "open";
      item.prevStatus = null;
      item.acceptedAt = t;
      item.lastUpdateAt = t;
      log(s, userId, item.id, "Accepted ownership", "Awaiting acceptance", "Open");
      if (t - (item.assignedAt || item.createdAt) <= P(s, "fastAcceptH") * HOUR) {
        scoreEvent(s, userId, item.id, "fast_accept", "R9", P(s, "fastAcceptBonus"), `Accepted within ${P(s, "fastAcceptH")} hours`);
      }
      notify(s, item.creatorId, `\u{1F64C} ${who} accepted *${item.title}* and owns it now. Due ${fmtDT(item.currentDeadline)}.`, { itemId: item.id, exclude: [userId] });
      notify(s, om, `${who} accepted *${item.title}*.`, { itemId: item.id, mode: "digest", exclude: [userId, item.creatorId] });
      break;
    }
    case "decline": {
      item.declined = { by: userId, reason: comment, at: t };
      log(s, userId, item.id, "Declined ownership");
      notify(s, item.creatorId, `${who} can't take *${item.title}*: \u201C${comment}\u201D. Pick another owner from the task page.`, { itemId: item.id, buttons: ["open"] });
      notify(s, om, `${who} declined *${item.title}*.`, { itemId: item.id, mode: "digest" });
      break;
    }
    case "update": {
      const before = progressOf(s, item);
      if (payload.checklist && item.progressMethod === "checklist") item.checklist = payload.checklist;
      if (payload.stage != null && item.progressMethod === "stages") item.stage = Math.min(75, +payload.stage);
      if (payload.progress != null) item.progress = +payload.progress;
      if (payload.pickupDate) item.pickupDate = payload.pickupDate;
      const after = progressOf(s, item);
      if (item.status === "open" && (after > 0 || payload.started)) item.status = "in_progress";
      if (item.status === "open" && after === 0) item.status = "in_progress";
      item.lastUpdateAt = t;
      log(s, userId, item.id, "Progress", `${before}%`, `${after}%`);
      label = `Updated progress ${before}% \u2192 ${after}%`;
      notify(s, [item.creatorId, om], `${who} moved *${item.title}* to ${after}%: \u201C${comment.slice(0, 100)}\u201D`, { itemId: item.id, mode: "digest", critical: false, exclude: [userId] });
      break;
    }
    case "give_assignee": {
      if (!payload.assigneeId || payload.assigneeId === item.ownerId) return err("Pick a colleague to hand this to.");
      item.assigneeId = payload.assigneeId;
      log(s, userId, item.id, "Assignee", null, nameOf(s, payload.assigneeId));
      label = `Gave to ${firstName(s, payload.assigneeId)}`;
      notify(s, payload.assigneeId, `${who} handed you part of *${item.title}*: \u201C${comment}\u201D. Assign it back when your part is done.`, { itemId: item.id, buttons: ["update", "open"] });
      break;
    }
    case "assign_back": {
      const was = item.assigneeId;
      item.assigneeId = null;
      item.lastUpdateAt = t;
      log(s, userId, item.id, "Assigned back", nameOf(s, was), nameOf(s, item.ownerId));
      notify(s, [item.ownerId, was], `*${item.title}* is back with ${firstName(s, item.ownerId)}: \u201C${comment}\u201D`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case "block": {
      if (!payload.blockedBy) return err("Who is it blocked by?");
      if (payload.blockedBy === userId) return err("You can't be blocked by yourself.");
      item.prevStatus = item.status;
      item.status = "blocked";
      item.blockedBy = payload.blockedBy;
      item.blockedReason = comment;
      item.blockedAt = t;
      item.blockedApprovedDays = 0;
      log(s, userId, item.id, "Blocked", null, `by ${nameOf(s, payload.blockedBy)}`);
      label = `Marked blocked by ${firstName(s, payload.blockedBy)}`;
      notify(s, payload.blockedBy, `${who} is blocked on *${item.title}* and needs you: \u201C${comment}\u201D. Unblocking within ${P(s, "unblockWithinH")}h earns +${P(s, "unblockBonus")}.`, { itemId: item.id, buttons: ["unblock", "open"] });
      notify(s, [mainManager(s, payload.blockedBy), om], `${who} is blocked on *${item.title}* by ${firstName(s, payload.blockedBy)}: \u201C${comment}\u201D`, { itemId: item.id, exclude: [payload.blockedBy, userId] });
      break;
    }
    case "unblock": {
      const held = t - item.blockedAt;
      item.pausedMs = (item.pausedMs || 0) + Math.min(held, allowedPauseMs(s, item));
      if (userId === item.blockedBy && held <= P(s, "unblockWithinH") * HOUR) {
        scoreEvent(s, userId, item.id, "unblock", "R8", P(s, "unblockBonus"), `Unblocked ${firstName(s, item.ownerId)} within ${P(s, "unblockWithinH")}h`);
      }
      item.status = item.prevStatus || "in_progress";
      item.prevStatus = null;
      log(s, userId, item.id, "Unblocked", `by ${nameOf(s, item.blockedBy)}`, null);
      for (const ap of s.approvals.filter((a) => a.itemId === item.id && a.type === "blocked_extra" && a.status === "pending")) ap.status = "closed";
      item.blockedBy = null;
      item.blockedAt = null;
      item.lastUpdateAt = t;
      notify(s, [item.ownerId, item.assigneeId], `\u{1F513} *${item.title}* is unblocked: \u201C${comment}\u201D. The deadline clock is running again.`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case "request_extension": {
      const nd = payload.newDeadline;
      if (!nd || nd <= item.currentDeadline) return err("Pick a new deadline after the current one.");
      const parent = item.parentId ? itemById(s, item.parentId) : null;
      if (parent?.currentDeadline && nd > effectiveDeadline(s, parent)) {
        notify(s, parent.ownerId, `${who} needs *${item.title}* to go past the ${parent.type} deadline (${fmtDT(parent.currentDeadline)}). Extend *${parent.title}* first if that's okay.`, { itemId: parent.id });
        return err(`That's after \u201C${parent.title}\u201D ends (${fmtDT(parent.currentDeadline)}). The ${parent.type} needs extending first \u2014 ${firstName(s, parent.ownerId)} has been told.`);
      }
      const noticeH = (effectiveDeadline(s, item) - t) / HOUR;
      const nth = (item.extensionsCount || 0) + 1;
      const mode = P(s, "extensionApprover");
      let approvers = mode === "creator" ? [item.creatorId] : mode === "manager" ? [om] : [item.creatorId, om];
      approvers = approvers.filter((x) => x && x !== userId);
      if (!approvers.length) approvers = [om || founders(s)[0]];
      const cost = [];
      if (noticeH < P(s, "freeExtNoticeH")) cost.push(`\u2212${P(s, "extLateNotice") * 100}% (short notice)`);
      if (nth > P(s, "freeExtensions")) cost.push(`\u2212${P(s, "extRepeat") * 100}% (extension #${nth})`);
      requestApproval(s, "extension", item, userId, approvers, { newDeadline: nd, oldDeadline: item.currentDeadline, noticeH, nth, cost }, `${who} asks to move *${item.title}* from ${fmtDT(item.currentDeadline)} to ${fmtDT(nd)}${cost.length ? ` \xB7 ${cost.join(", ")} of Base` : " \xB7 free extension"}. \u201C${comment}\u201D`);
      label = `Requested extension to ${fmtDT(nd)}`;
      break;
    }
    case "submit": {
      if (!isUrl(payload.proofLink)) return err("Add a proof link (Google Doc, Drive, Canva\u2026) \u2014 it starts with https://");
      item.status = "in_review";
      item.submittedAt = t;
      item.deadlineAtSubmit = effectiveDeadline(s, item);
      item.proofLinks = [...item.proofLinks || [], payload.proofLink.trim()];
      if (item.progressMethod === "stages") item.stage = 100;
      item.lastUpdateAt = t;
      log(s, userId, item.id, "Status", "In progress", "In review");
      const early = item.deadlineAtSubmit - t;
      const when = early >= DAY ? `${Math.floor(early / DAY)}d early` : early >= 0 ? "on time" : "after the deadline";
      notify(s, item.reviewerId, `\u{1F4EC} ${who} submitted *${item.title}* for your review (${when}). Proof: ${payload.proofLink}`, { itemId: item.id, buttons: ["review", "open"] });
      if (item.recurringId) {
        const rule = s.recurring.find((r) => r.id === item.recurringId);
        if (rule && early >= 0) rule.consecutiveMisses = 0;
      }
      break;
    }
    case "review": {
      if (payload.decision === "send_back") {
        item.status = "in_progress";
        item.submittedAt = null;
        item.deadlineAtSubmit = null;
        if (item.progressMethod === "stages") item.stage = 75;
        log(s, userId, item.id, "Sent back", "In review", "In progress");
        label = "Sent back";
        notify(s, item.ownerId, `${who} sent *${item.title}* back for a few changes: \u201C${comment}\u201D. The deadline clock is running again.`, { itemId: item.id });
        break;
      }
      const rating = +payload.rating;
      if (![1, 2, 3].includes(rating)) return err("Give a quality rating (1\u20133 \u2605).");
      if ((rating === 1 || rating === 3) && !comment) return err("Add a one-line reason for 1\u2605 or 3\u2605.");
      label = `Accepted with ${rating}\u2605`;
      closeWithRating(s, item, rating, userId);
      break;
    }
    case "verify_cycle": {
      const ach = cycleAchievement(s, item);
      for (const k of s.kpis.filter((k2) => k2.itemId === item.id)) for (const a of k.actuals) a.verifiedBy = a.verifiedBy || userId;
      item.verified = true;
      item.status = "closed";
      item.closedAt = t;
      const pts = b * ach;
      scoreEvent(s, item.ownerId, item.id, "cycle", "R5", pts, `Stream cycle: Base ${b} \xD7 ${Math.round(ach * 100)}% KPI achievement`);
      log(s, userId, item.id, "KPIs verified", null, `${Math.round(ach * 100)}%`);
      notify(s, item.ownerId, `\u{1F4C8} ${who} verified *${item.title}* \u2014 ${Math.round(ach * 100)}% KPI achievement, +${Math.round(pts * 10) / 10} points.`, { itemId: item.id });
      break;
    }
    case "cancel": {
      if (canCancelDirect(s, userId, item)) doCancel(s, userId, item, comment);
      else {
        requestApproval(s, "cancel", item, userId, [om], { reason: comment }, `${who} wants to cancel *${item.title}*: \u201C${comment}\u201D`);
        notify(s, [item.ownerId, item.assigneeId], `${who} asked to cancel *${item.title}* \u2014 waiting on ${firstName(s, om)}.`, { itemId: item.id, exclude: [userId] });
        label = "Requested cancel";
      }
      break;
    }
    case "reopen": {
      const from = item.status;
      reverseTaskPoints(s, item);
      item.status = "in_progress";
      item.rating = null;
      item.closedAt = null;
      item.submittedAt = null;
      item.deadlineAtSubmit = null;
      if (item.progressMethod === "stages") item.stage = 75;
      item.lastUpdateAt = t;
      log(s, userId, item.id, "Reopened", from, "in_progress");
      notify(s, [item.ownerId, om], `\u21A9\uFE0F ${who} reopened *${item.title}*: \u201C${comment}\u201D. Points are on hold until it's re-submitted.`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case "change_owner": {
      const nid = payload.newOwnerId;
      if (!nid || nid === item.ownerId) return err("Pick the new owner.");
      if (["awaiting", "pending_approval"].includes(item.status)) {
        const old = item.ownerId;
        item.ownerId = nid;
        item.declined = null;
        item.rejected = null;
        item.reviewerId = reviewerFor(s, item.creatorId, nid, item.vertical);
        if (!userById(s, nid).verticals.some((v) => v.vid === item.vertical)) item.vertical = userById(s, nid).verticals.find((v) => v.main)?.vid;
        item.assignedAt = t;
        log(s, userId, item.id, "Owner", nameOf(s, old), nameOf(s, nid));
        label = `Reassigned to ${firstName(s, nid)}`;
        if (P(s, "crossVerticalApproval") && !sharesVertical(s, item.creatorId, nid) && !isFounder(s, item.creatorId) && item.creatorId !== nid) {
          item.status = "pending_approval";
          requestApproval(s, "cross_vertical", item, userId, [managerOf(s, nid, item.vertical)], {}, `${who} wants to give *${item.title}* to ${firstName(s, nid)}.`);
        } else if (item.creatorId === nid) {
          item.status = "open";
          item.acceptedAt = t;
        } else {
          item.status = "awaiting";
          sendAssignedDM(s, item);
        }
      } else {
        const newMgr = managerOf(s, nid, item.vertical);
        requestApproval(s, "owner_change", item, userId, [newMgr], { newOwnerId: nid }, `${who} wants to move *${item.title}* from ${firstName(s, item.ownerId)} to ${firstName(s, nid)}. \u201C${comment}\u201D`);
        label = `Requested owner change to ${firstName(s, nid)}`;
      }
      break;
    }
    case "edit": {
      const fields = ["title", "desc", "links", "checklist", "private", "contributors", "goalLinks"];
      if (canEditSizeImpact(s, userId, item)) fields.push("size", "impact", "impactReason", "estHours");
      if (payload.private != null && item.creatorId !== userId) delete payload.private;
      for (const f2 of fields) {
        if (payload[f2] === void 0) continue;
        const before = JSON.stringify(item[f2]);
        const after = JSON.stringify(payload[f2]);
        if (before !== after) {
          log(s, userId, item.id, `Edited ${f2}`, typeof item[f2] === "object" ? null : item[f2], typeof payload[f2] === "object" ? null : payload[f2]);
          item[f2] = payload[f2];
        }
      }
      if (comment) addComment(s, userId, item.id, comment, "Edited");
      notify(s, [item.creatorId, om, item.ownerId], `${who} edited *${item.title}*.`, { itemId: item.id, mode: "digest", critical: false, exclude: [userId] });
      return { ok: true };
    }
    case "flag_size": {
      log(s, userId, item.id, "Flagged size/impact", null, comment);
      notify(s, [item.creatorId, om], `${who} thinks the size/impact on *${item.title}* needs another look: \u201C${comment}\u201D`, { itemId: item.id });
      break;
    }
    case "skip": {
      requestApproval(s, "skip", item, userId, [om], {}, `${who} asks to skip this occurrence of *${item.title}* (${fmtDate(item.currentDeadline)}): \u201C${comment}\u201D`);
      break;
    }
    case "pin": {
      item.pinned = !item.pinned;
      log(s, userId, item.id, item.pinned ? "Pinned by manager" : "Unpinned");
      if (item.pinned) notify(s, item.ownerId, `\u{1F4CC} ${who} pinned *${item.title}* \u2014 it'll rank higher in your top 3.`, { itemId: item.id, mode: "digest" });
      return { ok: true };
    }
    default:
      return err("Unknown action.");
  }
  if (comment) addComment(s, userId, item.id, comment, label);
  return { ok: true };
}
function closeWithRating(s, item, rating, deciderId, system = false) {
  item.status = "closed";
  item.rating = rating;
  item.closedAt = now();
  log(s, deciderId, item.id, system ? "Auto-accepted (no review in time)" : "Accepted", "In review", `Closed ${rating}\u2605`);
  const r = scoreTaskClose(s, item);
  const total = Math.round((r.pts + r.latePts) * 10) / 10;
  const when = r.when === "late" ? "submitted late" : r.when;
  notify(
    s,
    item.ownerId,
    r.when === "late" ? `*${item.title}* is closed \u2014 ${rating}\u2605, ${when}. ${total >= 0 ? "+" : ""}${total} points. Thanks for seeing it through.` : `\u2705 *${item.title}* accepted \u2014 ${rating}\u2605 and ${when}! +${total} points. Beautiful ownership.`,
    { itemId: item.id }
  );
  checkProjectClose(s, item.parentId);
  return r;
}
function doCancel(s, userId, item, reason) {
  const from = item.status;
  item.status = "cancelled";
  item.cancelReason = reason;
  item.closedAt = now();
  log(s, userId, item.id, "Cancelled", from, "cancelled");
  notify(s, [item.ownerId, item.assigneeId, item.creatorId, ownersManager(s, item)], `*${item.title}* was cancelled by ${firstName(s, userId)}: \u201C${reason}\u201D. No points either way.`, { itemId: item.id, exclude: [userId] });
  checkProjectClose(s, item.parentId);
}
function checkProjectClose(s, projectId) {
  const p = projectId ? itemById(s, projectId) : null;
  if (!p) return;
  if (p.type === "task") return checkProjectClose(s, p.parentId);
  if (p.type !== "project" || DONE.includes(p.status) || !["open", "in_progress"].includes(p.status)) return;
  const kids = children(s, p.id);
  if (!kids.length || !kids.every((k) => DONE.includes(k.status)) || !kids.some((k) => k.status === "closed")) return;
  p.status = "closed";
  p.closedAt = now();
  const b = baseOf(s, p);
  const onTime = p.closedAt <= effectiveDeadline(s, p);
  if (onTime) {
    scoreEvent(s, p.ownerId, p.id, "project", "R4", b * P(s, "projectOnTimeBonus"), `Project closed on time: +project Base ${b}`);
    notify(s, p.ownerId, `\u{1F389} Project *${p.title}* closed on time! +${b * P(s, "projectOnTimeBonus")} points. Great job steering it home.`, { itemId: p.id });
  } else {
    scoreEvent(s, p.ownerId, p.id, "project", "P10", -b * P(s, "projectLate"), `Project closed after its deadline: \u2212${P(s, "projectLate") * 100}% of Base ${b}`);
    notify(s, p.ownerId, `Project *${p.title}* is fully closed \u2014 a bit after its deadline. Worth a quick look at what slowed it down.`, { itemId: p.id });
  }
  log(s, null, p.id, "Project closed", null, onTime ? "on time" : "late");
}
var FREQ_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", custom: "Every N days" };
function advanceRun(rule, ts) {
  if (rule.freq === "daily") {
    let n = addDays(ts, 1);
    if (weekday(n) === 0) n = addDays(n, 1);
    return n;
  }
  if (rule.freq === "weekly") return addDays(ts, 7);
  if (rule.freq === "monthly") return addMonths(ts, 1);
  if (rule.freq === "quarterly") return addMonths(ts, 3);
  return addDays(ts, Math.max(1, rule.everyDays || 7));
}
function createRecurringRule(s, creatorId, d) {
  const rule = {
    id: uid("r"),
    template: { ...d, type: "task" },
    freq: d.freq || "weekly",
    everyDays: +d.everyDays || 7,
    dueAfterDays: d.dueAfterDays != null ? +d.dueAfterDays : { daily: 0, weekly: 5, monthly: 7, quarterly: 14, custom: 3 }[d.freq || "weekly"],
    ownerId: d.ownerId,
    creatorId,
    nextRun: atTime(d.firstRun || now(), "09:00"),
    active: true,
    consecutiveMisses: 0,
    createdAt: now()
  };
  if (rule.nextRun < startOfDay(now())) rule.nextRun = atTime(now(), "09:00");
  s.recurring.push(rule);
  return runRecurring(s, rule);
}
function runRecurring(s, rule) {
  let first = null;
  let guard = 0;
  while (rule.active && rule.nextRun <= now() + 60 * 1e3 && guard++ < 30) {
    for (const prev of s.items.filter((i) => i.recurringId === rule.id && ["awaiting", "open", "in_progress", "blocked"].includes(i.status) && !i.missFlag && i.currentDeadline < rule.nextRun)) {
      prev.missFlag = true;
      scoreEvent(s, prev.ownerId, prev.id, "recurring_missed", "P9", -baseOf(s, prev) * P(s, "recurringMissed"), "Recurring occurrence missed");
      rule.consecutiveMisses = (rule.consecutiveMisses || 0) + 1;
      if (rule.consecutiveMisses >= 2) {
        notify(s, ownersManager(s, prev), `${firstName(s, prev.ownerId)} has missed *${rule.template.title}* twice in a row. A quick chat might help.`, { itemId: prev.id });
      }
    }
    const deadline = atTime(addDays(rule.nextRun, rule.dueAfterDays), P(s, "defaultDeadlineTime"));
    const res = createItem(s, rule.creatorId, { ...rule.template, deadline, recurringId: rule.id, autoAccept: true, comment: null });
    if (res.id) {
      const it = itemById(s, res.id);
      it.createdAt = Math.min(now(), rule.nextRun);
      it.assignedAt = it.createdAt;
      it.lastUpdateAt = it.createdAt;
      first = first || res.id;
      notify(s, rule.ownerId, `\u21BB New ${FREQ_LABEL[rule.freq].toLowerCase()} occurrence: *${it.title}* \u2014 due ${fmtDT(deadline)}.`, { itemId: res.id });
    }
    rule.nextRun = advanceRun(rule, rule.nextRun);
  }
  return { id: first };
}
var KPI_SOURCES = [
  ["manual", "Entered by hand (Saturday)"],
  ["meta:leads", "Meta Ads \xB7 Leads"],
  ["meta:spend", "Meta Ads \xB7 Spend (\u20B9)"],
  ["meta:cpl", "Meta Ads \xB7 Cost per lead (\u20B9)"],
  ["meta:clicks", "Meta Ads \xB7 Clicks"],
  ["meta:impressions", "Meta Ads \xB7 Impressions"],
  ["meta:ctr", "Meta Ads \xB7 Click-through rate (%)"],
  ["zoho:leads_created", "Zoho CRM \xB7 Leads created"],
  ["zoho:deals_created", "Zoho CRM \xB7 Deals created"],
  ["zoho:deals_won", "Zoho CRM \xB7 Deals won"],
  ["zoho:won_amount", "Zoho CRM \xB7 Won amount (\u20B9)"]
];

// src/engine/sow.js
var offDayOf = (s, userId, k) => s.offDays.find((o) => o.userId === userId && o.date === k);
var sowDayOf = (s, userId, k) => s.sowDays.find((d) => d.userId === userId && d.date === k);
function sowDay(s, userId, k) {
  let d = sowDayOf(s, userId, k);
  if (!d) {
    d = { id: uid("s"), userId, date: k, top3: [], entries: [], submittedAt: null, status: null };
    s.sowDays.push(d);
  }
  return d;
}
function sowRequired(s, userId, k) {
  if (!isWorkingDay(k) || isHoliday(s, k)) return false;
  const off = offDayOf(s, userId, k);
  const u = userById(s, userId);
  if (u?.joinedOn && k < u.joinedOn) return false;
  return !off || off.code === "Half-day";
}
function classify(s, k, submittedAt) {
  if (submittedAt <= atTime(k, "23:59") + 59 * 1e3) return "on_time";
  if (submittedAt <= atTime(addKey(k, 1), P(s, "sowDeadline"))) return "late";
  return "missed";
}
function sowStatus(s, userId, k, at = now()) {
  if (!isWorkingDay(k)) return "sunday";
  if (isHoliday(s, k)) return "holiday";
  const off = offDayOf(s, userId, k);
  if (off && off.code !== "Half-day") return "off";
  const d = sowDayOf(s, userId, k);
  if (d?.submittedAt) return d.status || classify(s, k, d.submittedAt);
  if (k > dateKey(at)) return "future";
  if (at > atTime(addKey(k, 1), P(s, "sowDeadline"))) return "missed";
  return "pending";
}
function openSowDays(s, userId, at = now()) {
  const res = [];
  for (let i = 1; i <= 7; i++) {
    const k = addKey(dateKey(at), -i);
    if (!sowRequired(s, userId, k)) continue;
    const d = sowDayOf(s, userId, k);
    if (!d?.submittedAt) res.push(k);
  }
  return res;
}
function myOpenWork(s, userId) {
  return s.items.filter((i) => (isWorkItem(i) || i.type === "cycle") && (i.ownerId === userId || i.assigneeId === userId) && ["open", "in_progress", "blocked", "in_review"].includes(i.status));
}
function urgencyOf(s, item, at = now()) {
  const d = effectiveDeadline(s, item, at);
  if (d == null) return P(s, "urgFar");
  const days = (d - at) / DAY;
  if (days < 0) return P(s, "urgOverdue");
  if (days <= 2) return P(s, "urgNear");
  if (days <= 7) return P(s, "urgMid");
  return P(s, "urgFar");
}
function priorityOf(s, item, at = now()) {
  const f2 = flagsOf(s, item, at);
  return item.impact * urgencyOf(s, item, at) + (f2.atRisk ? P(s, "wAtRisk") : 0) + (item.pinned ? P(s, "wPinned") : 0);
}
function rankCandidates(s, userId, forKey, at = now()) {
  return myOpenWork(s, userId).filter((i) => !["blocked", "in_review"].includes(i.status)).filter((i) => !i.pickupDate || i.pickupDate <= forKey).map((i) => ({ item: i, p: priorityOf(s, i, at) })).sort((a, b) => b.p - a.p || (a.item.currentDeadline || 0) - (b.item.currentDeadline || 0));
}
var suggestTop3 = (s, userId, forKey, at) => rankCandidates(s, userId, forKey, at).slice(0, 3).map((x) => x.item.id);
function todaysTop3(s, userId, k = dateKey(now())) {
  const d = sowDayOf(s, userId, k);
  const valid = (id) => {
    const i = itemById(s, id);
    return i && (i.ownerId === userId || i.assigneeId === userId) && !["cancelled", "skipped"].includes(i.status);
  };
  if (d?.top3?.length) return { ids: d.top3.filter(valid), planned: true };
  return { ids: suggestTop3(s, userId, k), planned: false };
}
function eodItems(s, userId, k) {
  const { ids } = todaysTop3(s, userId, k);
  const from = parseKey(k);
  const to = from + DAY;
  const touched = new Set(s.activity.filter((a) => a.userId === userId && a.itemId && a.ts >= from && a.ts < to).map((a) => a.itemId));
  const set = new Set(ids);
  for (const i of myOpenWork(s, userId)) {
    if (i.currentDeadline && startOfDay(i.currentDeadline) === from) set.add(i.id);
    if (touched.has(i.id)) set.add(i.id);
  }
  return [...set].map((id) => itemById(s, id)).filter((i) => i && ["open", "in_progress", "blocked"].includes(i.status) && (i.ownerId === userId || i.assigneeId === userId));
}
function nextWorkingKey(s, k) {
  let n = addKey(k, 1);
  for (let g = 0; g < 10 && (!isWorkingDay(n) || isHoliday(s, n)); g++) n = addKey(n, 1);
  return n;
}
function submitSOW(s, userId, k, entries, plan) {
  const errors = [];
  for (const e of entries) {
    if (!e.outcome) errors.push("Pick Done, Progress or Not touched for every task.");
    if (e.outcome === "not_touched" && (!e.reason || !e.comment?.trim())) errors.push("\u201CNot touched\u201D needs a reason and a short comment.");
    if (e.outcome === "done") {
      const it = itemById(s, e.itemId);
      if (it.ownerId === userId && !/^https?:\/\/\S+\.\S+/.test(e.proofLink || "")) errors.push(`Add a proof link for \u201C${it.title}\u201D.`);
    }
  }
  const half = offDayOf(s, userId, plan.forKey)?.code === "Half-day";
  if (!plan.top3.length && !half) errors.push("Pick at least one task for tomorrow.");
  if (half && plan.top3.length < 1) errors.push("Half-day: pick at least 1 task.");
  for (const id of plan.droppedOverdue || []) if (!plan.dropReasons?.[id]?.trim()) errors.push("Add a one-line reason for each overdue task you dropped.");
  if (errors.length) return { error: [...new Set(errors)][0] };
  for (const e of entries) {
    const it = itemById(s, e.itemId);
    const note = e.comment?.trim();
    if (e.outcome === "done") {
      if (it.ownerId === userId) {
        const r = perform(s, userId, it.id, "submit", { proofLink: e.proofLink, comment: note || "Done \u2014 submitted from my daily SOW." });
        if (r.error) return r;
      } else {
        perform(s, userId, it.id, "assign_back", { comment: note || "My part is done \u2014 handing back (daily SOW)." });
      }
    } else if (e.outcome === "progress") {
      if (["open", "in_progress"].includes(it.status)) {
        const r = perform(s, userId, it.id, "update", { progress: e.progress, stage: e.stage, checklist: e.checklist, pickupDate: e.pickupDate, comment: note || "Progress logged in daily SOW." });
        if (r.error) return r;
      }
      it.pickupDate = e.pickupDate || it.pickupDate;
    } else {
      addComment(s, userId, it.id, `Not touched today \u2014 ${e.reason}: ${note}`, "Daily SOW");
    }
  }
  const day = sowDay(s, userId, k);
  day.entries = entries.map((e) => ({ itemId: e.itemId, outcome: e.outcome, reason: e.reason || null, comment: e.comment || "", pickupDate: e.pickupDate || null }));
  day.submittedAt = now();
  day.status = classify(s, k, day.submittedAt);
  const next = sowDay(s, userId, plan.forKey);
  next.top3 = plan.top3;
  next.plannedAt = now();
  next.dropReasons = plan.dropReasons || {};
  if (day.status === "on_time") {
    const ws = startOfWeek(parseKey(k));
    const keys = Array.from({ length: 6 }, (_, i) => dateKey(ws + i * DAY + 2 * 3600 * 1e3));
    const req = keys.filter((x) => sowRequired(s, userId, x));
    const lastReq = req[req.length - 1];
    if (req.length && k === lastReq && req.every((x) => sowStatus(s, userId, x) === "on_time") && once(s, `streak:${userId}:${ws}`)) {
      scoreEvent(s, userId, null, "streak", "R6", P(s, "sowWeekBonus"), `SOW ${req.length}/${req.length} on time this week`);
      notify(s, userId, `\u{1F525} ${req.length}/${req.length} on-time SOWs this week! +${P(s, "sowWeekBonus")} points. Lovely rhythm.`, { quietOk: true });
    }
  }
  return { ok: true, status: day.status };
}

// src/engine/goals.js
var GOAL_TYPES = [
  ["top", "Top goal"],
  ["behaviour", "Behaviour / skill"],
  ["health", "Health"],
  ["initiative", "Extra initiative"],
  ["kpi", "KPI"]
];
var GOAL_LABEL = Object.fromEntries(GOAL_TYPES);

// src/engine/seed.js
var STATE_VERSION = 4;
function emptyState() {
  return {
    version: STATE_VERSION,
    clockOffset: 0,
    sessionUserId: null,
    verticals: [],
    users: [],
    roles: [],
    items: [],
    seq: {},
    comments: [],
    activity: [],
    approvals: [],
    sowDays: [],
    offDays: [],
    holidays: [],
    scoreEvents: [],
    appeals: [],
    policyVersions: [],
    kpis: [],
    recurring: [],
    notifications: [],
    channel: [],
    matrixOverrides: {},
    flags: {},
    goals: [],
    reviews: []
  };
}

// src/lib/sync.js
var client = supabase;
var useClient = (c) => {
  client = c;
};
var toDb = (v, kind) => {
  if (kind === "a") return Array.isArray(v) ? v : [];
  if (kind === "B") return !!v;
  if (kind === "N") return v == null || v === "" ? 0 : +v;
  if (v === void 0 || v === null) return null;
  if (kind === "t") return new Date(v).toISOString();
  if (kind === "n") return v === "" ? null : +v;
  if (kind === "b") return !!v;
  return v;
};
var fromDb = (v, kind) => {
  if (v === null || v === void 0) return void 0;
  if (kind === "t") return Date.parse(v);
  if (kind === "n" || kind === "N") return +v;
  if (kind === "d") return String(v).slice(0, 10);
  return v;
};
var getPath = (o, p) => p.split(".").reduce((x, k) => x == null ? void 0 : x[k], o);
var setPath = (o, p, v) => {
  const ks = p.split(".");
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] = cur[ks[i]] && typeof cur[ks[i]] === "object" ? cur[ks[i]] : {};
  cur[ks[ks.length - 1]] = v;
};
var f = (path, col = path, kind = "s", writeOnly = false) => ({ path, col, kind, writeOnly });
var ID = f("id");
var CHILD = {
  user_verticals: {
    prop: "verticals",
    parentCol: "user_id",
    position: true,
    idOf: (p, el) => `${p.id}:${el.vid}`,
    fields: [f("vid", "vertical_id"), f("managerId", "manager_id"), f("main", "is_main", "B")]
  },
  user_roles: {
    prop: "customRoles",
    parentCol: "user_id",
    scalar: "role_id",
    idOf: (p, el) => `${p.id}:${el}`
  },
  checklist_items: {
    prop: "checklist",
    parentCol: "item_id",
    position: true,
    idOf: (p, el) => el.id,
    fields: [f("id"), f("text"), f("done", "done", "B")]
  },
  item_links: {
    prop: "links",
    parentCol: "item_id",
    position: true,
    idOf: (p, el, i) => `${p.id}:${i}`,
    fields: [f("label"), f("url")]
  },
  sow_entries: {
    prop: "entries",
    parentCol: "sow_day_id",
    position: true,
    idOf: (p, el, i) => `${p.id}:${i}`,
    fields: [f("itemId", "item_id"), f("outcome"), f("reason", "reason_code"), f("comment"), f("pickupDate", "pickup_date", "d")]
  },
  kpi_actuals: {
    prop: "actuals",
    parentCol: "kpi_id",
    position: true,
    idOf: (p, el) => el.id,
    fields: [f("id"), f("weekOf", "week_of", "d"), f("value", "value", "n"), f("link", "source_link"), f("by", "entered_by"), f("ts", "entered_at", "t"), f("verifiedBy", "verified_by"), f("auto", "is_auto", "b")]
  },
  goal_checkins: {
    prop: "checkins",
    parentCol: "goal_id",
    position: true,
    idOf: (p, el) => el.id,
    fields: [f("id"), f("ts", "checked_at", "t"), f("value", "value", "n"), f("note"), f("by", "checked_by")]
  }
};
var SPECS = [
  { key: "verticals", table: "verticals", fields: [ID, f("name"), f("key")] },
  { key: "roles", table: "roles", fields: [ID, f("name"), f("abilities", "abilities", "a")] },
  {
    key: "users",
    table: "users",
    children: ["user_verticals", "user_roles"],
    fields: [ID, f("name"), f("email"), f("slackId", "slack_id"), f("role"), f("title"), f("hours", "daily_hours", "n"), f("status"), f("joinedOn", "joined_on", "d"), f("muted", "muted_item_ids", "a")]
  },
  {
    key: "recurring",
    table: "recurring_rules",
    fields: [ID, f("template.title", "title", "s", true), f("ownerId", "owner_id"), f("creatorId", "creator_id"), f("freq", "frequency"), f("everyDays", "every_days", "n"), f("dueAfterDays", "due_after_days", "n"), f("nextRun", "next_run_at", "t"), f("active", "is_active", "B"), f("consecutiveMisses", "consecutive_misses", "N"), f("template", "template", "j"), f("createdAt", "created_at", "t")]
  },
  {
    key: "items",
    table: "work_items",
    children: ["checklist_items", "item_links"],
    fields: [
      ID,
      f("key", "item_key"),
      f("type"),
      f("parentId", "parent_id"),
      f("title"),
      f("desc", "description"),
      f("vertical", "vertical_id"),
      f("creatorId", "creator_id"),
      f("ownerId", "owner_id"),
      f("assigneeId", "assignee_id"),
      f("reviewerId", "reviewer_id"),
      f("contributors", "contributor_ids", "a"),
      f("status"),
      f("prevStatus", "previous_status"),
      f("size"),
      f("impact", "impact", "n"),
      f("impactReason", "impact_reason"),
      f("estHours", "estimated_hours", "n"),
      f("progressMethod", "progress_method"),
      f("progress", "progress", "n"),
      f("stage", "stage", "n"),
      f("private", "is_private", "B"),
      f("pinned", "is_pinned", "B"),
      f("originalDeadline", "original_deadline", "t"),
      f("currentDeadline", "current_deadline", "t"),
      f("pickupDate", "pickup_date", "d"),
      f("proofLinks", "proof_links", "a"),
      f("rating", "rating", "n"),
      f("recurringId", "recurring_rule_id"),
      f("projKey", "project_key"),
      f("cycleLength", "cycle_length"),
      f("cycleStart", "cycle_start", "t"),
      f("verified", "cycle_verified", "b"),
      f("pausedMs", "paused_ms", "N"),
      f("extensionsCount", "extensions_count", "N"),
      f("blockedBy", "blocked_by"),
      f("blockedAt", "blocked_at", "t"),
      f("blockedReason", "blocked_reason"),
      f("blockedApprovedDays", "blocked_approved_days", "n"),
      f("declined.by", "declined_by"),
      f("declined.reason", "declined_reason"),
      f("declined.at", "declined_at", "t"),
      f("rejected.by", "rejected_by"),
      f("rejected.reason", "rejected_reason"),
      f("cancelReason", "cancel_reason"),
      f("offboardedFrom", "offboarded_from"),
      f("missFlag", "recurring_miss_flagged", "b"),
      f("setupBatch", "setup_batch", "b"),
      f("sizeConfirmedBy", "size_confirmed_by"),
      f("goalLinks", "goal_links", "a"),
      f("createdAt", "created_at", "t"),
      f("assignedAt", "assigned_at", "t"),
      f("acceptedAt", "accepted_at", "t"),
      f("lastUpdateAt", "last_update_at", "t"),
      f("submittedAt", "submitted_at", "t"),
      f("deadlineAtSubmit", "deadline_at_submit", "t"),
      f("closedAt", "closed_at", "t")
    ]
  },
  { key: "comments", table: "comments", fields: [ID, f("itemId", "item_id"), f("userId", "author_id"), f("text", "body"), f("action"), f("parentId", "parent_comment_id"), f("ts", "created_at", "t")] },
  { key: "activity", table: "activity_log", fields: [ID, f("itemId", "item_id"), f("userId", "actor_id"), f("action"), f("from", "old_value"), f("to", "new_value"), f("ts", "created_at", "t")] },
  {
    key: "approvals",
    table: "approvals",
    fields: [
      ID,
      f("type"),
      f("itemId", "item_id"),
      f("requesterId", "requester_id"),
      f("approverIds", "approver_ids", "a"),
      f("status"),
      f("text", "summary"),
      f("payload.newDeadline", "new_deadline", "t"),
      f("payload.oldDeadline", "old_deadline", "t"),
      f("payload.noticeH", "notice_hours", "n"),
      f("payload.nth", "extension_number", "n"),
      f("payload.cost", "extension_cost", "a"),
      f("payload.newOwnerId", "new_owner_id"),
      f("payload.reason", "reason"),
      f("payload.day", "blocked_day", "n"),
      f("payload.itemIds", "setup_item_ids"),
      f("payload.size", "proposed_size"),
      f("payload.impact", "proposed_impact", "n"),
      f("payload.confirmedSize", "confirmed_size"),
      f("payload.confirmedImpact", "confirmed_impact", "n"),
      f("decidedBy", "decided_by"),
      f("decidedAt", "decided_at", "t"),
      f("comment", "decision_comment"),
      f("ts", "created_at", "t")
    ]
  },
  {
    key: "sowDays",
    table: "sow_days",
    children: ["sow_entries"],
    fields: [ID, f("userId", "user_id"), f("date", "sow_date", "d"), f("top3", "top3_item_ids", "a"), f("status"), f("submittedAt", "submitted_at", "t"), f("plannedAt", "planned_at", "t"), f("missedPenalized", "missed_penalized", "b"), f("dropReasons", "drop_reasons", "j")]
  },
  { key: "offDays", table: "off_days", fields: [ID, f("userId", "user_id"), f("date", "off_date", "d"), f("code"), f("reason"), f("ts", "created_at", "t")] },
  { key: "holidays", table: "holidays", idOf: (r) => r.date, fields: [f("date", "holiday_date", "d"), f("name")] },
  {
    key: "scoreEvents",
    table: "score_events",
    fields: [ID, f("userId", "user_id"), f("itemId", "item_id"), f("type"), f("code"), f("points", "points", "n"), f("note"), f("policyVersion", "policy_version"), f("trial", "is_trial", "B"), f("reversed", "reversed", "B"), f("meta.early", "is_early", "b"), f("meta.onTime", "is_on_time", "b"), f("meta.impact", "impact", "n"), f("meta.rating", "rating", "n"), f("ts", "created_at", "t")]
  },
  { key: "appeals", table: "appeals", fields: [ID, f("scoreEventId", "score_event_id"), f("userId", "user_id"), f("reason"), f("month", "review_month", "d"), f("status"), f("outcome"), f("decidedBy", "decided_by"), f("decidedAt", "decided_at", "t"), f("ts", "created_at", "t")] },
  { key: "policyVersions", table: "policy_versions", fields: [ID, f("key", "setting_key"), f("oldValue", "old_value", "j"), f("newValue", "new_value", "j"), f("effectiveFrom", "effective_from", "t"), f("changedBy", "changed_by"), f("ts", "changed_at", "t")] },
  { key: "kpis", table: "kpis", children: ["kpi_actuals"], fields: [ID, f("itemId", "item_id"), f("name"), f("target", "target", "n"), f("unit"), f("dir", "direction"), f("agg", "aggregation"), f("source"), f("sourceMetric", "source_metric")] },
  {
    key: "goals",
    table: "goals",
    children: ["goal_checkins"],
    fields: [ID, f("userId", "user_id"), f("type"), f("title"), f("desc", "description"), f("periodStart", "period_start", "d"), f("periodEnd", "period_end", "d"), f("measure"), f("dir", "direction"), f("target", "target", "n"), f("current", "current_value", "n"), f("unit"), f("weight", "weight", "n"), f("private", "is_private", "B"), f("status"), f("statusNote", "status_note"), f("createdBy", "created_by"), f("createdAt", "created_at", "t"), f("lastCheckIn", "last_check_in", "t"), f("achievedAt", "achieved_at", "t")]
  },
  {
    key: "reviews",
    table: "performance_reviews",
    fields: [ID, f("userId", "user_id"), f("reviewerId", "reviewer_id"), f("periodLabel", "period_label"), f("periodStart", "period_start", "d"), f("periodEnd", "period_end", "d"), f("snapshot", "snapshot", "j"), f("rating", "rating", "n"), f("strengths"), f("improve", "growth_area"), f("notes"), f("status"), f("createdAt", "created_at", "t"), f("updatedAt", "updated_at_app", "t"), f("sharedAt", "shared_at", "t"), f("ackAt", "acknowledged_at", "t"), f("ackNote", "acknowledgement")]
  },
  { key: "notifications", table: "notifications", fields: [ID, f("userId", "user_id"), f("itemId", "item_id"), f("text", "message"), f("mode"), f("kind"), f("approvalId", "approval_id"), f("buttons", "buttons", "a"), f("read", "is_read", "B"), f("ts", "created_at", "t"), f("deliverAt", "deliver_at", "t")] },
  { key: "channel", table: "channel_posts", fields: [ID, f("channel"), f("text", "message"), f("ts", "created_at", "t")] }
];
var SPEC_BY_TABLE = Object.fromEntries(SPECS.map((sp) => [sp.table, sp]));
var CHILD_PARENT = {};
for (const sp of SPECS) for (const c of sp.children || []) CHILD_PARENT[c] = sp;
var TABLE_ORDER = [
  "verticals",
  "roles",
  "users",
  "user_verticals",
  "user_roles",
  "recurring_rules",
  "work_items",
  "checklist_items",
  "item_links",
  "comments",
  "activity_log",
  "approvals",
  "sow_days",
  "sow_entries",
  "off_days",
  "holidays",
  "score_events",
  "appeals",
  "policy_versions",
  "kpis",
  "kpi_actuals",
  "goals",
  "goal_checkins",
  "performance_reviews",
  "notifications",
  "channel_posts",
  "system_flags",
  "id_sequences",
  "matrix_overrides"
];
var APPEND_ONLY = /* @__PURE__ */ new Set(["activity_log"]);
var OPTIONAL = /* @__PURE__ */ new Set(["goals", "goal_checkins", "performance_reviews"]);
var missing = /* @__PURE__ */ new Set();
var isMissingTable = (e) => /does not exist|schema cache|PGRST205|42P01/i.test(`${e?.code || ""} ${e?.message || ""}`);
function pack(fields, rec, skipKeys = []) {
  const row = {};
  const roots = new Set(skipKeys);
  for (const fd of fields) {
    roots.add(fd.path.split(".")[0]);
    row[fd.col] = toDb(getPath(rec, fd.path), fd.kind);
  }
  const extra = {};
  for (const k of Object.keys(rec)) if (!roots.has(k) && rec[k] !== void 0) extra[k] = rec[k];
  row.extra = extra;
  return row;
}
function unpack(fields, row) {
  const rec = { ...row.extra || {} };
  for (const fd of fields) {
    if (fd.writeOnly) continue;
    const v = fromDb(row[fd.col], fd.kind);
    if (v !== void 0) setPath(rec, fd.path, v);
  }
  return rec;
}
function packRecord(sp, rec) {
  const row = pack(sp.fields, rec, (sp.children || []).map((c) => CHILD[c].prop));
  if (sp.idOf) row.id = sp.idOf(rec);
  return row;
}
function packChild(c, parent, el, i) {
  const row = { id: c.idOf(parent, el, i), [c.parentCol]: parent.id };
  if (c.scalar) {
    row[c.scalar] = el;
    row.extra = {};
    return row;
  }
  Object.assign(row, pack(c.fields, el));
  row.id = c.idOf(parent, el, i);
  if (c.position) row.position = i;
  return row;
}
var unpackChild = (c, row) => c.scalar ? row[c.scalar] : unpack(c.fields, row);
function rowsOf(s) {
  const out = Object.fromEntries(TABLE_ORDER.map((t) => [t, []]));
  for (const sp of SPECS) {
    for (const rec of s[sp.key] || []) {
      const row = packRecord(sp, rec);
      out[sp.table].push([row.id, row]);
      for (const ct of sp.children || []) {
        const c = CHILD[ct];
        (rec[c.prop] || []).forEach((el, i) => {
          const r = packChild(c, rec, el, i);
          out[ct].push([r.id, r]);
        });
      }
    }
  }
  out.system_flags = Object.entries(s.flags || {}).map(([k, v]) => [k, { id: k, set_at: typeof v === "number" ? toDb(v, "t") : null, extra: {} }]);
  out.id_sequences = Object.entries(s.seq || {}).map(([k, v]) => [k, { id: k, last_number: v, extra: {} }]);
  out.matrix_overrides = Object.entries(s.matrixOverrides || {}).flatMap(
    ([u, m]) => Object.entries(m || {}).map(([item, q]) => [`${u}:${item}`, { id: `${u}:${item}`, user_id: u, item_id: item, quadrant: q, extra: {} }])
  );
  return out;
}
function stateFromRows(byTable) {
  const s = emptyState();
  for (const sp of SPECS) {
    const kids = {};
    for (const ct of sp.children || []) {
      const c = CHILD[ct];
      kids[ct] = {};
      for (const r of (byTable[ct] || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
        (kids[ct][r[c.parentCol]] = kids[ct][r[c.parentCol]] || []).push(unpackChild(c, r));
      }
    }
    s[sp.key] = (byTable[sp.table] || []).map((row) => {
      const rec = unpack(sp.fields, row);
      for (const ct of sp.children || []) rec[CHILD[ct].prop] = kids[ct][row.id] || [];
      return rec;
    });
  }
  for (const r of byTable.system_flags || []) s.flags[r.id] = fromDb(r.set_at, "t") ?? true;
  for (const r of byTable.id_sequences || []) s.seq[r.id] = r.last_number;
  for (const r of byTable.matrix_overrides || []) (s.matrixOverrides[r.user_id] = s.matrixOverrides[r.user_id] || {})[r.item_id] = r.quadrant;
  for (const sp of SPECS) if (sp.key !== "holidays") s[sp.key].sort((a, b) => (a.ts || a.createdAt || 0) - (b.ts || b.createdAt || 0));
  return s;
}
async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1e3) {
    const { data, error } = await client.from(table).select("*").order("id").range(from, from + 999);
    if (error && OPTIONAL.has(table) && isMissingTable(error)) {
      missing.add(table);
      return [];
    }
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1e3) break;
  }
  return rows;
}
async function loadAll() {
  const results = await Promise.all(TABLE_ORDER.map((t) => fetchAll(t)));
  const s = stateFromRows(Object.fromEntries(TABLE_ORDER.map((t, i) => [t, results[i]])));
  if (!s.users.length) return null;
  baseline(s);
  return s;
}
var last = /* @__PURE__ */ new Map();
var recent = /* @__PURE__ */ new Map();
var rk = (t, id) => `${t}|${id}`;
function baseline(s) {
  last = /* @__PURE__ */ new Map();
  const rows = rowsOf(s);
  for (const t of TABLE_ORDER) for (const [id, row] of rows[t]) last.set(rk(t, id), JSON.stringify(row));
}
function diff(s) {
  const up = {};
  const del = {};
  const seen = /* @__PURE__ */ new Set();
  const rows = rowsOf(s);
  for (const t of TABLE_ORDER) {
    for (const [id, row] of rows[t]) {
      const k = rk(t, id);
      seen.add(k);
      const j = JSON.stringify(row);
      if (last.get(k) !== j) {
        (up[t] = up[t] || []).push(row);
        last.set(k, j);
      }
    }
  }
  for (const k of [...last.keys()]) {
    if (seen.has(k)) continue;
    const i = k.indexOf("|");
    const t = k.slice(0, i);
    if (APPEND_ONLY.has(t)) continue;
    (del[t] = del[t] || []).push(k.slice(i + 1));
    last.delete(k);
  }
  if (up.work_items) {
    const parentOf = new Map((s.items || []).map((i) => [i.id, i.parentId]));
    const depth = (id, g = 0) => !parentOf.get(id) || g > 10 ? 0 : 1 + depth(parentOf.get(id), g + 1);
    up.work_items.sort((a, b) => depth(a.id) - depth(b.id));
  }
  return { up, del };
}
var lastError = "";
var listeners = /* @__PURE__ */ new Set();
var saveStatus = "saved";
var setStatus = (st) => {
  saveStatus = st;
  listeners.forEach((fn) => fn(st));
};
var explain = (t, error) => /row-level security/i.test(error.message) ? "The database refused the save. Your sign-in email domain probably does not match the one in public.hb_is_member() in supabase/schema.sql." : `${t}: ${error.message}`;
var pendingDiff = null;
async function writeDiff() {
  const { up, del } = pendingDiff;
  pendingDiff = null;
  const stamp = (/* @__PURE__ */ new Date()).toISOString();
  let failed = false;
  for (const t of TABLE_ORDER) {
    const list = up[t];
    if (!list || missing.has(t)) continue;
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      chunk.forEach((r) => recent.set(rk(t, r.id), Date.now()));
      const { error } = await client.from(t).upsert(chunk.map((r) => ({ ...r, updated_at: stamp })), { onConflict: "id", ignoreDuplicates: APPEND_ONLY.has(t) });
      if (error) {
        console.error(t, error);
        failed = true;
        lastError = explain(t, error);
        chunk.forEach((r) => last.delete(rk(t, r.id)));
      }
    }
  }
  for (const t of [...TABLE_ORDER].reverse()) {
    const ids = del[t];
    if (!ids || missing.has(t)) continue;
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      part.forEach((id) => recent.set(rk(t, id), Date.now()));
      const { error } = await client.from(t).delete().in("id", part);
      if (error) {
        console.error(t, error);
        failed = true;
        lastError = explain(t, error);
      }
    }
  }
  if (failed) setStatus("error");
  return failed;
}
var CLIENT = Math.random().toString(36).slice(2);
async function saveNow(s) {
  const counts = {};
  const { up, del } = diff(s);
  for (const [t, l] of Object.entries(up)) counts[t] = l.length;
  for (const [t, l] of Object.entries(del)) counts[`${t} (deleted)`] = l.length;
  pendingDiff = { up, del };
  await writeDiff();
  if (saveStatus === "error") throw new Error(lastError);
  return counts;
}

// server/hb-slack.js
function makeSlack(token) {
  return async (method, body = {}, get = false) => {
    const url2 = `https://slack.com/api/${method}` + (get ? `?${new URLSearchParams(body)}` : "");
    const r = await fetch(url2, {
      method: get ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...get ? {} : { "Content-Type": "application/json; charset=utf-8" } },
      body: get ? void 0 : JSON.stringify(body)
    });
    const j = await r.json();
    if (!j.ok) console.error("slack", method, j.error, JSON.stringify(j.response_metadata || ""));
    return j;
  };
}
async function verifySlack(headers, raw, secret) {
  const ts = headers.get("x-slack-request-timestamp");
  const sig = headers.get("x-slack-signature") || "";
  if (!ts || !secret || Math.abs(Date.now() / 1e3 - Number(ts)) > 300) return false;
  const enc = new TextEncoder();
  const key2 = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key2, enc.encode(`v0:${ts}:${raw}`)));
  const hex = "v0=" + [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== sig.length) return false;
  let diff2 = 0;
  for (let i = 0; i < hex.length; i++) diff2 |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff2 === 0;
}
var cut = (s, n) => s && s.length > n ? s.slice(0, n - 1) + "\u2026" : s || "";
var pt = (text) => ({ type: "plain_text", text: cut(text, 75), emoji: true });
var md = (text) => ({ type: "mrkdwn", text: cut(text, 2900) });
var link = (ctx, path) => ctx.appUrl ? `${ctx.appUrl.replace(/\/$/, "")}/#${path}` : null;
var chain = Promise.resolve();
var withLock = (fn) => {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {
  });
  return p;
};
async function loadState(ctx) {
  useClient(ctx.client);
  clock.offset = 0;
  return loadAll();
}
function runAs(ctx, fn) {
  return withLock(async () => {
    const s = await loadState(ctx);
    if (!s) return { error: "HB+ Tasks has not been set up yet." };
    const r = fn(s);
    if (r && r.error) return r;
    await saveNow(s);
    return { ...r || {}, ok: true, s };
  });
}
async function slackIdFor(ctx, user) {
  const { data } = await ctx.client.from("slack_users").select("*").eq("user_id", user.id).maybeSingle();
  if (data && (data.email || "").toLowerCase() === user.email.toLowerCase() && (data.slack_id || Date.now() - Date.parse(data.checked_at) < 864e5)) return data.slack_id;
  const r = await ctx.slack("users.lookupByEmail", { email: user.email }, true);
  const sid = r.ok ? r.user.id : null;
  await ctx.client.from("slack_users").upsert({ user_id: user.id, slack_id: sid, email: user.email.toLowerCase(), checked_at: (/* @__PURE__ */ new Date()).toISOString() });
  return sid;
}
async function hbUserForSlack(ctx, slackId) {
  const { data, error } = await ctx.client.from("slack_users").select("*").eq("slack_id", slackId).maybeSingle();
  if (error) throw new Error(`database (slack_users): ${error.message}`);
  if (data) return data.user_id;
  const r = await ctx.slack("users.info", { user: slackId }, true);
  const email = r.ok ? (r.user?.profile?.email || "").toLowerCase() : "";
  console.log("hb-slack: Slack user", slackId, "email", email || `(none \u2014 ${r.error || "email hidden; check the users:read.email scope"})`);
  if (!email) return null;
  const { data: u, error: e2 } = await ctx.client.from("users").select("*").eq("email", email).maybeSingle();
  if (e2) throw new Error(`database (users): ${e2.message}`);
  if (!u || u.status === "inactive") return null;
  await ctx.client.from("slack_users").upsert({ user_id: u.id, slack_id: slackId, email, checked_at: (/* @__PURE__ */ new Date()).toISOString() });
  return u.id;
}
var BTN = {
  accept: ["Accept", "primary"],
  decline: ["Decline"],
  update: ["Update progress"],
  extension: ["Request extension"],
  block: ["I'm blocked"],
  submit: ["Submit", "primary"],
  review: ["Review", "primary"],
  unblock: ["Unblock", "primary"],
  approve: ["Approve", "primary"],
  reject: ["Reject", "danger"]
};
function dmBlocks(ctx, n, title) {
  const blocks = [{ type: "section", text: md(n.message) }];
  const els = [];
  for (const key2 of n.buttons || []) {
    if (key2 === "open") {
      const url2 = link(ctx, n.item_id ? `/task/${n.item_id}` : n.approval_id ? "/approvals" : "/sow");
      if (url2) els.push({ type: "button", action_id: "open_link", text: pt("Open in app"), url: url2 });
    } else if (key2 === "sow") {
      els.push({ type: "button", action_id: "sow_fill", text: pt("Fill SOW"), style: "primary", value: "{}" });
      const url2 = link(ctx, "/sow?eod=1");
      if (url2) els.push({ type: "button", action_id: "sow_link", text: pt("Open in app"), url: url2 });
    } else if (BTN[key2]) {
      const [label, style] = BTN[key2];
      els.push({ type: "button", action_id: key2, text: pt(label), ...style ? { style } : {}, value: JSON.stringify({ n: n.id, i: n.item_id, a: n.approval_id, t: cut(title || "", 60) }) });
    }
  }
  if (els.length) blocks.push({ type: "actions", block_id: "hb_buttons", elements: els.slice(0, 25) });
  return blocks;
}
var plain = (t) => (t || "").replace(/\*/g, "");
async function deliver(ctx, { publishHome = false } = {}) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const since = new Date(Date.now() - 2 * 864e5).toISOString();
  const notes = (await ctx.client.from("notifications").select("*").lte("deliver_at", nowIso).gte("created_at", since).order("created_at").range(0, 499)).data || [];
  const posts = (await ctx.client.from("channel_posts").select("*").gte("created_at", since).order("created_at").range(0, 99)).data || [];
  const ids = [...notes.map((n) => n.id), ...posts.map((p) => `post:${p.id}`)];
  if (!ids.length) return { sent: 0 };
  const done = (await ctx.client.from("slack_deliveries").select("id").in("id", ids)).data || [];
  const doneSet = new Set(done.map((d) => d.id));
  const record = (rows2) => rows2.length ? ctx.client.from("slack_deliveries").upsert(rows2.map((r) => ({ sent_at: nowIso, ...r }))) : null;
  const anyRow = (await ctx.client.from("slack_deliveries").select("id").range(0, 0)).data || [];
  if (!anyRow.length) {
    await record(ids.map((id) => ({ id, kind: "skipped" })));
    return { backfilled: ids.length };
  }
  const todo = notes.filter((n) => !doneSet.has(n.id));
  const userIds = [...new Set(todo.map((n) => n.user_id))];
  const users = userIds.length ? (await ctx.client.from("users").select("*").in("id", userIds)).data || [] : [];
  const userMap = new Map(users.map((u) => [u.id, u]));
  const itemIds = [...new Set(todo.map((n) => n.item_id).filter(Boolean))];
  const items = itemIds.length ? (await ctx.client.from("work_items").select("*").in("id", itemIds)).data || [] : [];
  const titles = new Map(items.map((i) => [i.id, i.title]));
  const sidCache = /* @__PURE__ */ new Map();
  const sidOf = async (uid2) => {
    if (!sidCache.has(uid2)) {
      const u = userMap.get(uid2);
      sidCache.set(uid2, u && u.status !== "inactive" ? await slackIdFor(ctx, u) : null);
    }
    return sidCache.get(uid2);
  };
  let sent = 0;
  const rows = [];
  for (const n of todo.filter((x) => x.mode !== "digest")) {
    const sid = await sidOf(n.user_id);
    if (!sid) {
      rows.push({ id: n.id, kind: "skipped", user_id: n.user_id });
      continue;
    }
    const r = await ctx.slack("chat.postMessage", { channel: sid, text: plain(n.message), blocks: dmBlocks(ctx, n, titles.get(n.item_id)), unfurl_links: false });
    if (r.ok) {
      sent++;
      rows.push({ id: n.id, kind: "dm", user_id: n.user_id, slack_channel: r.channel, slack_ts: r.ts });
    }
  }
  const digests = {};
  for (const n of todo.filter((x) => x.mode === "digest")) (digests[n.user_id] = digests[n.user_id] || []).push(n);
  for (const [uid2, list] of Object.entries(digests)) {
    const sid = await sidOf(uid2);
    if (!sid) {
      list.forEach((n) => rows.push({ id: n.id, kind: "skipped", user_id: uid2 }));
      continue;
    }
    const lines = list.slice(0, 30).map((n) => `\u2022 ${n.message}`).join("\n");
    const more = list.length > 30 ? `
\u2026and ${list.length - 30} more in the app.` : "";
    const url2 = link(ctx, "/tasks");
    const blocks = [{ type: "header", text: pt("Your evening digest \u{1F307}") }, { type: "section", text: md(lines + more) }];
    if (url2) blocks.push({ type: "actions", elements: [{ type: "button", action_id: "open_link", text: pt("Open HB+ Tasks"), url: url2 }] });
    const r = await ctx.slack("chat.postMessage", { channel: sid, text: `Your evening digest (${list.length} updates)`, blocks, unfurl_links: false });
    if (r.ok) sent++;
    list.forEach((n) => rows.push({ id: n.id, kind: r.ok ? "digest" : "skipped", user_id: uid2, slack_channel: r.channel, slack_ts: r.ts }));
  }
  for (const p of posts.filter((x) => !doneSet.has(`post:${x.id}`))) {
    const channel = (p.channel === "credits" ? COMPANY.creditsChannel : COMPANY.announceChannel).replace(/^#/, "");
    const r = await ctx.slack("chat.postMessage", { channel, text: p.message });
    if (r.ok) sent++;
    rows.push({ id: `post:${p.id}`, kind: r.ok ? "channel" : "skipped", slack_channel: r.channel, slack_ts: r.ts });
  }
  await record(rows);
  const homes = publishHome ? await publishHomes(ctx) : 0;
  return { sent, recorded: rows.length, homes };
}
function homeView(ctx, s, uid2) {
  const top = todaysTop3(s, uid2).ids.map((id) => itemById(s, id)).filter(Boolean);
  const waiting = s.items.filter((i) => i.status === "awaiting" && i.ownerId === uid2 && !i.declined || i.status === "in_review" && i.reviewerId === uid2 || i.status === "blocked" && i.blockedBy === uid2).length + approvalsFor(s, uid2).length;
  const blocks = [
    { type: "header", text: pt(`Hi ${firstName(s, uid2)} \u{1F33F}`) },
    { type: "section", text: md(`*Today's top 3*`) }
  ];
  if (!top.length) blocks.push({ type: "context", elements: [md("Nothing planned yet \u2014 pick your top 3 in tonight\u2019s SOW.")] });
  top.forEach((i, n) => {
    const f2 = flagsOf(s, i);
    const flag = f2.overdue ? " \xB7 \u26A0\uFE0F overdue" : f2.atRisk ? " \xB7 at-risk" : "";
    const url2 = link(ctx, `/task/${i.id}`);
    blocks.push({
      type: "section",
      text: md(`*${n + 1}. ${i.title}*
${i.key} \xB7 due ${dueLabel(i.currentDeadline)}${flag}`),
      ...url2 ? { accessory: { type: "button", action_id: `home_open_${n}`, text: pt("Open"), url: url2 } } : {}
    });
  });
  blocks.push({ type: "divider" }, { type: "section", text: md(`*Waiting on you:* ${waiting}`) });
  const els = [];
  const appUrl = link(ctx, "/sow");
  els.push({ type: "button", action_id: "sow_fill", text: pt("Fill SOW"), style: "primary", value: "{}" });
  if (appUrl) els.push({ type: "button", action_id: "home_app", text: pt("Open HB+ Tasks"), url: appUrl });
  if (els.length) blocks.push({ type: "actions", elements: els });
  blocks.push({ type: "context", elements: [md(`Updated ${fmtDT(now())} IST \xB7 /task to add a task`)] });
  return { type: "home", blocks };
}
async function publishHomes(ctx) {
  const s = await withLock(() => loadState(ctx));
  if (!s) return 0;
  let n = 0;
  for (const u of activeUsers(s)) {
    const sid = await slackIdFor(ctx, u);
    if (!sid) continue;
    const r = await ctx.slack("views.publish", { user_id: sid, view: homeView(ctx, s, u.id) });
    if (r.ok) n++;
  }
  return n;
}
var TITLE = { accept: "Accept task", decline: "Decline task", update: "Update progress", extension: "Request extension", block: "I'm blocked", submit: "Submit for review", review: "Review", unblock: "Unblock", approve: "Approve", reject: "Reject" };
var opt = (text, value) => ({ text: pt(text), value: String(value) });
var input = (block_id, label, element, optional = false, hint) => ({ type: "input", block_id, label: pt(label), element: { action_id: "v", ...element }, optional, ...hint ? { hint: pt(hint) } : {} });
function actionModal(key2, v, meta) {
  const blocks = [{ type: "context", elements: [md(`*${v.t || "Task"}*`)] }];
  if (key2 === "update") blocks.push(input("stage", "Stage", { type: "static_select", options: [opt("Started \xB7 25%", 25), opt("Halfway \xB7 50%", 50), opt("Almost done \xB7 75%", 75)] }, true, "Checklist tasks: tick items in the app."));
  if (key2 === "extension") {
    blocks.push(input("date", "New deadline", { type: "datepicker", initial_date: dateKey(addDays(now(), 2)) }));
    blocks.push(input("time", "Time (IST)", { type: "timepicker", initial_time: "18:30" }, true));
  }
  if (key2 === "block") blocks.push(input("blocker", "Blocked by", { type: "users_select" }));
  if (key2 === "submit") blocks.push(input("proof", "Proof link", { type: "plain_text_input", placeholder: pt("https://\u2026") }, false, "Google Doc, Drive, Canva\u2026 \u2014 no uploads, just the link."));
  if (key2 === "review") {
    blocks.push(input("decision", "Decision", { type: "radio_buttons", options: [opt("Accept", "accept"), opt("Send back", "send_back")], initial_option: opt("Accept", "accept") }));
    blocks.push(input("rating", "Quality (if accepting)", { type: "static_select", options: [opt("\u2605 Below standard", 1), opt("\u2605\u2605 As expected", 2), opt("\u2605\u2605\u2605 Exceptional", 3)], initial_option: opt("\u2605\u2605 As expected", 2) }, true, "A reason is needed for \u2605 and \u2605\u2605\u2605."));
  }
  blocks.push(input("comment", "Comment", { type: "plain_text_input", multiline: true }, false, "Every action needs a short comment."));
  return {
    type: "modal",
    callback_id: "hb_action",
    private_metadata: JSON.stringify({ key: key2, v, ...meta }),
    title: pt(TITLE[key2] || "HB+ Tasks"),
    submit: pt(key2 === "reject" ? "Reject" : key2 === "decline" ? "Decline" : "Save"),
    close: pt("Cancel"),
    blocks
  };
}
var infoModal = (title, text) => ({ type: "modal", title: pt(title), close: pt("Close"), blocks: [{ type: "section", text: md(text) }] });
function readValues(values = {}) {
  const out = {};
  for (const [block, acts] of Object.entries(values)) {
    const a = acts.v || Object.values(acts)[0] || {};
    out[block] = a.selected_option?.value ?? a.selected_date ?? a.selected_time ?? a.selected_user ?? a.value ?? null;
  }
  return out;
}
var ENGINE = { accept: "accept", decline: "decline", update: "update", submit: "submit", review: "review", unblock: "unblock", extension: "request_extension", block: "block" };
var DONE_LABEL = { accept: "Accepted", decline: "Declined", update: "Progress updated", submit: "Marked complete \u2014 sent for review", review: "Reviewed", unblock: "Unblocked", extension: "Extension requested", block: "Marked blocked", approve: "Approved", reject: "Rejected" };
function findApproval(s, uid2, v) {
  if (v.a) return s.approvals.find((a) => a.id === v.a);
  return s.approvals.find((a) => a.itemId === v.i && a.status === "pending" && canDecide(s, uid2, a));
}
function stillAllowed(s, uid2, key2, v) {
  if (key2 === "approve" || key2 === "reject") {
    const ap = findApproval(s, uid2, v);
    return !!ap && canDecide(s, uid2, ap);
  }
  const item = itemById(s, v.i);
  return !!item && allowedActions(s, uid2, item).includes(ENGINE[key2]);
}
function whoDidIt(s, v) {
  const ap = v.a && s.approvals.find((a) => a.id === v.a);
  if (ap && ap.decidedBy) return firstName(s, ap.decidedBy);
  const last2 = s.activity.filter((a) => a.itemId === v.i && a.userId).sort((a, b) => b.ts - a.ts)[0];
  return last2 ? firstName(s, last2.userId) : "someone";
}
async function markMessage(ctx, meta, text) {
  if (!meta.channel || !meta.ts) return;
  const { data } = await ctx.client.from("slack_deliveries").select("*").eq("slack_ts", meta.ts).maybeSingle();
  const note = data ? (await ctx.client.from("notifications").select("*").eq("id", data.id).maybeSingle()).data : null;
  const blocks = [{ type: "section", text: md(note?.message || " ") }, { type: "context", elements: [md(text)] }];
  await ctx.slack("chat.update", { channel: meta.channel, ts: meta.ts, text: plain(note?.message || text), blocks });
}
async function dm(ctx, slackUser, text) {
  await ctx.slack("chat.postMessage", { channel: slackUser, text });
}
var safely = (ctx, slackUser, what, fn) => Promise.resolve().then(fn).catch(async (e) => {
  console.error(`hb-slack: ${what} failed`, e);
  try {
    await dm(ctx, slackUser, `Sorry \u2014 something went wrong while ${what}: ${e?.message || e}. Nothing was saved. Please try again, or use the app.`);
  } catch (e2) {
    console.error("hb-slack: could not send the error DM", e2);
  }
});
async function staleCheck(ctx, slackUser, key2, v, viewId, meta) {
  const s = await withLock(() => loadState(ctx));
  if (!s) return;
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) {
    if (viewId) await ctx.slack("views.update", { view_id: viewId, view: infoModal("HB+ Tasks", "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.") });
    return;
  }
  if (stillAllowed(s, uid2, key2, v)) return;
  const who = whoDidIt(s, v);
  if (viewId) await ctx.slack("views.update", { view_id: viewId, view: infoModal("Already done", `This is already done by *${who}* \u2014 nothing more needed here.`) });
  await markMessage(ctx, meta, `\u2714\uFE0F Already done by ${who}`);
}
async function runAction(ctx, slackUser, meta, vals) {
  const { key: key2, v } = meta;
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  let blockedBy = null;
  if (key2 === "block" && vals.blocker) blockedBy = await hbUserForSlack(ctx, vals.blocker);
  if (key2 === "block" && !blockedBy) return dm(ctx, slackUser, "That person isn't on HB+ Tasks yet, so I couldn't mark the task blocked.");
  const comment = (vals.comment || "").trim();
  const r = await runAs(ctx, (s) => {
    if (!stillAllowed(s, uid2, key2, v)) return { error: `Already done by ${whoDidIt(s, v)}.` };
    if (key2 === "approve" || key2 === "reject") return decideApproval(s, uid2, findApproval(s, uid2, v).id, key2 === "approve", comment);
    const payload = { comment };
    if (key2 === "update" && vals.stage) payload.stage = +vals.stage;
    if (key2 === "extension") payload.newDeadline = atTime(vals.date, vals.time || P(s, "defaultDeadlineTime"));
    if (key2 === "block") payload.blockedBy = blockedBy;
    if (key2 === "submit") payload.proofLink = (vals.proof || "").trim();
    if (key2 === "review") {
      payload.decision = vals.decision || "accept";
      payload.rating = +(vals.rating || 2);
    }
    return perform(s, uid2, v.i, ENGINE[key2], payload);
  });
  if (r.error) {
    await dm(ctx, slackUser, `Couldn't save that on *${v.t || "the task"}*: ${r.error}`);
    if (/^Already done/.test(r.error)) await markMessage(ctx, meta, `\u2714\uFE0F ${r.error}`);
    return r;
  }
  await markMessage(ctx, meta, `\u2705 ${DONE_LABEL[key2] || "Done"} by you \u2014 \u201C${cut(comment, 120)}\u201D`);
  if (!meta.ts) {
    const it = itemById(r.s, v.i);
    const extra = key2 === "submit" && it ? ` ${firstName(r.s, it.reviewerId)} will review it.` : "";
    await dm(ctx, slackUser, `\u2705 ${DONE_LABEL[key2] || "Done"} \u2014 *${v.t}*.${extra}`);
  }
  return r;
}
var NEW_TYPES = [["task", "Task"], ["subtask", "Sub-task"], ["project", "Project"], ["stream", "Stream"], ["recurring", "Recurring task"]];
var PM_OPTS = [["stages", "Stages"], ["checklist", "Checklist"], ["subtasks", "Sub-tasks"]];
var CYCLES = [["weekly", "Weekly"], ["fortnightly", "Fortnightly"], ["monthly", "Monthly"], ["quarterly", "Quarterly"]];
var NEW_SIZE = [opt("S \xB7 \u22642 days", "S"), opt("M \xB7 3\u201310 days", "M"), opt("L \xB7 >10 days", "L")];
var NEW_IMPACT = [opt("1 \xB7 Low", 1), opt("3 \xB7 Medium", 3), opt("5 \xB7 Critical", 5)];
var KPI_MAX = 4;
var pick = (list, v) => list.find((o) => o.value === String(v));
var opts = (pairs) => pairs.map(([v, l]) => opt(l, v));
var dated = (t) => ["task", "subtask", "project"].includes(t);
var hasPM = (t) => ["task", "subtask", "recurring"].includes(t);
function newDefaults({ invoker, title = "", desc = "" } = {}) {
  return {
    type: "task",
    title: cut(title, 150),
    desc: cut(desc, 2900),
    owner: invoker || null,
    vertical: null,
    date: dateKey(addDays(now(), 3)),
    time: null,
    parent: null,
    projKey: "",
    size: "M",
    impact: "3",
    reason: "",
    est: "",
    pm: "stages",
    checklist: "",
    freq: "weekly",
    every: "7",
    first: dateKey(now()),
    dueAfter: "5",
    cycle: "monthly",
    kpis: [{ name: "", dir: ">=", target: "", unit: "", src: "manual" }],
    links: "",
    contributors: [],
    goals: [],
    flags: []
  };
}
function readNewForm(values = {}, base = newDefaults()) {
  const el = (b) => {
    const key2 = b in values ? b : Object.keys(values).find((k) => k.startsWith(`${b}.`));
    return key2 ? values[key2].v || Object.values(values[key2])[0] || {} : null;
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
  const f2 = { ...base };
  for (const k of ["type", "title", "desc", "owner", "vertical", "date", "time", "parent", "projKey", "size", "impact", "reason", "est", "pm", "checklist", "freq", "every", "first", "dueAfter", "cycle", "links"]) f2[k] = one(k, base[k]);
  for (const k of ["contributors", "goals", "flags"]) f2[k] = many(k, base[k]);
  f2.type = f2.type || "task";
  const n = Math.max(1, base.kpis?.length || 1);
  f2.kpis = Array.from({ length: n }, (_, i) => {
    const b = base.kpis?.[i] || { dir: ">=", src: "manual" };
    return { name: one(`k${i}_name`, b.name) || "", dir: one(`k${i}_dir`, b.dir) || ">=", target: one(`k${i}_target`, b.target) || "", unit: one(`k${i}_unit`, b.unit) || "", src: one(`k${i}_src`, b.src) || "manual" };
  });
  return f2;
}
function newFormInfo(s, creatorId, ownerId, f2) {
  const owner = ownerId && userById(s, ownerId);
  const vertical = f2.vertical || owner?.verticals.find((v) => v.main)?.vid || owner?.verticals[0]?.vid;
  const parents = ["task", "subtask"].includes(f2.type) ? s.items.filter((i) => !DONE.includes(i.status) && (f2.type === "subtask" ? i.type === "task" : ["project", "cycle"].includes(i.type)) && canSeeFull(s, creatorId, i)).sort((a, b) => (a.currentDeadline || Infinity) - (b.currentDeadline || Infinity)).slice(0, 99).map((i) => ({ id: i.id, label: `${i.key} \xB7 ${i.title}` })) : [];
  const hints = [];
  if (owner) {
    const deadline = dated(f2.type) && f2.date ? atTime(f2.date, f2.time || P(s, "defaultDeadlineTime")) : null;
    const extra = +f2.est || SIZE_HOURS[f2.size] || 16;
    const pct = loadFor(s, owner.id, startOfWeek(deadline || now())) + Math.round(extra / ((owner.hours || 9) * 6 * 0.8) * 100);
    if (f2.type !== "stream") hints.push(`${pct > 100 ? "\u{1F534}" : pct >= 80 ? "\u{1F7E0}" : "\u{1F7E2}"} ${firstName(s, owner.id)} at ${pct}% load that week with this task.${pct > 100 ? " Their manager will be told \u2014 consider another owner or date." : ""}`);
    if (owner.id !== creatorId && P(s, "crossVerticalApproval") && !sharesVertical(s, creatorId, owner.id) && !isFounder(s, creatorId)) {
      hints.push(`Needs ${firstName(s, managerOf(s, owner.id, vertical))}'s approval \u2014 different vertical.`);
    }
    if (owner.id === creatorId && !isFounder(s, creatorId)) hints.push(`Self-created: ${firstName(s, managerOf(s, creatorId, vertical))} will review it and confirm size & impact.`);
  }
  const pts = potentialPoints(s, { size: f2.size, impact: +f2.impact });
  const goals = owner ? s.goals.filter((g) => g.userId === owner.id && g.status === "active" && (owner.id === creatorId || !g.private)).slice(0, 100) : [];
  return {
    verticals: s.verticals.map((v) => ({ id: v.id, label: v.name })),
    defaultVertical: vertical,
    parents,
    goals: goals.map((g) => ({ id: g.id, label: `${g.title} \xB7 ${GOAL_LABEL[g.type]}` })),
    hints,
    points: `Worth ${pts.base} base points \xB7 up to ${pts.max} if early with 3\u2605`,
    pinOk: !!owner && (isFounder(s, creatorId) || isAbove(s, creatorId, owner.id)),
    defaultTime: P(s, "defaultDeadlineTime")
  };
}
function newTaskView(f2, info, meta = {}) {
  const t = f2.type;
  const blocks = [];
  if (meta.err) blocks.push({ type: "section", text: md(`\u26A0\uFE0F *Couldn't create it:* ${meta.err}`) });
  const iv = (v) => v ? { initial_value: String(v) } : {};
  blocks.push({ type: "input", block_id: "type", dispatch_action: true, label: pt("What are you creating?"), element: { type: "radio_buttons", action_id: "v", options: opts(NEW_TYPES), initial_option: pick(opts(NEW_TYPES), t) } });
  blocks.push(input("title", "Title", { type: "plain_text_input", placeholder: pt("What needs to be done?"), ...iv(f2.title) }));
  blocks.push({ type: "input", block_id: "owner", dispatch_action: true, label: pt("Owner (one person, accountable)"), element: { type: "users_select", action_id: "v", ...f2.owner ? { initial_user: f2.owner } : {} } });
  const vOpts = info.verticals.map((v) => opt(v.label, v.id));
  const vInit = pick(vOpts, f2.vertical || info.defaultVertical);
  if (vOpts.length) blocks.push(input(`vertical.${f2.owner || ""}`, "Vertical", { type: "static_select", options: vOpts, ...vInit ? { initial_option: vInit } : {} }, true, "Defaults to the owner's main vertical"));
  if (dated(t)) {
    blocks.push(input("date", "Deadline (IST)", { type: "datepicker", ...f2.date ? { initial_date: f2.date } : {} }));
    blocks.push(input("time", "Time (IST)", { type: "timepicker", initial_time: f2.time || info.defaultTime || "18:30" }, true));
  }
  if (t === "task" || t === "subtask") {
    const pOpts = info.parents.map((p) => opt(p.label, p.id));
    if (t === "subtask") pOpts.unshift(opt("Not applicable \u2014 no main task", "none"));
    const pInit = pick(pOpts, f2.parent);
    const label = t === "subtask" ? "Parent task" : "Project / cycle";
    const hint = t === "subtask" ? info.parents.length ? 'The main task this sits under. "Not applicable" saves it as a normal task.' : 'No open tasks yet \u2014 choose "Not applicable" to save it as a normal task.' : void 0;
    if (pOpts.length) blocks.push(input(`parent.${t}`, label, { type: "static_select", options: pOpts.slice(0, 100), placeholder: pt(t === "subtask" ? "Choose a task" : "None"), ...pInit ? { initial_option: pInit } : {} }, t !== "subtask", hint));
    else blocks.push({ type: "context", elements: [md("_No open projects or cycles \u2014 this will be a standalone task._")] });
  }
  if (t === "project" || t === "stream") blocks.push(input("projKey", "Key prefix", { type: "plain_text_input", max_length: 4, ...iv(f2.projKey) }, true, "e.g. DIW \u2192 task IDs DIW-01, DIW-02\u2026"));
  blocks.push(input("size", "Size", { type: "static_select", options: NEW_SIZE, initial_option: pick(NEW_SIZE, f2.size) || NEW_SIZE[1] }));
  blocks.push(input("impact", "Impact", { type: "static_select", options: NEW_IMPACT, initial_option: pick(NEW_IMPACT, f2.impact) || NEW_IMPACT[1] }));
  blocks.push(input("reason", "Why this impact? (one line)", { type: "plain_text_input", placeholder: pt("e.g. client safety, revenue, launch\u2026"), ...iv(f2.reason) }, false, info.points));
  if (t !== "stream") blocks.push(input("est", "Estimated hours", { type: "number_input", is_decimal_allowed: false, min_value: "1", ...iv(f2.est) }, true, "Leave empty to use the size (S=4, M=16, L=40)"));
  if (hasPM(t)) {
    blocks.push({ type: "input", block_id: "pm", dispatch_action: true, label: pt("Progress method"), element: { type: "radio_buttons", action_id: "v", options: opts(PM_OPTS), initial_option: pick(opts(PM_OPTS), f2.pm) || opts(PM_OPTS)[0] } });
    if (f2.pm === "checklist") blocks.push(input("checklist", "Checklist (one item per line)", { type: "plain_text_input", multiline: true, ...iv(f2.checklist) }));
  }
  if (t === "recurring") {
    const fOpts = opts(Object.entries(FREQ_LABEL));
    blocks.push({ type: "input", block_id: "freq", dispatch_action: true, label: pt("Repeats"), element: { type: "static_select", action_id: "v", options: fOpts, initial_option: pick(fOpts, f2.freq) || fOpts[1] } });
    if (f2.freq === "custom") blocks.push(input("every", "Every N days", { type: "number_input", is_decimal_allowed: false, min_value: "1", ...iv(f2.every) }));
    blocks.push(input("first", "First occurrence on", { type: "datepicker", ...f2.first ? { initial_date: f2.first } : {} }));
    blocks.push(input("dueAfter", "Each one is due after (days)", { type: "number_input", is_decimal_allowed: false, min_value: "0", ...iv(f2.dueAfter) }, true, "At the default deadline time"));
  }
  if (t === "stream") {
    blocks.push(input("cycle", "Cycle length", { type: "static_select", options: opts(CYCLES), initial_option: pick(opts(CYCLES), f2.cycle) || opts(CYCLES)[2] }));
    blocks.push({ type: "section", text: md("*KPIs* (at least one) \u2014 actuals are entered every Saturday with a source link; the manager verifies at cycle end.") });
    const dirs = [opt("\u2265 at least", ">="), opt("\u2264 at most", "<=")];
    const srcs = opts(KPI_SOURCES);
    f2.kpis.forEach((k, i) => {
      blocks.push({ type: "divider" });
      blocks.push(input(`k${i}_name`, `KPI ${i + 1} name`, { type: "plain_text_input", placeholder: pt("e.g. Leads"), ...iv(k.name) }, i > 0));
      blocks.push(input(`k${i}_dir`, "Direction", { type: "static_select", options: dirs, initial_option: pick(dirs, k.dir) || dirs[0] }, true));
      blocks.push(input(`k${i}_target`, "Target", { type: "number_input", is_decimal_allowed: true, ...iv(k.target) }, i > 0));
      blocks.push(input(`k${i}_unit`, "Unit", { type: "plain_text_input", placeholder: pt("e.g. \u20B9, %, leads"), ...iv(k.unit) }, true));
      blocks.push(input(`k${i}_src`, "Where the number comes from", { type: "static_select", options: srcs, initial_option: pick(srcs, k.src) || srcs[0] }, true));
    });
    if (f2.kpis.length < KPI_MAX) blocks.push({ type: "actions", block_id: "kpi_more", elements: [{ type: "button", action_id: "kpi_more", text: pt("+ KPI"), value: "more" }] });
    blocks.push({ type: "divider" });
  }
  blocks.push(input("desc", "Description", { type: "plain_text_input", multiline: true, placeholder: pt("What does done look like?"), ...iv(f2.desc) }, true));
  blocks.push(input("links", "Reference links", { type: "plain_text_input", multiline: true, placeholder: pt("Brief | https://docs.google.com/\u2026"), ...iv(f2.links) }, true, 'One per line \u2014 "Label | https://\u2026" or just the link. Links only, no uploads.'));
  blocks.push(input("contributors", "Contributors", { type: "multi_users_select", ...f2.contributors?.length ? { initial_users: f2.contributors } : {} }, true, "Tagged helpers. Their piece becomes a sub-task they own."));
  if (info.goals.length) {
    const gOpts = info.goals.map((g) => opt(g.label, g.id));
    const gInit = gOpts.filter((o) => (f2.goals || []).includes(o.value));
    blocks.push(input("goals", "Linked goals", { type: "multi_static_select", options: gOpts, ...gInit.length ? { initial_options: gInit } : {} }, true, "The goal page shows how many linked tasks are closed."));
  }
  const flagOpts = [opt('Private (others see only "Private task", status, deadline)', "private")];
  if (info.pinOk) flagOpts.push(opt("Pin (boosts their top-3)", "pinned"));
  const fInit = flagOpts.filter((o) => (f2.flags || []).includes(o.value));
  blocks.push(input("flags", "Options", { type: "checkboxes", options: flagOpts, ...fInit.length ? { initial_options: fInit } : {} }, true));
  if (info.hints.length) blocks.push({ type: "context", elements: [md(info.hints.join("\n"))] });
  return {
    type: "modal",
    callback_id: "hb_new",
    private_metadata: JSON.stringify({ msg: meta.msg || null, kpiN: f2.kpis.length }),
    title: pt("New"),
    submit: pt("Create"),
    close: pt("Close"),
    blocks: blocks.slice(0, 100)
  };
}
function newFormErrors(f2) {
  const e = {};
  if (!(f2.title || "").trim()) e.title = "Give it a title.";
  if (!f2.owner) e.owner = "Pick one owner.";
  if (!(f2.reason || "").trim()) e.reason = "Add a one-line reason for the impact.";
  if (dated(f2.type)) {
    if (!f2.date) e.date = "Set a deadline.";
    else if (f2.date < dateKey(now())) e.date = "Pick today or a later date.";
  }
  if (f2.type === "subtask" && !f2.parent) e[`parent.${f2.type}`] = 'Pick the main task, or "Not applicable".';
  if (hasPM(f2.type) && f2.pm === "checklist" && !(f2.checklist || "").trim()) e.checklist = "Add at least one checklist item (one per line).";
  if (f2.type === "recurring" && !f2.first) e.first = "Pick the first date.";
  if (f2.type === "stream") {
    const named = f2.kpis.filter((k) => (k.name || "").trim());
    if (!named.length) e.k0_name = "A stream needs at least one KPI.";
    f2.kpis.forEach((k, i) => {
      if ((k.name || "").trim() && (k.target === "" || isNaN(+k.target))) e[`k${i}_target`] = "Add a target number.";
    });
  }
  const bad = parseLinks(f2.links).find((l) => !/^https?:\/\/\S+\.\S+/.test(l.url));
  if (bad) e.links = `"${cut(bad.url, 40)}" isn't a link \u2014 it should start with https://`;
  return e;
}
var parseLinks = (text) => (text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
  const i = l.lastIndexOf("|");
  return i >= 0 ? { label: l.slice(0, i).trim() || "Link", url: l.slice(i + 1).trim() } : { label: "Link", url: l };
});
var formCache = { at: 0, s: null };
async function stateForForm(ctx) {
  if (formCache.s && Date.now() - formCache.at < 6e4) return formCache.s;
  const s = await withLock(() => loadState(ctx));
  formCache = { at: Date.now(), s };
  return s;
}
async function renderNewForm(ctx, slackUser, viewId, f2, meta = {}, hash) {
  const creator = await hbUserForSlack(ctx, slackUser);
  if (!creator) return ctx.slack("views.update", { view_id: viewId, view: infoModal("New", "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.") });
  const s = await stateForForm(ctx);
  if (!s) return ctx.slack("views.update", { view_id: viewId, view: infoModal("New", "HB+ Tasks has not been set up yet.") });
  const owner = f2.owner ? await hbUserForSlack(ctx, f2.owner) : null;
  const view = newTaskView(f2, newFormInfo(s, creator, owner, f2), meta);
  return ctx.slack("views.update", { view_id: viewId, ...hash ? { hash } : {}, view });
}
async function openNewForm(ctx, triggerId, slackUser, f2, meta, background) {
  const res = await ctx.slack("views.open", { trigger_id: triggerId, view: infoModal("New", "Loading the form\u2026 \u{1F33F}") });
  background(safely(ctx, slackUser, "opening the form", () => renderNewForm(ctx, slackUser, res.view?.id, f2, meta)));
}
async function runNew(ctx, slackUser, f2, meta, viewId) {
  const back = async (err2) => {
    formCache.at = 0;
    const r2 = viewId ? await renderNewForm(ctx, slackUser, viewId, f2, { ...meta, err: err2 }) : null;
    if (!r2?.ok) await dm(ctx, slackUser, `Couldn't create *${f2.title}*: ${err2}`);
  };
  const creator = await hbUserForSlack(ctx, slackUser);
  if (!creator) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const owner = await hbUserForSlack(ctx, f2.owner);
  if (!owner) return back("the owner isn't on HB+ Tasks yet (their Slack email must match their HB+ email).");
  const contributors = [];
  for (const c of f2.contributors || []) {
    const id = await hbUserForSlack(ctx, c);
    if (id && id !== owner) contributors.push(id);
  }
  const links = parseLinks(f2.links);
  if (meta.msg?.channel && meta.msg?.ts) {
    const p = await ctx.slack("chat.getPermalink", { channel: meta.msg.channel, message_ts: meta.msg.ts }, true);
    if (p.ok) links.unshift({ label: "Slack message", url: p.permalink });
  }
  let newId = null;
  let pinDropped = false;
  const r = await runAs(ctx, (s) => {
    let pinned = (f2.flags || []).includes("pinned");
    if (pinned && !(isFounder(s, creator) || isAbove(s, creator, owner))) {
      pinned = false;
      pinDropped = true;
    }
    const data = {
      type: f2.type === "recurring" ? "task" : f2.type,
      title: f2.title,
      desc: f2.desc || "",
      ownerId: owner,
      vertical: f2.vertical || null,
      deadline: dated(f2.type) ? atTime(f2.date, f2.time || P(s, "defaultDeadlineTime")) : null,
      size: f2.size,
      impact: +f2.impact,
      impactReason: f2.reason,
      estHours: f2.est || "",
      progressMethod: f2.pm || "stages",
      parentId: f2.parent || null,
      contributors,
      goalLinks: f2.goals || [],
      links,
      checklist: (f2.checklist || "").split("\n").map((x) => x.trim()).filter(Boolean),
      private: (f2.flags || []).includes("private"),
      pinned,
      cycleLength: f2.cycle,
      projKey: f2.projKey,
      kpis: f2.kpis.filter((k) => (k.name || "").trim()).map((k) => ({ name: k.name.trim(), target: +k.target, unit: k.unit || "", dir: k.dir, source: (k.src || "manual").split(":")[0], sourceMetric: k.src && k.src !== "manual" ? k.src.split(":")[1] : null }))
    };
    if (!["task", "subtask"].includes(f2.type) || f2.parent === "none") data.parentId = null;
    if (f2.type === "subtask" && f2.parent === "none") data.type = "task";
    if (f2.type === "recurring") {
      const res2 = createRecurringRule(s, creator, { ...data, freq: f2.freq, everyDays: f2.every, dueAfterDays: f2.dueAfter === "" || f2.dueAfter == null ? void 0 : f2.dueAfter, firstRun: atTime(f2.first, "09:00") });
      newId = res2?.id || null;
      return res2?.error ? res2 : { ok: true };
    }
    const res = createItem(s, creator, data);
    newId = res.id;
    return res;
  });
  if (r.error) return back(r.error);
  formCache.at = 0;
  const it = newId && itemById(r.s, newId);
  const url2 = link(ctx, newId ? `/task/${newId}` : "/tasks");
  const what = f2.type === "subtask" && f2.parent === "none" ? "Task (no main task)" : { task: "Task", subtask: "Sub-task", project: "Project", stream: "Stream", recurring: "Recurring task" }[f2.type];
  const lines = [
    f2.type === "recurring" ? `\u2705 Recurring task *${f2.title}* set up (${FREQ_LABEL[f2.freq].toLowerCase()}).${it ? ` First one: *${it.key}*, due ${fmtDT(it.currentDeadline)}.` : ` First one appears on ${fmtDate(parseKey(f2.first))}.`}` : `\u2705 ${what} *${it.key} \xB7 ${it.title}* created for ${owner === creator ? "you" : nameOf(r.s, owner)}${it.currentDeadline ? ` \u2014 due ${fmtDT(it.currentDeadline)}` : ""}.`,
    ...(r.warnings || []).map((w) => `_${w}_`),
    ...pinDropped ? ["_Not pinned \u2014 only founders and people above the owner can pin._"] : [],
    owner !== creator && it?.status === "awaiting" ? `${firstName(r.s, owner)} has been asked on Slack to accept it.` : "",
    url2 ? `<${url2}|Open in app>` : ""
  ].filter(Boolean);
  const view = { type: "modal", title: pt("Created"), close: pt("Done"), blocks: [{ type: "section", text: md(lines.join("\n")) }] };
  const u = viewId ? await ctx.slack("views.update", { view_id: viewId, view }) : null;
  if (!u?.ok) await dm(ctx, slackUser, lines.join("\n"));
  return r;
}
var NT_CODES = ["Blocked", "Re-prioritised", "Leave or health", "Underestimated", "Forgot", "Other"];
var STAGE_OPTS = [[25, "Started \xB7 25%"], [50, "Halfway \xB7 50%"], [75, "Almost done \xB7 75%"]];
function outcomesFrom(values = {}) {
  const out = {};
  for (const [block, acts] of Object.entries(values)) if (block.startsWith("o_")) out[block.slice(2)] = acts.v?.selected_option?.value || null;
  return out;
}
var trail = (n, text) => ({ type: "context", elements: [md(`*Step ${n} of 2* \xB7 ${text}`)] });
function sowStep1View(m, outcomes = {}) {
  const blocks = [trail(1, `${fmtDate(parseKey(m.day))} \xB7 one outcome per task`)];
  if (!m.items.length) blocks.push({ type: "section", text: md("Nothing to report on today \u{1F33F} \u2014 go straight to planning tomorrow.") });
  for (const it of m.items) {
    const o = outcomes[it.id];
    const opts2 = [opt(it.own ? "\u2713 Done" : "\u2713 My part done", "done"), opt("Progress", "progress"), opt("Not touched", "not_touched")];
    blocks.push({
      type: "input",
      block_id: `o_${it.id}`,
      dispatch_action: true,
      label: pt(it.t),
      element: { type: "radio_buttons", action_id: "v", options: opts2, ...o ? { initial_option: opts2.find((x) => x.value === o) } : {} }
    });
    if (o === "done" && it.own) blocks.push(input(`p_${it.id}`, "Proof link", { type: "plain_text_input", placeholder: pt("https://\u2026") }, false, "Goes to your reviewer."));
    if (o === "progress") {
      if (it.m === "stages") blocks.push(input(`s_${it.id}`, "Stage now", { type: "static_select", options: STAGE_OPTS.map(([v, l]) => opt(l, v)) }, true));
      blocks.push(input(`k_${it.id}`, "Pick it up", { type: "static_select", options: [opt("Tomorrow", "tomorrow"), opt("In 2 days", "plus2")], initial_option: opt("Tomorrow", "tomorrow") }));
    }
    if (o === "not_touched") blocks.push(input(`r_${it.id}`, "Reason", { type: "static_select", options: NT_CODES.map((c) => opt(c, c)) }));
    if (o) blocks.push(input(`c_${it.id}`, o === "not_touched" ? "Comment (required)" : "Comment (optional)", { type: "plain_text_input" }, o !== "not_touched"));
  }
  return { type: "modal", callback_id: "hb_sow_1", private_metadata: JSON.stringify(m), title: pt("How did today go?"), submit: pt("Next: plan tomorrow"), close: pt("Cancel"), blocks: blocks.slice(0, 100) };
}
function sowStep2View(m) {
  const blocks = [trail(2, `plan ${fmtDate(parseKey(m.forKey))} \u2014 suggested by impact \xD7 urgency`)];
  if (m.half) blocks.push({ type: "context", elements: [md("Tomorrow is a half-day \u2014 at least 1 task.")] });
  const cand = m.cand;
  if (!cand.length) blocks.push({ type: "section", text: md("No open tasks to plan. Submit to finish \u{1F33F}") });
  else {
    const options = cand.map((c) => opt(`${c.t}${c.o ? " \xB7 overdue" : ` \xB7 ${c.d}`}`, c.id));
    [0, 1, 2].forEach((i) => {
      const initial = options.find((o) => o.value === m.sug[i]);
      blocks.push(input(`t${i + 1}`, `#${i + 1}`, { type: "static_select", options, ...initial ? { initial_option: initial } : {} }, i > 0));
    });
    if (m.over.length) blocks.push(input("drop", "Dropping an overdue task? One line on why", { type: "plain_text_input" }, true));
  }
  return { type: "modal", callback_id: "hb_sow_2", private_metadata: JSON.stringify(m), title: pt("Plan tomorrow"), submit: pt("Submit SOW"), close: pt("Cancel"), blocks };
}
async function openSow(ctx, slackUser, viewId, msg) {
  const show = (title, text) => viewId && ctx.slack("views.update", { view_id: viewId, view: infoModal(title, text) });
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) return show("Daily SOW", "I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const s = await withLock(() => loadState(ctx));
  if (!s) return show("Daily SOW", "HB+ Tasks has not been set up yet.");
  const today = dateKey(now());
  const open = openSowDays(s, uid2);
  const day = open.length ? open[open.length - 1] : today;
  if (!sowRequired(s, uid2, day)) return show("Daily SOW", "No SOW needed today \u2014 you\u2019re off, it\u2019s a holiday or it\u2019s Sunday. Rest well \u{1F33F}");
  if (sowDayOf(s, uid2, day)?.submittedAt) {
    const url2 = link(ctx, "/sow");
    return show("Daily SOW", `Today's SOW is already in. Thank you! \u{1F33F}${url2 ? `
To change tomorrow's plan, <${url2}|open the app>.` : ""}`);
  }
  const forKey = nextWorkingKey(s, day);
  const items = eodItems(s, uid2, day).slice(0, 10);
  const at9 = atTime(forKey, "09:00");
  const m = {
    day,
    forKey,
    half: offDayOf(s, uid2, forKey)?.code === "Half-day",
    msg,
    items: items.map((i) => ({ id: i.id, t: cut(i.title, 60), own: i.ownerId === uid2, m: i.progressMethod })),
    cand: rankCandidates(s, uid2, forKey, at9).slice(0, 15).map(({ item }) => ({ id: item.id, t: cut(item.title, 34), d: dueLabel(item.currentDeadline), o: flagsOf(s, item, at9).overdue ? 1 : 0 }))
  };
  while (JSON.stringify(m).length > 2900 && m.cand.length > 3) m.cand.pop();
  await ctx.slack("views.update", { view_id: viewId, view: sowStep1View(m, {}) });
}
async function sowStep1Submit(ctx, payload) {
  const m = JSON.parse(payload.view.private_metadata || "{}");
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
      errors[`o_${it.id}`] = "Pick one.";
      continue;
    }
    const e = { itemId: it.id, outcome, comment: (val(`c_${it.id}`) || "").trim() };
    if (outcome === "done" && it.own) {
      e.proofLink = (val(`p_${it.id}`) || "").trim();
      if (!/^https?:\/\/\S+\.\S+/.test(e.proofLink)) errors[`p_${it.id}`] = "Add a link that starts with https://";
    }
    if (outcome === "progress") {
      if (val(`s_${it.id}`)) e.stage = +val(`s_${it.id}`);
      e.pickup = val(`k_${it.id}`) || "tomorrow";
    }
    if (outcome === "not_touched") {
      e.reason = val(`r_${it.id}`);
      if (!e.reason) errors[`r_${it.id}`] = "Pick a reason.";
      if (!e.comment) errors[`c_${it.id}`] = "Add a short comment.";
    }
    entries.push(e);
  }
  if (Object.keys(errors).length) return { response_action: "errors", errors };
  await ctx.client.from("slack_sow_drafts").upsert({ id: payload.view.id, user_id: payload.user.id, sow_date: m.day, entries, created_at: (/* @__PURE__ */ new Date()).toISOString() });
  const done = new Set(entries.filter((e) => e.outcome === "done").map((e) => e.itemId));
  const later = new Set(entries.filter((e) => e.outcome === "progress" && e.pickup === "plus2").map((e) => e.itemId));
  const cand = m.cand.filter((c) => !done.has(c.id) && !later.has(c.id));
  const sug = cand.slice(0, 3).map((c) => c.id);
  const m2 = { day: m.day, forKey: m.forKey, half: m.half, msg: m.msg, draft: payload.view.id, cand, sug, over: cand.filter((c) => c.o && sug.includes(c.id)).map((c) => c.id) };
  return { response_action: "update", view: sowStep2View(m2) };
}
async function sowStep2Submit(ctx, payload, background) {
  const m = JSON.parse(payload.view.private_metadata || "{}");
  const vals = readValues(payload.view.state?.values);
  const top3 = [...new Set([vals.t1, vals.t2, vals.t3].filter(Boolean))];
  const dropped = m.over.filter((id) => !top3.includes(id));
  if (m.cand.length && !top3.length) return { response_action: "errors", errors: { t1: "Pick at least one task for tomorrow." } };
  if (dropped.length && !(vals.drop || "").trim()) return { response_action: "errors", errors: { drop: "You dropped an overdue task \u2014 one line on why." } };
  background(safely(ctx, payload.user.id, "saving your SOW", () => finishSow(ctx, payload.user.id, m, top3, dropped, (vals.drop || "").trim())));
  return null;
}
async function finishSow(ctx, slackUser, m, top3, dropped, dropNote) {
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks.");
  const { data: draft } = await ctx.client.from("slack_sow_drafts").select("*").eq("id", m.draft).maybeSingle();
  const raw = draft?.entries || [];
  const r = await runAs(ctx, (s) => {
    const next = nextWorkingKey(s, m.day);
    const entries = raw.map((e) => ({
      ...e,
      pickupDate: e.outcome === "progress" ? e.pickup === "plus2" ? nextWorkingKey(s, next) : next : null
    }));
    return submitSOW(s, uid2, m.day, entries, { forKey: m.forKey, top3, droppedOverdue: dropped, dropReasons: Object.fromEntries(dropped.map((id) => [id, dropNote])) });
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't save your SOW: ${r.error} Try again from the app or the Fill SOW button.`);
  await ctx.client.from("slack_sow_drafts").delete().eq("id", m.draft);
  const label = r.status === "on_time" ? "on time \u{1F33F}" : r.status === "late" ? "late (no penalty \u2014 streak restarts)" : "logged";
  const plan = top3.map((id, i) => `${i + 1}. ${itemById(r.s, id)?.title}`).join("\n");
  await dm(ctx, slackUser, `\u2705 SOW for ${fmtDate(parseKey(m.day))} \u2014 ${label}.${plan ? `
*${fmtDate(parseKey(m.forKey))}'s top 3:*
${plan}` : ""}`);
  if (m.msg) await markMessage(ctx, m.msg, `\u2705 SOW logged ${r.status === "on_time" ? "on time" : r.status === "late" ? "late" : ""}`);
  return r;
}
async function handleInteraction(ctx, payload, background) {
  if (payload.type === "block_actions" && payload.actions?.[0]?.action_id === "sow_fill") {
    const meta = { channel: payload.container?.channel_id || payload.channel?.id, ts: payload.container?.message_ts || payload.message?.ts };
    const res = await ctx.slack("views.open", { trigger_id: payload.trigger_id, view: infoModal("Daily SOW", "Loading your day\u2026 \u{1F33F}") });
    background(safely(ctx, payload.user.id, "opening your SOW", () => openSow(ctx, payload.user.id, res.view?.id, meta)));
    return null;
  }
  if (payload.type === "block_actions" && payload.view?.callback_id === "hb_sow_1") {
    const m = JSON.parse(payload.view.private_metadata || "{}");
    await ctx.slack("views.update", { view_id: payload.view.id, hash: payload.view.hash, view: sowStep1View(m, outcomesFrom(payload.view.state?.values)) });
    return null;
  }
  if (payload.type === "block_actions" && payload.view?.callback_id === "hb_card") {
    const act = payload.actions?.[0];
    if (!act?.value) return null;
    const v = JSON.parse(act.value);
    const view = act.action_id === "reassign" ? reassignModal(v) : BTN[act.action_id] ? actionModal(act.action_id, v, { fromCard: true }) : null;
    if (view) await ctx.slack("views.push", { trigger_id: payload.trigger_id, view });
    return null;
  }
  if (payload.type === "view_submission" && payload.view.callback_id === "hb_reassign") {
    const vals = readValues(payload.view.state.values);
    if (!vals.person) return { response_action: "errors", errors: { person: "Pick a person." } };
    if (vals.person === payload.user.id && vals.mode === "assignee") return { response_action: "errors", errors: { person: "You can't hand a part to yourself." } };
    background(safely(ctx, payload.user.id, "reassigning the task", () => runReassign(ctx, payload.user.id, JSON.parse(payload.view.private_metadata), vals)));
    return { response_action: "clear" };
  }
  if (payload.type === "block_actions" && payload.view?.callback_id === "hb_bulk" && payload.actions?.[0]?.action_id === "bulk_more") {
    const m = JSON.parse(payload.view.private_metadata || "{}");
    await ctx.slack("views.update", { view_id: payload.view.id, hash: payload.view.hash, view: bulkModal({ invoker: m.invoker, count: (m.count || 3) + 1 }) });
    return null;
  }
  if (payload.type === "view_submission" && payload.view.callback_id === "hb_bulk") {
    const m = JSON.parse(payload.view.private_metadata || "{}");
    const { rows, errors } = bulkRows(payload.view.state.values, m.count || 3);
    if (Object.keys(errors).length) return { response_action: "errors", errors };
    background(safely(ctx, payload.user.id, "creating the tasks", () => runBulk(ctx, payload.user.id, rows)));
    return null;
  }
  if (payload.type === "block_actions" && payload.view?.callback_id === "hb_new") {
    const m = JSON.parse(payload.view.private_metadata || "{}");
    const f2 = readNewForm(payload.view.state?.values, { ...newDefaults(), kpis: Array.from({ length: m.kpiN || 1 }, () => ({ dir: ">=", src: "manual" })) });
    const changed = payload.actions?.[0]?.block_id;
    if (changed === "owner") f2.vertical = null;
    if (changed === "type") f2.parent = null;
    if (payload.actions?.[0]?.action_id === "kpi_more" && f2.kpis.length < KPI_MAX) f2.kpis.push({ name: "", dir: ">=", target: "", unit: "", src: "manual" });
    background(safely(ctx, payload.user.id, "updating the form", () => renderNewForm(ctx, payload.user.id, payload.view.id, f2, { msg: m.msg }, payload.view.hash)));
    return null;
  }
  if (payload.type === "view_submission" && payload.view.callback_id === "hb_sow_1") return sowStep1Submit(ctx, payload);
  if (payload.type === "view_submission" && payload.view.callback_id === "hb_sow_2") return sowStep2Submit(ctx, payload, background);
  if (payload.type === "block_actions") {
    const act = payload.actions?.[0];
    if (!act || !act.value || !BTN[act.action_id]) return null;
    const v = JSON.parse(act.value);
    const meta = { channel: payload.container?.channel_id || payload.channel?.id, ts: payload.container?.message_ts || payload.message?.ts };
    const res = await ctx.slack("views.open", { trigger_id: payload.trigger_id, view: actionModal(act.action_id, v, meta) });
    if (!res.ok) console.error("hb-slack: views.open failed", res.error);
    background(safely(ctx, payload.user.id, "checking that button", () => staleCheck(ctx, payload.user.id, act.action_id, v, res.view?.id, meta)));
    return null;
  }
  if (payload.type === "message_action" && payload.callback_id === "create_task_from_message") {
    const text = payload.message?.text || "";
    const first = text.split("\n")[0].replace(/<[^>|]+\|([^>]+)>/g, "$1").replace(/<[^>]+>/g, "").trim();
    await openNewForm(ctx, payload.trigger_id, payload.user.id, newDefaults({ invoker: payload.user.id, title: first, desc: text }), { msg: { channel: payload.channel?.id, ts: payload.message?.ts } }, background);
    return null;
  }
  if (payload.type === "view_submission") {
    const vals = readValues(payload.view.state.values);
    const meta = JSON.parse(payload.view.private_metadata || "{}");
    if (payload.view.callback_id === "hb_action") {
      if (meta.key === "submit" && !/^https?:\/\/\S+\.\S+/.test((vals.proof || "").trim())) return { response_action: "errors", errors: { proof: "Add a link that starts with https://" } };
      if (meta.key === "review" && vals.decision !== "send_back" && ["1", "3"].includes(String(vals.rating)) && (vals.comment || "").trim().length < 3) {
        return { response_action: "errors", errors: { comment: "Add a one-line reason for \u2605 or \u2605\u2605\u2605." } };
      }
      background(safely(ctx, payload.user.id, `saving \u201C${DONE_LABEL[meta.key] || "your update"}\u201D`, () => runAction(ctx, payload.user.id, meta, vals)));
      return meta.fromCard ? { response_action: "clear" } : null;
    }
    if (payload.view.callback_id === "hb_new") {
      const f2 = readNewForm(payload.view.state.values, { ...newDefaults(), kpis: Array.from({ length: meta.kpiN || 1 }, () => ({ dir: ">=", src: "manual" })) });
      const errors = newFormErrors(f2);
      if (Object.keys(errors).length) return { response_action: "errors", errors };
      background(safely(ctx, payload.user.id, "creating it", () => runNew(ctx, payload.user.id, f2, { msg: meta.msg }, payload.view.id)));
      return { response_action: "update", view: infoModal("New", `Creating *${cut(f2.title, 80)}*\u2026 \u{1F33F}`) };
    }
  }
  return null;
}
var TASK_ID = /^[A-Za-z]{2,5}-\d{1,5}$/;
var HELP = [
  "*HB+ Tasks in Slack*",
  "\u2022 `/task` or `/task Write ice bath SOP` \u2014 the full New form: task, sub-task, project, stream or recurring task",
  "\u2022 `/task MKT-14` \u2014 open a task: mark complete, reassign, update, extend\u2026",
  "\u2022 `/task bulk` \u2014 add several tasks at once, each with its own owner, deadline, size and impact (`/task bulk 5` opens 5)",
  "\u2022 *Fill SOW* \u2014 in your 6:30 PM nudge or on the HB+ Tasks Home tab"
].join("\n");
async function handleCommand(ctx, form, background = () => {
}) {
  const text = (form.get("text") || "").trim();
  const user = form.get("user_id");
  const trigger = form.get("trigger_id");
  if (/^help$/i.test(text)) return { response_type: "ephemeral", text: HELP };
  if (/^bulk\b/i.test(text)) {
    const n = parseInt(text.replace(/^bulk\s*/i, ""), 10);
    await ctx.slack("views.open", { trigger_id: trigger, view: bulkModal({ invoker: user, count: Number.isFinite(n) ? n : 3 }) });
    return null;
  }
  if (TASK_ID.test(text)) {
    const res = await ctx.slack("views.open", { trigger_id: trigger, view: infoModal("HB+ task", `Opening *${text.toUpperCase()}*\u2026`) });
    background(safely(ctx, user, `opening ${text.toUpperCase()}`, () => openTaskCard(ctx, user, text, res.view?.id)));
    return null;
  }
  await openNewForm(ctx, trigger, user, newDefaults({ invoker: user, title: text }), {}, background);
  return null;
}
var CARD_ACTIONS = [
  ["accept", "accept", "Accept", "primary"],
  ["submit", "submit", "Mark complete", "primary"],
  ["review", "review", "Review", "primary"],
  ["update", "update", "Update progress"],
  ["extension", "request_extension", "Request extension"],
  ["block", "block", "I'm blocked"],
  ["unblock", "unblock", "Unblock"]
];
function taskCardView(ctx, s, uid2, item) {
  const allowed = allowedActions(s, uid2, item);
  const v = { i: item.id, t: cut(item.title, 60) };
  const modes = [allowed.includes("change_owner") && "owner", allowed.includes("give_assignee") && "assignee"].filter(Boolean);
  const f2 = flagsOf(s, item);
  const flags = [f2.overdue && "\u26A0\uFE0F overdue", f2.atRisk && "at-risk", item.assigneeId && `with ${firstName(s, item.assigneeId)}`].filter(Boolean).join(" \xB7 ");
  const els = CARD_ACTIONS.filter(([, eng]) => allowed.includes(eng)).map(([key2, , label, style]) => ({ type: "button", action_id: key2, text: pt(label), ...style ? { style } : {}, value: JSON.stringify(v) }));
  if (modes.length) els.push({ type: "button", action_id: "reassign", text: pt("Reassign"), value: JSON.stringify({ ...v, modes }) });
  const url2 = link(ctx, `/task/${item.id}`);
  if (url2) els.push({ type: "button", action_id: "open_link", text: pt("Open in app"), url: url2 });
  const blocks = [
    { type: "section", text: md(`*${item.key} \xB7 ${item.title}*`) },
    {
      type: "section",
      fields: [
        md(`*Status*
${STATUS[item.status]?.label || item.status}${flags ? ` \xB7 ${flags}` : ""}`),
        md(`*Owner*
${nameOf(s, item.ownerId)}`),
        md(`*Due*
${item.currentDeadline ? fmtDT(item.currentDeadline) : "No end date"}`),
        md(`*Progress*
${progressOf(s, item)}%`),
        md(`*Size \xB7 Impact*
${item.size} \xB7 ${item.impact}`),
        md(`*Reviewer*
${nameOf(s, item.reviewerId)}`)
      ]
    }
  ];
  if (item.desc) blocks.push({ type: "context", elements: [md(cut(item.desc, 300))] });
  if (els.length) blocks.push({ type: "actions", block_id: "card", elements: els.slice(0, 25) });
  else blocks.push({ type: "context", elements: [md("Nothing for you to do on this task right now.")] });
  return { type: "modal", callback_id: "hb_card", title: pt(item.key), close: pt("Close"), blocks };
}
async function openTaskCard(ctx, slackUser, key2, viewId) {
  const show = (text) => viewId && ctx.slack("views.update", { view_id: viewId, view: infoModal("HB+ task", text) });
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) return show("I couldn't match your Slack account to HB+ Tasks. Your Slack email must match your company email in the app.");
  const s = await withLock(() => loadState(ctx));
  const item = s && s.items.find((i) => i.key.toLowerCase() === key2.toLowerCase());
  if (!item) return show(`No task with ID *${key2.toUpperCase()}*. Check the ID in the app (top-left of the task page).`);
  if (!canSeeFull(s, uid2, item)) return show(`*${item.key}* is a private task.`);
  await ctx.slack("views.update", { view_id: viewId, view: taskCardView(ctx, s, uid2, item) });
}
function reassignModal(v) {
  const opts2 = [];
  if (v.modes.includes("owner")) opts2.push(opt("Make them the owner \u2014 they become accountable (they accept; their manager approves if needed)", "owner"));
  if (v.modes.includes("assignee")) opts2.push(opt("Give them a part \u2014 you stay the owner, they hand it back", "assignee"));
  return {
    type: "modal",
    callback_id: "hb_reassign",
    private_metadata: JSON.stringify(v),
    title: pt("Reassign"),
    submit: pt("Reassign"),
    close: pt("Cancel"),
    blocks: [
      { type: "context", elements: [md(`*${v.t}*`)] },
      input("person", "To", { type: "users_select" }),
      input("mode", "How", { type: "radio_buttons", options: opts2, initial_option: opts2[0] }),
      input("comment", "Comment", { type: "plain_text_input", multiline: true }, false, "Every action needs a short comment.")
    ]
  };
}
async function runReassign(ctx, slackUser, v, vals) {
  const uid2 = await hbUserForSlack(ctx, slackUser);
  if (!uid2) return dm(ctx, slackUser, "I couldn't match your Slack account to HB+ Tasks.");
  const target = vals.person ? await hbUserForSlack(ctx, vals.person) : null;
  if (!target) return dm(ctx, slackUser, "That person isn't on HB+ Tasks yet (their Slack email must match their HB+ email).");
  const mode = vals.mode === "assignee" ? "assignee" : "owner";
  let before = null;
  const r = await runAs(ctx, (s) => {
    before = itemById(s, v.i)?.status;
    return mode === "owner" ? perform(s, uid2, v.i, "change_owner", { newOwnerId: target, comment: vals.comment }) : perform(s, uid2, v.i, "give_assignee", { assigneeId: target, comment: vals.comment });
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't reassign *${v.t}*: ${r.error}`);
  const who = firstName(r.s, target);
  const msg = mode === "assignee" ? `\u2705 *${v.t}* \u2014 ${who} now has a part. You're still the owner; they'll hand it back when done.` : ["awaiting", "pending_approval"].includes(before) ? `\u2705 *${v.t}* moved to ${who}. They've been asked to accept it.` : (() => {
    const ap = r.s.approvals.filter((x) => x.itemId === v.i && x.type === "owner_change" && x.status === "pending").pop();
    const approver = ap ? ap.approverIds.map((id) => firstName(r.s, id)).join(" or ") : "their manager";
    return `\u2705 Owner change for *${v.t}* requested \u2014 ${approver} approves, then ${firstName(r.s, target)} accepts. Points already earned stay with the current owner.`;
  })();
  return dm(ctx, slackUser, msg);
}
var BULK_MAX = 10;
var SIZE_OPTS = [opt("S \xB7 \u22642 days", "S"), opt("M \xB7 3\u201310 days", "M"), opt("L \xB7 >10 days", "L")];
var IMPACT_OPTS = [opt("1 \xB7 Low", 1), opt("3 \xB7 Medium", 3), opt("5 \xB7 Critical", 5)];
function bulkModal({ invoker, count = 3 }) {
  const n = Math.max(1, Math.min(BULK_MAX, count));
  const blocks = [{ type: "context", elements: [md("Fill in as many tasks as you need \u2014 empty sections are skipped. Each task gets its own owner, deadline, size and impact.")] }];
  for (let i = 0; i < n; i++) {
    blocks.push({ type: "divider" }, { type: "header", text: pt(`Task ${i + 1}`) });
    blocks.push(
      input(`t${i}_title`, "Title", { type: "plain_text_input", placeholder: pt("What needs to be done?") }, true),
      input(`t${i}_desc`, "Description", { type: "plain_text_input", multiline: true, placeholder: pt("What does done look like?") }, true),
      input(`t${i}_owner`, "Owner", { type: "users_select", ...invoker ? { initial_user: invoker } : {} }, true),
      input(`t${i}_due`, "Deadline (6:30 PM IST)", { type: "datepicker", initial_date: dateKey(addDays(now(), 3)) }, true),
      input(`t${i}_size`, "Size", { type: "static_select", options: SIZE_OPTS, initial_option: SIZE_OPTS[1] }, true),
      input(`t${i}_impact`, "Impact", { type: "static_select", options: IMPACT_OPTS, initial_option: IMPACT_OPTS[1] }, true),
      input(`t${i}_reason`, "Why this impact? (one line)", { type: "plain_text_input" }, true)
    );
  }
  if (n < BULK_MAX) blocks.push({ type: "actions", block_id: "bulk_more", elements: [{ type: "button", action_id: "bulk_more", text: pt("+ Add another task"), value: String(n) }] });
  else blocks.push({ type: "context", elements: [md(`That's the most for one go (${BULK_MAX}). Submit these, then run \`/task bulk\` again.`)] });
  return {
    type: "modal",
    callback_id: "hb_bulk",
    private_metadata: JSON.stringify({ count: n, invoker }),
    title: pt("Add tasks"),
    submit: pt("Create tasks"),
    close: pt("Cancel"),
    blocks
  };
}
function bulkRows(values, count) {
  const v = readValues(values);
  const rows = [];
  const errors = {};
  for (let i = 0; i < count; i++) {
    const title = (v[`t${i}_title`] || "").trim();
    if (!title) continue;
    const row = {
      title: cut(title, 150),
      desc: (v[`t${i}_desc`] || "").trim(),
      owner: v[`t${i}_owner`],
      due: v[`t${i}_due`],
      size: v[`t${i}_size`] || "M",
      impact: +(v[`t${i}_impact`] || 3),
      reason: (v[`t${i}_reason`] || "").trim()
    };
    if (!row.owner) errors[`t${i}_owner`] = "Pick an owner.";
    if (!row.due) errors[`t${i}_due`] = "Pick a deadline.";
    else if (row.due < dateKey(now())) errors[`t${i}_due`] = "Pick today or a later date.";
    if (!row.reason) errors[`t${i}_reason`] = "Add a one-line reason for the impact.";
    rows.push(row);
  }
  if (!rows.length) errors.t0_title = "Add at least one task.";
  return { rows, errors };
}
async function runBulk(ctx, slackUser, rows) {
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
        failed.push(`${row.title} \u2014 the owner isn't on HB+ Tasks yet`);
        continue;
      }
      const res = createItem(s, creator, {
        type: "task",
        title: row.title,
        desc: row.desc,
        ownerId,
        deadline: atTime(row.due, P(s, "defaultDeadlineTime")),
        size: row.size,
        impact: row.impact,
        impactReason: row.reason,
        progressMethod: "stages"
      });
      if (res.error) failed.push(`${row.title} \u2014 ${res.error}`);
      else created.push(res.id);
    }
    return created.length ? { ok: true } : { error: failed[0] || "Nothing to create." };
  });
  if (r.error) return dm(ctx, slackUser, `Couldn't create the tasks: ${r.error}`);
  const list = created.map((id) => itemById(r.s, id)).map((it) => `\u2022 *${it.key}* ${it.title} \u2014 ${it.ownerId === creator ? "you" : firstName(r.s, it.ownerId)} \xB7 ${it.size} \xB7 Impact ${it.impact} \xB7 due ${fmtDT(it.currentDeadline)}`).join("\n");
  const url2 = link(ctx, "/tasks");
  await dm(
    ctx,
    slackUser,
    `\u2705 Created ${created.length} task${created.length > 1 ? "s" : ""}:
${list}` + (failed.length ? `

Couldn't create:
${failed.map((x) => `\u2022 ${x}`).join("\n")}` : "") + (url2 ? `
<${url2}|Open My Tasks>` : "")
  );
  return r;
}
if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    const env2 = (k) => Deno.env.get(k);
    const serviceKey = env2("SUPABASE_SERVICE_ROLE_KEY") || env2("HB_SERVICE_KEY");
    if (!serviceKey) console.error("hb-slack: no service key found (SUPABASE_SERVICE_ROLE_KEY)");
    const client2 = createClient2(env2("SUPABASE_URL"), serviceKey, { auth: { persistSession: false } });
    const ctx = { client: client2, slack: makeSlack(env2("SLACK_BOT_TOKEN")), appUrl: env2("HB_APP_URL") };
    const jobs = [];
    const background = (p) => {
      const job = Promise.resolve(p).catch((e) => console.error(e));
      if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(job);
      else jobs.push(job);
    };
    try {
      if (req.headers.get("x-cron-secret") !== null) {
        if (req.headers.get("x-cron-secret") !== env2("HB_CRON_SECRET")) return new Response("Unauthorized", { status: 401 });
        return Response.json(await deliver(ctx, { publishHome: (/* @__PURE__ */ new Date()).getUTCMinutes() % 10 === 0 }));
      }
      const raw = await req.text();
      if (!await verifySlack(req.headers, raw, env2("SLACK_SIGNING_SECRET"))) return new Response("Invalid Slack signature", { status: 401 });
      const form = new URLSearchParams(raw);
      const out = form.get("command") ? await handleCommand(ctx, form, background) : await handleInteraction(ctx, JSON.parse(form.get("payload") || "{}"), background);
      if (jobs.length) await Promise.all(jobs);
      return out ? Response.json(out) : new Response("", { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response("", { status: 200 });
    }
  });
}
export {
  BULK_MAX,
  KPI_MAX,
  NEW_TYPES,
  TASK_ID,
  actionModal,
  bulkModal,
  bulkRows,
  deliver,
  dmBlocks,
  finishSow,
  handleCommand,
  handleInteraction,
  hbUserForSlack,
  homeView,
  makeSlack,
  newDefaults,
  newFormErrors,
  newFormInfo,
  newTaskView,
  openNewForm,
  openSow,
  openTaskCard,
  outcomesFrom,
  parseLinks,
  publishHomes,
  readNewForm,
  readValues,
  reassignModal,
  renderNewForm,
  runAction,
  runAs,
  runBulk,
  runNew,
  runReassign,
  safely,
  slackIdFor,
  sowStep1Submit,
  sowStep1View,
  sowStep2Submit,
  sowStep2View,
  staleCheck,
  taskCardView,
  verifySlack
};
