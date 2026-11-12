// @ts-nocheck
// Built from server/hb-tick.js with `npm run build:function`. Do not edit by hand.

// server/hb-tick.js
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
var MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
var startOfMonth = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, 1);
};
var endOfMonth = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo + 1, 1) - 1;
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
var fmtDT = (ts) => ts ? `${fmtDate(ts)}, ${fmtTime(ts)}` : "\u2014";
var monthName = (ts, long = false) => (long ? MON_LONG : MON)[ist(ts).mo];

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
var isAdmin = (s, id) => userById(s, id)?.role === "admin";
var isFA = (s, id) => isFounder(s, id) || isAdmin(s, id);
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
var sharesVertical = (s, a, b) => {
  const A = userById(s, a)?.verticals.map((v) => v.vid) || [];
  return (userById(s, b)?.verticals || []).some((v) => A.includes(v.vid));
};
var ownersManager = (s, item) => managerOf(s, item.ownerId, item.vertical);
function teamScope(s, id) {
  if (isFA(s, id)) return activeUsers(s).map((u) => u.id);
  return reportTree(s, id);
}
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
function notify(s, userIds, text, opts = {}) {
  const { itemId = null, approvalId = null, mode = "instant", buttons = [], critical = true, quietOk = false, kind = "info", exclude = [] } = opts;
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
function post(s, channel, text) {
  s.channel.push({ id: uid("c"), channel, text, ts: now() });
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
function deliveryScore(s, userId, monthTs = now()) {
  const from = startOfMonth(monthTs);
  const to = Math.min(endOfMonth(monthTs), Math.max(now(), from));
  let available = 0;
  for (const it of s.items) {
    if (it.ownerId !== userId || !(isWorkItem(it) || it.type === "cycle") || ["cancelled", "skipped"].includes(it.status)) continue;
    const d = it.currentDeadline;
    if (!d || d < from || d > endOfMonth(monthTs)) continue;
    if (d <= to || it.status === "closed") available += baseOf(s, it, d);
  }
  const earned = s.scoreEvents.filter((e) => e.userId === userId && e.ts >= from && e.ts <= endOfMonth(monthTs)).reduce((a, e) => a + e.points, 0);
  return { score: available ? Math.round(earned / available * 100) : null, earned: r1(earned), available: r1(available) };
}
function tierOf(s, score) {
  if (score == null) return { name: "No tasks yet", key: "none", emoji: "" };
  if (score >= P(s, "tierPlatinum")) return { name: "Platinum", key: "platinum", emoji: "\u{1F48E}" };
  if (score >= P(s, "tierGold")) return { name: "Gold", key: "gold", emoji: "\u{1F947}" };
  if (score >= P(s, "tierSilver")) return { name: "Silver", key: "silver", emoji: "\u{1F948}" };
  if (score >= P(s, "tierBronze")) return { name: "Bronze", key: "bronze", emoji: "\u{1F949}" };
  return { name: "Needs support", key: "support", emoji: "" };
}
function tieStats(s, userId, from, to) {
  const tasks = s.scoreEvents.filter((e) => e.userId === userId && e.type === "task" && e.ts >= from && e.ts <= to && !e.reversed);
  const onTime = tasks.length ? tasks.filter((e) => e.meta?.onTime).length / tasks.length : 0;
  const impact5 = tasks.filter((e) => e.meta?.onTime && e.meta?.impact === 5).length;
  const streaks = s.scoreEvents.filter((e) => e.userId === userId && e.code === "R6" && e.ts >= from && e.ts <= to).length;
  return { onTime, impact5, streaks };
}
function leaderboard(s, monthTs = now(), { excludeFounders = false, people = null } = {}) {
  const from = startOfMonth(monthTs);
  const to = endOfMonth(monthTs);
  const ids = people || activeUsers(s).map((u) => u.id);
  return ids.filter((id) => !(excludeFounders && isFounder(s, id))).map((id) => ({ id, ...deliveryScore(s, id, monthTs), ...tieStats(s, id, from, to) })).filter((r) => r.score != null).sort((a, b) => b.score - a.score || b.onTime - a.onTime || b.impact5 - a.impact5 || b.streaks - a.streaks);
}

// src/engine/actions.js
var err = (message) => ({ error: message });
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
function requestApproval(s, type, item, requesterId, approverIds, payload, text) {
  const ap = { id: uid("p"), type, itemId: item?.id || null, requesterId, approverIds: [...new Set(approverIds.filter(Boolean))], status: "pending", payload, text, ts: now() };
  if (!ap.approverIds.length) ap.approverIds = founders(s);
  s.approvals.push(ap);
  notify(s, ap.approverIds, `Approval needed: ${text}`, { itemId: item?.id, approvalId: ap.id, buttons: ["approve", "reject", "open"], kind: "approval", exclude: [requesterId] });
  return ap;
}
var pendingFor = (s, item, type) => s.approvals.find((a) => a.itemId === item.id && a.type === type && a.status === "pending");
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
async function takeServerLease(minutes = 10) {
  await client.from("app_lease").upsert({ id: "ticker", client_id: "server", held_until: new Date(Date.now() + minutes * 6e4).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() });
}
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

// src/engine/tick.js
function tick(s) {
  const t = now();
  const before = s.notifications.length + s.scoreEvents.length + s.items.length + s.approvals.length + s.sowDays.length;
  const flagCount = Object.keys(s.flags).length;
  for (const item of s.items) {
    const f2 = flagsOf(s, item, t);
    const om = ownersManager(s, item);
    if (item.status === "awaiting" && !item.declined && t - (item.assignedAt || item.createdAt) > P(s, "notAcceptedNudgeH") * HOUR && once(s, `na:${item.id}:${item.ownerId}:${item.assignedAt}`)) {
      notify(s, [item.ownerId, item.creatorId], `Gentle nudge: *${item.title}* is still waiting for ${firstName(s, item.ownerId)} to accept. Accept, or Discuss if something's unclear.`, { itemId: item.id, buttons: ["accept", "open"] });
      scoreEvent(s, item.ownerId, item.id, "not_accepted", "P11", -P(s, "notAccepted"), `Not accepted within ${P(s, "notAcceptedNudgeH")}h`);
    }
    if (item.status === "in_review" && item.submittedAt) {
      const waited = t - item.submittedAt;
      const auto = +P(s, "autoAcceptH");
      if (waited > P(s, "reviewNudgeH") * HOUR && once(s, `rv:${item.id}:${item.submittedAt}`)) {
        notify(s, item.reviewerId, `*${item.title}* has been waiting for your review for ${Math.floor(waited / HOUR)}h. A quick look keeps ${firstName(s, item.ownerId)} moving.`, { itemId: item.id, buttons: ["review", "open"] });
      }
      if (auto > 0 && waited > auto * HOUR) {
        closeWithRating(s, item, 2, null, true);
        notify(s, managerOf(s, item.reviewerId, item.vertical), `*${item.title}* auto-closed at 2\u2605 \u2014 ${firstName(s, item.reviewerId)} didn't review it within ${auto}h.`, { itemId: item.id, mode: "digest" });
      }
    }
    if (["open", "in_progress", "awaiting"].includes(item.status) && item.currentDeadline && item.type !== "stream") {
      const d = effectiveDeadline(s, item, t);
      if (d - t <= DAY && d > t && once(s, `due24:${item.id}:${d}`)) {
        notify(s, [item.ownerId, item.assigneeId], `\u23F0 *${item.title}* is due ${fmtDT(d)}. You've got this \u2014 anything you need?`, { itemId: item.id, buttons: ["update", "submit", "open"] });
      }
      if (f2.atRisk && once(s, `risk:${item.id}:${dateKey(t)}`)) {
        const days = Math.max(0, Math.round((d - t) / DAY));
        notify(s, [item.ownerId, om], `Quick check-in on *${item.title}* \u2014 due in ${days} day${days === 1 ? "" : "s"}, ${progressOf(s, item)}% done. What would help you finish strong?`, { itemId: item.id, buttons: ["update", "extension", "block", "open"] });
      }
      if (f2.overdue && once(s, `over:${item.id}:${item.currentDeadline}`)) {
        notify(s, [item.ownerId, item.creatorId, om], `*${item.title}* passed its deadline (${fmtDT(d)}). Let's close the loop \u2014 share an update or a new plan.`, { itemId: item.id, buttons: ["update", "extension", "block", "open"] });
      }
    }
    if (item.status === "blocked" && item.blockedAt && t - item.blockedAt > allowedPauseMs(s, item) && !pendingFor(s, item, "blocked_extra")) {
      const n = (item.blockedApprovedDays || 0) + P(s, "blockedFreeDays") + 1;
      if (once(s, `bx:${item.id}:${n}`)) {
        requestApproval(s, "blocked_extra", item, item.ownerId, [om], { day: n }, `*${item.title}* has been blocked by ${firstName(s, item.blockedBy)} for over ${n - 1} days. Pause the deadline clock for day ${n}?`);
        notify(s, item.ownerId, `*${item.title}* has been blocked for ${n - 1} days. ${firstName(s, om)} has been asked to approve more paused time.`, { itemId: item.id });
      }
    }
    if (item.type === "stream" && !["cancelled", "closed"].includes(item.status)) {
      const cycles = children(s, item.id).filter((c) => c.type === "cycle").sort((a, b) => a.cycleStart - b.cycleStart);
      const last2 = cycles[cycles.length - 1];
      if (last2 && t > last2.currentDeadline) {
        const kpis = s.kpis.filter((k) => k.itemId === last2.id).map((k) => ({ name: k.name, target: k.target, unit: k.unit, dir: k.dir, agg: k.agg, source: k.source, sourceMetric: k.sourceMetric }));
        const c = startCycle(s, item, parseKey(addKey(dateKey(last2.currentDeadline), 1)), kpis);
        notify(s, item.ownerId, `New cycle for *${item.title}* has started (targets copied from last cycle \u2014 edit if needed).`, { itemId: c.id });
        notify(s, ownersManager(s, item), `*${last2.title}* has ended. Please verify the KPI actuals to close it.`, { itemId: last2.id, buttons: ["open"] });
      }
      for (const c of cycles.filter((c2) => !c2.verified && t > c2.currentDeadline + 3 * DAY)) {
        if (once(s, `kpiver:${c.id}`)) notify(s, ownersManager(s, item), `KPIs for *${c.title}* still need your verification (cycle ended ${fmtDT(c.currentDeadline)}).`, { itemId: c.id, buttons: ["open"] });
      }
      if (weekday(t) === 6 && hourOf(t) >= 10 && once(s, `kpisat:${item.id}:${dateKey(t)}`)) {
        notify(s, item.ownerId, `\u{1F4CA} It's Saturday \u2014 time to enter this week's KPI actuals for *${item.title}* (with a source link).`, { itemId: last2?.id || item.id, buttons: ["open"] });
      }
    }
  }
  for (const p of s.items.filter((i) => i.type === "project" && ["open", "in_progress"].includes(i.status))) checkProjectClose(s, p.id);
  for (const r of s.recurring) runRecurring(s, r);
  const today = dateKey(t);
  for (const u of activeUsers(s)) {
    for (let i = 1; i <= 21; i++) {
      const k = addKey(today, -i);
      if (!sowRequired(s, u.id, k) || sowStatus(s, u.id, k, t) !== "missed") continue;
      const d = sowDay(s, u.id, k);
      if (d.missedPenalized) continue;
      d.missedPenalized = true;
      if (!d.submittedAt) d.status = "missed";
      scoreEvent(s, u.id, null, "sow_missed", "P7", -P(s, "sowMissed"), `Daily SOW for ${k} not submitted by ${P(s, "sowDeadline")} next day`, Math.min(t, atTime(addKey(k, 1), P(s, "sowDeadline"))));
      notify(s, u.id, `Your SOW for ${k} didn't come in by 10 AM. It's still needed \u2014 take 3 minutes to fill it when you can.`, { buttons: ["sow"], quietOk: true });
      notify(s, mainManager(s, u.id), `10 AM report: ${firstName(s, u.id)} missed the SOW for ${k}.`, { mode: "instant", critical: true });
      const ws2 = startOfWeek(parseKey(k));
      const misses = s.sowDays.filter((x) => x.userId === u.id && x.missedPenalized && startOfWeek(parseKey(x.date)) === ws2).length;
      if (misses >= 3 && once(s, `miss3:${u.id}:${ws2}`)) {
        scoreEvent(s, u.id, null, "sow_missed3", "P8", -P(s, "sowMissed3"), "3 SOW misses in one week");
        notify(s, [mainManager(s, u.id), ...founders(s)], `${nameOf(s, u.id)} has missed 3 SOWs this week. A supportive check-in might help.`, { exclude: [u.id] });
      }
    }
    if (sowRequired(s, u.id, today) && !sowDayOf(s, u.id, today)?.submittedAt) {
      if (t >= atTime(today, P(s, "sowNudge1")) && once(s, `n1:${u.id}:${today}`)) {
        notify(s, u.id, "Wrapping up? \u{1F33F} Take 3 minutes to log today and pick tomorrow's top 3.", { buttons: ["sow"], quietOk: true, kind: "sow" });
      }
      if (t >= atTime(today, P(s, "sowNudge2")) && once(s, `n2:${u.id}:${today}`)) {
        notify(s, u.id, "Still time to log today \u{1F319} \u2014 your SOW counts as on time until 11:59 PM.", { buttons: ["sow"], quietOk: true, kind: "sow" });
      }
    }
  }
  const ws = startOfWeek(t);
  if (weekday(t) === 1 && t >= atTime(today, "09:00")) {
    for (const u of activeUsers(s).filter((u2) => isManager(s, u2.id) || isFounder(s, u2.id))) {
      if (!once(s, `mon:${u.id}:${ws}`)) continue;
      const team = teamScope(s, u.id);
      const open = s.items.filter((i) => team.includes(i.ownerId) && isWorkItem(i));
      const overdue = open.filter((i) => flagsOf(s, i).overdue).length;
      const due = open.filter((i) => i.currentDeadline >= ws && i.currentDeadline < ws + 7 * DAY && !["closed", "cancelled"].includes(i.status)).length;
      notify(s, u.id, `\u2600\uFE0F Monday digest \u2014 your team has ${due} tasks due this week and ${overdue} overdue. Pending approvals are in your inbox.`, { kind: "digest" });
    }
  }
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
        if (sowStatus(s, u.id, k) === "on_time") ok++;
      }
      if (req >= 20 && ok === req) {
        scoreEvent(s, u.id, null, "sow_month", "R7", P(s, "sowMonthBonus"), `Perfect SOW month (${monthName(lastMonth, true)})`, atTime(endOfMonth(lastMonth), "23:00"));
      }
    }
    const top = leaderboard(s, lastMonth).slice(0, 5);
    if (top.length) {
      post(s, "credits", `\u{1F3C6} Top performers for ${monthName(lastMonth, true)}:
${top.map((r, i) => `${i + 1}. ${nameOf(s, r.id)} \u2014 ${tierOf(s, r.score).name}`).join("\n")}
Thank you for the ownership, everyone!`);
    }
  }
  const after = s.notifications.length + s.scoreEvents.length + s.items.length + s.approvals.length + s.sowDays.length;
  return after !== before || Object.keys(s.flags).length !== flagCount;
}

// server/hb-tick.js
async function runTick(client2) {
  useClient(client2);
  clock.offset = 0;
  const s = await loadAll();
  if (!s) return { ok: true, skipped: "No users yet" };
  await takeServerLease();
  const changed = tick(s);
  const written = changed ? await saveNow(s) : {};
  return { ok: true, changed, written };
}
if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    const secret = Deno.env.get("HB_CRON_SECRET");
    if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("Unauthorized", { status: 401 });
    const key2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("HB_SERVICE_KEY");
    const client2 = createClient2(Deno.env.get("SUPABASE_URL"), key2, { auth: { persistSession: false } });
    try {
      return Response.json(await runTick(client2));
    } catch (e) {
      console.error(e);
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  });
}
export {
  runTick
};
