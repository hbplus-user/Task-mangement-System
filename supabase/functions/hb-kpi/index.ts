// @ts-nocheck
// Built from server/hb-kpi.js with `npm run build:function`. Do not edit by hand.

// server/hb-kpi.js
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
var hourOf = (ts) => ist(ts).h;

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

// src/engine/core.js
var uid = (p = "x") => `${p}${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
var userById = (s, id) => s.users.find((u) => u.id === id);
var firstName = (s, id) => (userById(s, id)?.name || "\u2014").split(" ")[0];
var children = (s, id) => s.items.filter((i) => i.parentId === id);
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
var once = (s, key2) => {
  if (s.flags[key2]) return false;
  s.flags[key2] = now();
  return true;
};

// src/engine/actions.js
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

// server/hb-kpi.js
var round2 = (n) => Math.round(n * 100) / 100;
function makeMeta({ token, account, version = "v19.0", fetchFn = fetch }) {
  const acct = String(account).startsWith("act_") ? account : `act_${account}`;
  return async (metric, fromKey, toKey) => {
    const url2 = `https://graph.facebook.com/${version}/${acct}/insights?${new URLSearchParams({
      fields: "spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since: fromKey, until: toKey }),
      level: "account",
      access_token: token
    })}`;
    const j = await (await fetchFn(url2)).json();
    if (j.error) throw new Error(`Meta Ads: ${j.error.message}`);
    const row = j.data?.[0] || {};
    const spend = +row.spend || 0;
    const impressions = +row.impressions || 0;
    const clicks = +row.clicks || 0;
    const acts = row.actions || [];
    const lead = acts.find((a) => a.action_type === "lead") || acts.find((a) => /lead/.test(a.action_type));
    const leads = lead ? +lead.value : 0;
    const values = { spend, impressions, clicks, leads, ctr: impressions ? clicks / impressions * 100 : 0, cpl: leads ? spend / leads : null };
    if (!(metric in values)) throw new Error(`Meta Ads: unknown metric "${metric}"`);
    const v = values[metric];
    return { value: v == null ? null : round2(v), link: `https://adsmanager.facebook.com/adsmanager/reporting/view?act=${acct.slice(4)}` };
  };
}
function makeZoho({ clientId, clientSecret, refreshToken, accountsDomain = "accounts.zoho.in", apiDomain = "www.zohoapis.in", fetchFn = fetch }) {
  let token = null;
  const auth = async () => {
    if (token) return token;
    const r = await fetchFn(`https://${accountsDomain}/oauth/v2/token?${new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" })}`, { method: "POST" });
    const j = await r.json();
    if (!j.access_token) throw new Error(`Zoho sign-in failed: ${j.error || "no access token"}`);
    token = j.access_token;
    return token;
  };
  const coql = async (query) => {
    const t = await auth();
    const r = await fetchFn(`https://${apiDomain}/crm/v5/coql`, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ select_query: query }) });
    if (r.status === 204) return [];
    const j = await r.json();
    if (j.status === "error" || j.code && !j.data) throw new Error(`Zoho CRM: ${j.message || j.code}`);
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
      won_amount: `select SUM(Amount) from Deals where Stage = 'Closed Won' and Closing_Date between '${fromKey}' and '${toKey}'`
    };
    if (!queries[metric]) throw new Error(`Zoho CRM: unknown metric "${metric}"`);
    const data = await coql(queries[metric]);
    return { value: round2(firstNumber(data[0])), link: `https://crm.zoho.in/crm/` };
  };
}
async function runKpiPull(client2, providers, at = Date.now()) {
  useClient(client2);
  clock.offset = 0;
  const s = await loadAll();
  if (!s) return { ok: true, skipped: "No users yet" };
  const results = [];
  const thisWeek = startOfWeek(at);
  for (const stream of s.items.filter((i) => i.type === "stream" && !["closed", "cancelled"].includes(i.status))) {
    const cycle = children(s, stream.id).filter((c) => c.type === "cycle" && !c.verified && c.cycleStart <= at).sort((a, b) => b.cycleStart - a.cycleStart)[0];
    if (!cycle) continue;
    for (const k of s.kpis.filter((x) => x.itemId === cycle.id && x.source && x.source !== "manual")) {
      const get = providers[k.source];
      if (!get) {
        results.push({ kpi: k.name, skipped: `${k.source} is not connected` });
        continue;
      }
      const weeks = k.agg === "latest" ? [thisWeek] : [thisWeek - 7 * DAY, thisWeek];
      for (const wk of weeks) {
        const from = k.agg === "latest" ? cycle.cycleStart : Math.max(wk, cycle.cycleStart);
        const to = Math.min(k.agg === "latest" ? at : wk + 6 * DAY, at, cycle.currentDeadline);
        if (to < from) continue;
        const weekOf = dateKey(wk);
        if (k.actuals.some((a) => a.weekOf === weekOf && !a.auto)) {
          results.push({ kpi: k.name, weekOf, skipped: "entered by hand" });
          continue;
        }
        try {
          const { value, link } = await get(k.sourceMetric, dateKey(from), dateKey(to));
          if (value == null) {
            results.push({ kpi: k.name, weekOf, skipped: "no data yet" });
            continue;
          }
          const existing = k.actuals.find((a) => a.weekOf === weekOf && a.auto);
          if (existing) Object.assign(existing, { value, link, ts: now() });
          else k.actuals.push({ id: uid("v"), weekOf, value, link, by: "auto", ts: now(), verifiedBy: null, auto: true });
          k.actuals.sort((a, b) => a.weekOf < b.weekOf ? -1 : 1);
          results.push({ kpi: k.name, weekOf, value });
        } catch (e) {
          results.push({ kpi: k.name, weekOf, error: e.message });
          if (once(s, `kpierr:${stream.id}:${dateKey(at)}`)) {
            notify(s, stream.ownerId, `Couldn't fetch the KPI numbers for *${stream.title}* this morning (${k.source === "meta" ? "Meta Ads" : "Zoho CRM"}): ${e.message}. You can enter them by hand for now.`, { itemId: cycle.id, buttons: ["open"] });
          }
        }
      }
      cycle.lastUpdateAt = now();
      cycle.stage = Math.min(100, Math.round(cycleAchievement(s, cycle) * 100));
    }
  }
  const written = await saveNow(s);
  return { ok: true, results, written };
}
if (typeof Deno !== "undefined") {
  Deno.serve(async (req) => {
    const env2 = (k) => Deno.env.get(k);
    if (!env2("HB_CRON_SECRET") || req.headers.get("x-cron-secret") !== env2("HB_CRON_SECRET")) return new Response("Unauthorized", { status: 401 });
    const client2 = createClient2(env2("SUPABASE_URL"), env2("SUPABASE_SERVICE_ROLE_KEY") || env2("HB_SERVICE_KEY"), { auth: { persistSession: false } });
    const providers = {};
    if (env2("META_ACCESS_TOKEN") && env2("META_AD_ACCOUNT_ID")) providers.meta = makeMeta({ token: env2("META_ACCESS_TOKEN"), account: env2("META_AD_ACCOUNT_ID") });
    if (env2("ZOHO_CLIENT_ID") && env2("ZOHO_CLIENT_SECRET") && env2("ZOHO_REFRESH_TOKEN")) {
      providers.zoho = makeZoho({
        clientId: env2("ZOHO_CLIENT_ID"),
        clientSecret: env2("ZOHO_CLIENT_SECRET"),
        refreshToken: env2("ZOHO_REFRESH_TOKEN"),
        accountsDomain: env2("ZOHO_ACCOUNTS_DOMAIN") || "accounts.zoho.in",
        apiDomain: env2("ZOHO_API_DOMAIN") || "www.zohoapis.in"
      });
    }
    try {
      return Response.json(await runKpiPull(client2, providers));
    } catch (e) {
      console.error(e);
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  });
}
export {
  firstName,
  makeMeta,
  makeZoho,
  runKpiPull
};
