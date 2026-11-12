import { now } from '../lib/time.js';

// Company config (not a policy setting).
export const COMPANY = {
  name: 'HB+',
  // Google Workspace domain allowed to sign in (set VITE_COMPANY_DOMAIN in .env.local).
  domain: ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_COMPANY_DOMAIN) || 'hbplus.fit').toLowerCase(),
  creditsChannel: '#credits-where-credits-due',
  announceChannel: '#hb-announcements',
};

// Every task-level rule and point value. Values from PRD v1.0 + Rewards & Penalties canvas FINAL v1.0.
export const DEFAULT_POLICY = {
  // Rules
  crossVerticalApproval: true,
  extensionApprover: 'either', // creator | manager | either
  freeExtNoticeH: 48,
  freeExtensions: 1,
  selfTaskReviewer: 'manager', // manager | self
  foundersReviewOwn: true,
  autoAcceptH: 48, // 0 = never
  blockedFreeDays: 3,
  commentRequired: true,
  acceptToOwn: true,
  notAcceptedNudgeH: 24,
  sowNudge1: '18:30',
  sowNudge2: '21:00',
  sowDeadline: '10:00',
  defaultDeadlineTime: '18:30',
  offDaysBeforeAlert: 4,
  atRiskNoUpdateDays: 3,
  atRiskHours: 48,
  atRiskProgress: 50,
  reviewNudgeH: 36,
  // Top-3 ranking weights
  wAtRisk: 3,
  wPinned: 3,
  urgFar: 1, // due > 7 days
  urgMid: 2, // 3–7 days
  urgNear: 3, // ≤ 2 days
  urgOverdue: 4,
  // Base & multipliers
  sizeS: 1,
  sizeM: 3,
  sizeL: 5,
  earlyH: 24,
  earlyMult: 1.2,
  q1: 0.5,
  q2: 1.0,
  q3: 1.5,
  kpiCap: 120,
  // Rewards
  projectOnTimeBonus: 1.0, // × project base (R4)
  sowWeekBonus: 5, // R6
  sowMonthBonus: 15, // R7
  unblockBonus: 2, // R8
  unblockWithinH: 24,
  fastAcceptBonus: 1, // R9
  fastAcceptH: 4,
  // Penalties (fraction of Base unless noted)
  late1: 0.5, // P1 up to 1 day
  late2: 1.0, // P2 2–3 days
  late3: 1.5, // P3 > 3 days (cap)
  extLateNotice: 0.2, // P4
  extRepeat: 0.3, // P5
  sowMissed: 3, // P7 points
  sowMissed3: 5, // P8 points
  recurringMissed: 1.0, // P9 × base
  projectLate: 0.5, // P10
  notAccepted: 1, // P11 points
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
  perfWHealth: 0,
};

const HOURS_OPTS = [24, 48, 72];
export const POLICY_GROUPS = [
  {
    title: 'Ownership & approvals',
    fields: [
      { key: 'crossVerticalApproval', label: 'Cross-vertical approval', type: 'bool' },
      { key: 'acceptToOwn', label: 'Accept-to-own step', type: 'bool' },
      { key: 'notAcceptedNudgeH', label: 'Not-accepted nudge after', type: 'number', unit: 'h' },
      { key: 'selfTaskReviewer', label: 'Reviewer for self-created tasks', type: 'select', options: [['manager', 'Manager'], ['self', 'Self']] },
      { key: 'foundersReviewOwn', label: 'Founders review own tasks', type: 'bool' },
      { key: 'autoAcceptH', label: 'Review auto-accept after', type: 'select', options: [...HOURS_OPTS.map((h) => [h, `${h}h`]), [0, 'Never']] },
      { key: 'reviewNudgeH', label: 'Remind reviewer after', type: 'number', unit: 'h' },
      { key: 'commentRequired', label: 'Comment required on every action', type: 'bool' },
    ],
  },
  {
    title: 'Deadlines, extensions & blocks',
    fields: [
      { key: 'extensionApprover', label: 'Who approves extensions', type: 'select', options: [['creator', 'Creator'], ['manager', "Owner's manager"], ['either', 'Either']] },
      { key: 'freeExtNoticeH', label: 'Free extension notice', type: 'number', unit: 'h' },
      { key: 'freeExtensions', label: 'Number of free extensions', type: 'select', options: [[0, '0'], [1, '1'], [2, '2']] },
      { key: 'blockedFreeDays', label: 'Blocked pause without approval', type: 'number', unit: 'days', min: 1, max: 7 },
      { key: 'defaultDeadlineTime', label: 'Default deadline time', type: 'time' },
      { key: 'atRiskNoUpdateDays', label: 'At-risk: no update for', type: 'number', unit: 'days' },
      { key: 'atRiskHours', label: 'At-risk: deadline within', type: 'number', unit: 'h' },
      { key: 'atRiskProgress', label: 'At-risk: progress below', type: 'number', unit: '%' },
    ],
  },
  {
    title: 'Daily SOW',
    fields: [
      { key: 'sowNudge1', label: 'First SOW nudge', type: 'time' },
      { key: 'sowNudge2', label: 'Second SOW nudge', type: 'time' },
      { key: 'sowDeadline', label: 'SOW missed after (next day)', type: 'time' },
      { key: 'offDaysBeforeAlert', label: 'Personal off days before manager alert', type: 'number', unit: '/month' },
    ],
  },
  {
    title: 'Top-3 ranking weights',
    fields: [
      { key: 'wAtRisk', label: 'Bonus if at-risk', type: 'number' },
      { key: 'wPinned', label: 'Bonus if pinned by a manager', type: 'number' },
      { key: 'urgFar', label: 'Urgency: due > 7 days', type: 'number' },
      { key: 'urgMid', label: 'Urgency: due 3–7 days', type: 'number' },
      { key: 'urgNear', label: 'Urgency: due ≤ 2 days', type: 'number' },
      { key: 'urgOverdue', label: 'Urgency: overdue', type: 'number' },
    ],
  },
  {
    title: 'Points: base & multipliers',
    fields: [
      { key: 'sizeS', label: 'Size S value', type: 'number' },
      { key: 'sizeM', label: 'Size M value', type: 'number' },
      { key: 'sizeL', label: 'Size L value', type: 'number' },
      { key: 'earlyH', label: 'Early = submitted at least', type: 'number', unit: 'h before' },
      { key: 'earlyMult', label: 'Early multiplier (R2)', type: 'number', step: 0.1 },
      { key: 'q1', label: '1★ multiplier (P6)', type: 'number', step: 0.1 },
      { key: 'q2', label: '2★ multiplier', type: 'number', step: 0.1 },
      { key: 'q3', label: '3★ multiplier (R3)', type: 'number', step: 0.1 },
      { key: 'kpiCap', label: 'Stream KPI achievement cap', type: 'number', unit: '%' },
    ],
  },
  {
    title: 'Rewards (+)',
    fields: [
      { key: 'projectOnTimeBonus', label: 'R4 Project closed on time', type: 'number', unit: '× project Base', step: 0.1 },
      { key: 'sowWeekBonus', label: 'R6 SOW 6/6 on time in a week', type: 'number', unit: 'pts' },
      { key: 'sowMonthBonus', label: 'R7 Perfect SOW month', type: 'number', unit: 'pts' },
      { key: 'unblockBonus', label: 'R8 Unblocked someone', type: 'number', unit: 'pts' },
      { key: 'unblockWithinH', label: 'R8 window', type: 'number', unit: 'h' },
      { key: 'fastAcceptBonus', label: 'R9 Fast acceptance', type: 'number', unit: 'pts' },
      { key: 'fastAcceptH', label: 'R9 window', type: 'number', unit: 'h' },
    ],
  },
  {
    title: 'Penalties (−)',
    fields: [
      { key: 'late1', label: 'P1 Late up to 1 day', type: 'number', unit: '× Base', step: 0.1 },
      { key: 'late2', label: 'P2 Late 2–3 days', type: 'number', unit: '× Base', step: 0.1 },
      { key: 'late3', label: 'P3 Late > 3 days (cap)', type: 'number', unit: '× Base', step: 0.1 },
      { key: 'extLateNotice', label: 'P4 Extension with short notice', type: 'number', unit: '× Base', step: 0.05 },
      { key: 'extRepeat', label: 'P5 2nd+ extension', type: 'number', unit: '× Base each', step: 0.05 },
      { key: 'sowMissed', label: 'P7 Daily SOW missed', type: 'number', unit: 'pts' },
      { key: 'sowMissed3', label: 'P8 3 SOW misses in a week', type: 'number', unit: 'pts extra' },
      { key: 'recurringMissed', label: 'P9 Recurring occurrence missed', type: 'number', unit: '× Base', step: 0.1 },
      { key: 'projectLate', label: 'P10 Project closed late', type: 'number', unit: '× project Base', step: 0.1 },
      { key: 'notAccepted', label: 'P11 Not accepted within 24h', type: 'number', unit: 'pts' },
    ],
  },
  {
    title: 'Tiers (Delivery Score)',
    fields: [
      { key: 'tierPlatinum', label: 'Platinum from', type: 'number' },
      { key: 'tierGold', label: 'Gold from', type: 'number' },
      { key: 'tierSilver', label: 'Silver from', type: 'number' },
      { key: 'tierBronze', label: 'Bronze from', type: 'number' },
      { key: 'trialMode', label: 'Trial mode (pilot: scores visible, not counted for rewards)', type: 'bool' },
      { key: 'setupSprintOpen', label: 'Setup sprint open (everyone enters their current open tasks)', type: 'bool' },
    ],
  },
  {
    title: 'Performance reviews (weights for the overall summary)',
    fields: [
      { key: 'perfWTasks', label: 'Task delivery (Delivery Score)', type: 'number', unit: '%' },
      { key: 'perfWGoals', label: 'Top goals & extra initiatives', type: 'number', unit: '%' },
      { key: 'perfWBehaviour', label: 'Behaviour & skill goals', type: 'number', unit: '%' },
      { key: 'perfWKpi', label: 'Stream KPIs & KPI goals', type: 'number', unit: '%' },
      { key: 'perfWSow', label: 'Daily SOW compliance', type: 'number', unit: '%' },
      { key: 'perfWHealth', label: 'Health goals (private — 0 keeps them out of the score)', type: 'number', unit: '%' },
    ],
  },
];

export const POLICY_LABEL = Object.fromEntries(POLICY_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.label])));

// Value of a setting at a moment in time. Changes only apply from their effective date.
export function P(s, key, ts = now()) {
  let val = DEFAULT_POLICY[key];
  let best = -Infinity;
  for (const v of s.policyVersions) {
    if (v.key === key && v.effectiveFrom <= ts && v.effectiveFrom >= best) {
      best = v.effectiveFrom;
      val = v.newValue;
    }
  }
  return val;
}

export function policyVersionAt(s, ts = now()) {
  const applied = s.policyVersions.filter((v) => v.effectiveFrom <= ts);
  return `v1.${applied.length}`;
}
