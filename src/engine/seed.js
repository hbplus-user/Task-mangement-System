import { uid, nextKey, scoreEvent, isHoliday, SIZE_HOURS, baseOf } from './core.js';
import { scoreTaskClose } from './scoring.js';
import { periodOptions, perfSummary } from './goals.js';
import { P, COMPANY } from './policy.js';
import { now, DAY, HOUR, atTime, addDays, dateKey, addKey, startOfWeek, startOfMonth, addMonths, parseKey, isWorkingDay } from '../lib/time.js';
import { yearOf } from '../lib/time.js';

export const STATE_VERSION = 4;

export function emptyState() {
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
    reviews: [],
  };
}

// Small deterministic random generator so the demo looks the same each reset.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V = (id, name, key) => ({ id, name, key });
const U = (id, name, role, verticals, extra = {}) => ({
  id,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@${COMPANY.domain}`,
  slackId: `U0${id.toUpperCase()}`,
  role,
  customRoles: [],
  verticals,
  hours: 9,
  status: 'active',
  muted: [],
  joinedOn: '2025-01-01',
  ...extra,
});
const vm = (vid, managerId, main = false) => ({ vid, managerId, main });

export function seed() {
  const s = emptyState();
  const T = now();
  const day = (n, hhmm = '18:30') => atTime(addDays(T, n), hhmm);
  const rand = rng(7);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  s.verticals = [V('ldr', 'Leadership', 'LDR'), V('mkt', 'Marketing', 'MKT'), V('ops', 'Operations', 'OPS'), V('sal', 'Sales', 'SAL'), V('hr', 'HR', 'HR'), V('tec', 'Tech', 'TEC'), V('con', 'Content', 'CON')];
  s.users = [
    U('selina', 'Selina Kapoor', 'founder', [vm('ldr', null, true), vm('mkt', null)], { title: 'Founder' }),
    U('ankit', 'Ankit Mehra', 'founder', [vm('ldr', null, true), vm('ops', null), vm('sal', null)], { title: 'Founder' }),
    U('neha', 'Neha Sharma', 'admin', [vm('hr', 'ankit', true)], { title: 'HR Lead' }),
    U('riya', 'Riya Desai', 'member', [vm('mkt', 'selina', true), vm('ops', 'happy'), vm('con', 'selina')], { title: 'Marketing · Captain' }),
    U('manish', 'Manish Verma', 'member', [vm('mkt', 'riya', true)], { title: 'Marketing' }),
    U('ayush', 'Ayush Rao', 'member', [vm('mkt', 'riya', true), vm('con', 'riya')], { title: 'Marketing · Content' }),
    U('anil', 'Anil Kumar', 'member', [vm('mkt', 'selina', true)], { title: 'Marketing' }),
    U('subit', 'Subit Pradhan', 'member', [vm('mkt', 'selina', true), vm('tec', 'ankit')], { title: 'Marketing · Tech' }),
    U('abhishek', 'Abhishek Jain', 'member', [vm('mkt', 'selina', true)], { title: 'Marketing' }),
    U('happy', 'Happy Singh', 'member', [vm('ops', 'ankit', true)], { title: 'Operations Lead' }),
    U('priya', 'Priya Nair', 'member', [vm('ops', 'happy', true)], { title: 'Physio' }),
    U('satya', 'Satya Iyer', 'member', [vm('sal', 'ankit', true)], { title: 'Sales Lead' }),
  ];
  s.roles = [{ id: 'hradmin', name: 'HR Admin', abilities: ['users', 'holidays', 'offboarding'] }];
  const yr = yearOf(T);
  s.holidays = [
    { date: `${yr}-01-26`, name: 'Republic Day' },
    { date: `${yr}-03-04`, name: 'Holi' },
    { date: `${yr}-08-15`, name: 'Independence Day' },
    { date: `${yr}-10-02`, name: 'Gandhi Jayanti' },
    { date: `${yr}-10-20`, name: 'Dussehra' },
    { date: `${yr}-11-24`, name: 'Guru Nanak Jayanti' },
    { date: `${yr}-12-25`, name: 'Christmas' },
  ];

  const mk = (d) => {
    const vertical = d.vertical || 'mkt';
    const it = {
      id: uid('i'),
      key: nextKey(s, d.parentId, vertical),
      projKey: d.projKey || null,
      type: d.type || 'task',
      parentId: d.parentId || null,
      title: d.title,
      desc: d.desc || '',
      vertical,
      creatorId: d.creator || d.owner,
      ownerId: d.owner,
      assigneeId: d.assignee || null,
      contributors: d.contributors || [],
      reviewerId: d.reviewer || (d.creator && d.creator !== d.owner ? d.creator : ['selina', 'ankit'].includes(d.owner) ? d.owner : s.users.find((u) => u.id === d.owner).verticals.find((v) => v.vid === vertical)?.managerId || 'selina'),
      size: d.size || 'M',
      impact: d.impact || 3,
      impactReason: d.reason || 'Moves a monthly goal forward',
      estHours: d.est || SIZE_HOURS[d.size || 'M'],
      progressMethod: d.method || (d.checklist ? 'checklist' : d.type === 'project' || d.type === 'stream' ? 'subtasks' : 'stages'),
      progress: 0,
      stage: d.stage ?? 0,
      checklist: (d.checklist || []).map(([text, done]) => ({ id: uid('k'), text, done: !!done })),
      originalDeadline: d.orig || d.due || null,
      currentDeadline: d.due || null,
      pickupDate: null,
      status: d.status || 'open',
      private: !!d.private,
      pinned: !!d.pinned,
      links: d.links || [],
      proofLinks: d.proof ? [d.proof] : [],
      rating: d.rating || null,
      recurringId: d.recurringId || null,
      cycleLength: d.cycleLength || null,
      pausedMs: 0,
      extensionsCount: d.ext || 0,
      createdAt: d.created || T - 6 * DAY,
      assignedAt: d.assigned || d.created || T - 6 * DAY,
      acceptedAt: d.status === 'awaiting' || d.status === 'pending_approval' ? null : (d.created || T - 6 * DAY) + 2 * HOUR,
      lastUpdateAt: d.updated || T - 1 * DAY,
      submittedAt: d.submitted || null,
      deadlineAtSubmit: d.submitted ? d.due : null,
      closedAt: d.closed || null,
      blockedBy: d.blockedBy || null,
      blockedAt: d.blockedAt || null,
      blockedReason: d.blockedReason || null,
      goalLinks: [],
    };
    s.items.push(it);
    s.activity.push({ id: uid('a'), ts: it.createdAt, userId: it.creatorId, itemId: it.id, action: 'Created', from: null, to: it.key });
    return it;
  };
  const comment = (item, userId, text, action = null, ts = T - 2 * HOUR) => s.comments.push({ id: uid('m'), itemId: item.id, userId, text, action, ts, parentId: null });

  /* ---------- History: closed tasks over the past 10 weeks ---------- */
  const reliability = { selina: 0.85, ankit: 0.8, neha: 0.92, riya: 0.86, manish: 0.5, ayush: 0.95, anil: 0.82, subit: 0.88, abhishek: 0.86, happy: 0.75, priya: 0.8, satya: 0.68 };
  const titles = {
    mkt: ['Instagram carousel: recovery tips', 'Festive offer creatives', 'Newsletter — October edition', 'Meta ads A/B test', 'Influencer brief', 'Landing page refresh', 'Retargeting audience setup', 'Monthly marketing report', 'Google review drive', 'YouTube shorts batch', 'Podcast guest outreach', 'Referral programme poster'],
    ops: ['Ice bath maintenance log', 'Physio slot optimisation', 'Front desk SOP update', 'Vendor contract renewal', 'Equipment audit', 'Client feedback calls', 'Cleaning checklist v2'],
    sal: ['Corporate lead list', 'Pricing sheet update', 'Gym partnership pitch', 'Membership renewal calls', 'Sales deck refresh'],
    hr: ['Onboarding kit', 'Leave policy FAQ', 'Interview panel schedule', 'Payroll inputs', 'Engagement survey'],
    ldr: ['Board update', 'Quarterly OKR review', 'Cash-flow plan', 'Hiring plan review', 'Brand partnership call'],
    tec: ['Website speed audit', 'Booking form bug fix', 'Analytics events', 'CRM field cleanup'],
    con: ['Blog: cold therapy myths', 'Script: Gut health reel', 'Content calendar draft'],
  };
  for (const u of s.users) {
    const rel = reliability[u.id];
    const vids = u.verticals.map((v) => v.vid);
    for (let w = 10; w >= 1; w--) {
      const n = 3 + (rand() < 0.5 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const vertical = pick(vids);
        let due = atTime(addDays(startOfWeek(T), -7 * w + Math.floor(rand() * 6)), '18:30');
        if (!isWorkingDay(dateKey(due))) due = addDays(due, 1);
        const r = rand();
        let submitted;
        if (r < rel * 0.28) submitted = due - (1 + Math.floor(rand() * 3)) * DAY - 2 * HOUR;
        else if (r < rel) submitted = due - Math.floor(rand() * 6) * HOUR;
        else submitted = due + (0.3 + rand() * 4.5) * DAY;
        if (submitted > T - 2 * DAY) continue;
        const qr = rand();
        const rating = qr < 0.14 ? 3 : qr < 0.86 ? 2 : 1;
        const size = pick(['S', 'S', 'M', 'M', 'L']);
        const impact = pick([1, 3, 3, 5]);
        const creator = rand() < 0.5 ? u.id : u.verticals.find((v) => v.vid === vertical)?.managerId || u.id;
        const it = mk({
          title: pick(titles[vertical]),
          owner: u.id,
          creator,
          vertical,
          size,
          impact,
          due,
          status: 'closed',
          stage: 100,
          rating,
          created: due - (size === 'L' ? 14 : size === 'M' ? 6 : 2) * DAY,
          submitted,
          closed: submitted + (6 + rand() * 30) * HOUR,
          updated: submitted,
          proof: 'https://docs.google.com/document/d/hbplus-proof',
        });
        if (rand() < 0.15) {
          it.extensionsCount = 1;
          it.originalDeadline = due - 2 * DAY;
        }
        if (rand() < 0.3) scoreEvent(s, u.id, it.id, 'fast_accept', 'R9', P(s, 'fastAcceptBonus'), 'Accepted within 4 hours', it.createdAt + 2 * HOUR);
        scoreTaskClose(s, it, it.closedAt);
      }
    }
    // A cancelled task now and then (no points).
    if (rand() < 0.4) mk({ title: 'Old campaign idea (parked)', owner: u.id, creator: u.id, vertical: vids[0], due: day(-20), status: 'cancelled', created: T - 30 * DAY });
  }
  // A few unblock bonuses & extension penalties for realism.
  scoreEvent(s, 'riya', null, 'unblock', 'R8', 2, 'Unblocked Manish within 24h', T - 12 * DAY);
  scoreEvent(s, 'ayush', null, 'unblock', 'R8', 2, 'Unblocked Riya within 24h', T - 5 * DAY);
  scoreEvent(s, 'manish', null, 'extension', 'P5', -0.9, 'Extension #2 on this task', T - 4 * DAY);

  /* ---------- SOW history (8 weeks) ---------- */
  const today = dateKey(T);
  const reasons = ['Re-prioritised', 'Re-prioritised', 'Underestimated', 'Blocked', 'Leave or health', 'Forgot', 'Other'];
  for (const u of s.users) {
    const rel = reliability[u.id];
    for (let i = 56; i >= 1; i--) {
      const k = addKey(today, -i);
      if (!isWorkingDay(k) || isHoliday(s, k)) continue;
      const r = rand();
      if (r < 0.03) {
        s.offDays.push({ id: uid('o'), userId: u.id, date: k, code: pick(['Planned leave', 'Sick-Health', 'Training', 'Field-Event']), reason: '', ts: parseKey(k) });
        continue;
      }
      const d = { id: uid('s'), userId: u.id, date: k, top3: [], entries: [], submittedAt: null, status: null };
      const pOn = 0.55 + rel * 0.42;
      if (r < pOn) {
        d.submittedAt = atTime(k, '18:00') + Math.floor(rand() * 270) * 60 * 1000;
        d.status = 'on_time';
      } else if (r < pOn + 0.05) {
        d.submittedAt = atTime(addKey(k, 1), '08:30') + Math.floor(rand() * 80) * 60 * 1000;
        d.status = 'late';
      } else {
        d.status = 'missed';
        d.missedPenalized = true;
        scoreEvent(s, u.id, null, 'sow_missed', 'P7', -P(s, 'sowMissed'), `Daily SOW for ${k} not submitted by 10:00 next day`, atTime(addKey(k, 1), '10:00'));
      }
      if (d.submittedAt && rand() < 0.4) d.entries.push({ itemId: null, outcome: 'not_touched', reason: pick(reasons), comment: '' });
      s.sowDays.push(d);
    }
    // R6 streak bonuses for fully on-time weeks
    for (let w = 8; w >= 1; w--) {
      const ws = addDays(startOfWeek(T), -7 * w);
      const keys = Array.from({ length: 6 }, (_, i) => dateKey(ws + i * DAY + 2 * HOUR));
      const days = keys.map((k) => s.sowDays.find((x) => x.userId === u.id && x.date === k)).filter(Boolean);
      if (days.length >= 5 && days.every((x) => x.status === 'on_time')) {
        scoreEvent(s, u.id, null, 'streak', 'R6', P(s, 'sowWeekBonus'), `SOW ${days.length}/${days.length} on time this week`, atTime(keys[5], '20:00'));
        s.flags[`streak:${u.id}:${ws}`] = T;
      }
    }
  }
  // This week so far: make Riya's streak look like the mockup (all on time)
  for (const d of s.sowDays.filter((x) => x.userId === 'riya' && x.date >= dateKey(startOfWeek(T)))) {
    if (!d.submittedAt) d.submittedAt = atTime(d.date, '18:42');
    d.status = 'on_time';
    d.missedPenalized = false;
  }
  s.scoreEvents = s.scoreEvents.filter((e) => !(e.userId === 'riya' && e.type === 'sow_missed' && e.ts >= startOfWeek(T)));
  s.offDays.push({ id: uid('o'), userId: 'anil', date: today, code: 'Training', reason: 'First-aid certification', ts: T });

  /* ---------- Current work (matches the mockups) ---------- */
  const diwali = mk({ type: 'project', projKey: 'DIW', title: 'Diwali Campaign', owner: 'riya', creator: 'selina', size: 'L', impact: 5, reason: 'Biggest revenue window of the quarter', due: day(6), status: 'in_progress', created: T - 20 * DAY, desc: 'All creatives, ads and landing pages for the festive offer.' });
  const sops = mk({ type: 'project', projKey: 'OPS', title: 'SOPs 2026', owner: 'happy', creator: 'ankit', vertical: 'ops', size: 'L', impact: 5, reason: 'Safety and consistency across centres', due: day(40), status: 'in_progress', created: T - 25 * DAY });
  const hop = mk({ type: 'project', projKey: 'HOP', title: 'Client follow-ups', owner: 'riya', creator: 'riya', size: 'M', impact: 3, reason: 'Win back lapsed members', due: day(50), status: 'in_progress', created: T - 30 * DAY });

  const diwaliAds = mk({
    parentId: diwali.id, title: 'Final creatives for Diwali ads', owner: 'riya', creator: 'selina', size: 'M', impact: 5, reason: 'Ads go live with the festive offer',
    orig: day(-3), due: day(-1), ext: 1, status: 'in_progress', stage: 75, updated: T - 5 * HOUR, created: T - 9 * DAY,
    desc: 'Final static + video creatives for Meta and Google, in all sizes.', links: [{ label: 'Creative brief', url: 'https://docs.google.com/document/d/diwali-brief' }],
  });
  comment(diwaliAds, 'riya', 'Video cut is ready, statics need one more round with Selina.', 'Updated progress 50% → 75%', T - 5 * HOUR);

  const sop = mk({
    parentId: sops.id, vertical: 'ops', title: 'Write Ice Bath safety SOP', owner: 'riya', creator: 'selina', assignee: 'priya', contributors: ['anil', 'ayush'], size: 'M', impact: 5,
    reason: 'Client safety at HOP — no sessions without this.', due: day(2), status: 'in_progress', updated: T - 2 * HOUR, created: T - 8 * DAY,
    desc: 'Step-by-step safety protocol for ice bath sessions at HOP: screening questions, contraindications, time limits by experience level, emergency steps and staff sign-off.',
    checklist: [['Screening questions', 1], ['Contraindications list (physio sign-off)', 1], ['Time limits by level'], ['Emergency steps'], ['Staff training sign-off sheet']],
    links: [{ label: 'Draft SOP – Google Doc', url: 'https://docs.google.com/document/d/ice-bath-sop' }, { label: 'Physio screening form', url: 'https://forms.gle/physio-screening' }, { label: 'Supplier guidelines', url: 'https://drive.google.com/file/d/supplier' }],
  });
  sop.reviewerId = 'selina';
  comment(sop, 'riya', 'Time limits next — will finish by Thursday morning.', 'Updated progress 20% → 40%', T - 2 * HOUR - 10 * 60 * 1000);
  comment(sop, 'priya', 'Contraindications done and signed by physio team ✅', null, T - 2 * HOUR);

  const rule = { id: uid('r'), template: { title: 'Call 10 lapsed HOP members', ownerId: 'riya', parentId: hop.id, vertical: 'mkt', size: 'S', impact: 3, impactReason: 'Win back lapsed members', progressMethod: 'checklist', checklist: Array.from({ length: 10 }, (_, i) => `Call #${i + 1}`) }, freq: 'weekly', everyDays: 7, dueAfterDays: 5, ownerId: 'riya', creatorId: 'riya', nextRun: atTime(addDays(startOfWeek(T), 7), '09:00'), active: true, consecutiveMisses: 0, createdAt: T - 30 * DAY };
  s.recurring.push(rule);
  mk({ parentId: hop.id, title: 'Call 10 lapsed HOP members', owner: 'riya', creator: 'riya', reviewer: 'selina', size: 'S', impact: 3, reason: 'Win back lapsed members', due: atTime(addDays(startOfWeek(T), 5), '18:30'), status: 'in_progress', recurringId: rule.id, updated: T - 20 * HOUR, created: atTime(startOfWeek(T), '09:00'), checklist: Array.from({ length: 10 }, (_, i) => [`Call #${i + 1}`, i < 6]) });

  const hiring = mk({ vertical: 'ops', title: 'Hiring post for physio', owner: 'riya', creator: 'happy', size: 'S', impact: 3, reason: 'Two physio slots open at HOP', due: day(3), status: 'awaiting', created: T - 3 * HOUR, assigned: T - 3 * HOUR });
  s.notifications.push({ id: uid('n'), userId: 'riya', text: `Hi Riya 👋 Happy has trusted you with *Hiring post for physio* (Impact: Medium · Due ${new Date(day(3)).toDateString().slice(0, 10)}, 6:30 PM). Tap Accept to own it, or Discuss if anything's unclear.`, itemId: hiring.id, mode: 'instant', buttons: ['accept', 'decline', 'open'], kind: 'info', ts: T - 3 * HOUR, deliverAt: T - 3 * HOUR, read: false });

  const cal = mk({ vertical: 'con', title: 'Nov content calendar', owner: 'ayush', creator: 'riya', size: 'M', impact: 3, due: day(2), status: 'in_review', stage: 100, submitted: T - 20 * HOUR, proof: 'https://docs.google.com/spreadsheets/d/nov-content', created: T - 7 * DAY });
  s.notifications.push({ id: uid('n'), userId: 'riya', text: '📬 Ayush submitted *Nov content calendar* for your review (2d early).', itemId: cal.id, mode: 'instant', buttons: ['review', 'open'], kind: 'info', ts: T - 20 * HOUR, deliverAt: T - 20 * HOUR, read: false });

  const landing = mk({ parentId: diwali.id, title: 'Landing page copy', owner: 'manish', creator: 'riya', size: 'M', impact: 3, orig: day(-2), due: day(1), ext: 1, status: 'blocked', stage: 50, blockedBy: 'riya', blockedAt: T - 20 * HOUR, blockedReason: 'Need final offer wording approved', created: T - 10 * DAY, updated: T - 20 * HOUR });
  landing.prevStatus = 'in_progress';
  comment(landing, 'manish', 'Need final offer wording approved', 'Marked blocked by Riya', T - 20 * HOUR);
  s.notifications.push({ id: uid('n'), userId: 'riya', text: 'Manish is blocked on *Landing page copy* and needs you: “Need final offer wording approved”. Unblocking within 24h earns +2.', itemId: landing.id, mode: 'instant', buttons: ['unblock', 'open'], kind: 'info', ts: T - 20 * HOUR, deliverAt: T - 20 * HOUR, read: false });
  s.approvals.push({ id: uid('p'), type: 'extension', itemId: landing.id, requesterId: 'manish', approverIds: ['riya'], status: 'pending', payload: { newDeadline: day(3), oldDeadline: day(1), noticeH: 30, nth: 2, cost: ['−20% (short notice)', '−30% (extension #2)'] }, text: `Manish asks to move *Landing page copy* by +2 days · 2nd extension · −30% points. “Waiting on the offer wording, then 1 day of writing.”`, ts: T - 4 * HOUR });

  mk({ title: 'Update Meta CPL tracker', owner: 'riya', creator: 'selina', size: 'S', impact: 3, due: day(0), status: 'in_review', stage: 100, submitted: T - 6 * HOUR, proof: 'https://docs.google.com/spreadsheets/d/cpl', created: T - 4 * DAY });
  mk({ vertical: 'ops', title: 'Trainer roster for Nov', owner: 'riya', creator: 'happy', size: 'S', impact: 3, due: day(0), status: 'open', created: T - 2 * DAY, updated: T - 1 * DAY });
  mk({ title: 'Q1 influencer shortlist', owner: 'riya', creator: 'selina', size: 'M', impact: 5, reason: 'Sets up the Q1 brand push', due: day(10), status: 'open', created: T - 1 * DAY, updated: T - 1 * DAY });
  mk({ title: 'Brand video script — Gut series', owner: 'riya', creator: 'riya', reviewer: 'selina', size: 'M', impact: 3, due: day(11), status: 'open', created: T - 1 * DAY, updated: T - 1 * DAY });
  mk({ title: 'Resize posts for stories', owner: 'riya', creator: 'riya', reviewer: 'selina', size: 'S', impact: 1, reason: 'Nice to have for reach', due: day(4), status: 'in_progress', stage: 25, updated: T - 1 * DAY });
  mk({ title: 'Update hashtag bank', owner: 'riya', creator: 'riya', reviewer: 'selina', size: 'S', impact: 1, reason: 'Small reach boost', due: day(2), status: 'open', updated: T - 1 * DAY });
  mk({ title: 'Archive old Canva folders', owner: 'riya', creator: 'riya', reviewer: 'selina', size: 'S', impact: 1, reason: 'Housekeeping', due: day(35), status: 'open', updated: T - 1 * DAY });

  // Manish
  mk({ parentId: diwali.id, title: 'Email drip setup', owner: 'manish', creator: 'riya', size: 'M', impact: 3, due: day(-2), status: 'in_progress', stage: 50, updated: T - 4 * DAY });
  mk({ title: 'Diwali WhatsApp broadcast', owner: 'manish', creator: 'riya', size: 'S', impact: 5, reason: 'Direct line to 4k members', due: day(1), status: 'in_progress', stage: 25, updated: T - 1 * DAY });
  mk({ title: 'Festive offer FAQ', owner: 'manish', creator: 'riya', size: 'M', impact: 3, due: day(4), status: 'open' });
  // Ayush
  mk({ title: 'Lead magnet copy', owner: 'ayush', creator: 'satya', vertical: 'mkt', size: 'M', impact: 3, reason: 'Corporate wellness funnel', due: day(6), status: 'pending_approval', created: T - 5 * HOUR });
  const lead = s.items[s.items.length - 1];
  s.approvals.push({ id: uid('p'), type: 'cross_vertical', itemId: lead.id, requesterId: 'satya', approverIds: ['riya'], status: 'pending', payload: {}, text: 'Satya (Sales) wants to give *Lead magnet copy* to Ayush (Marketing).', ts: T - 5 * HOUR });
  mk({ vertical: 'con', title: 'Reel scripts — recovery series', owner: 'ayush', creator: 'riya', size: 'M', impact: 3, due: day(3), status: 'in_progress', stage: 50, updated: T - 6 * HOUR });
  mk({ vertical: 'con', title: 'Blog: ice bath benefits', owner: 'ayush', creator: 'ayush', reviewer: 'riya', size: 'S', impact: 3, due: day(1), status: 'in_progress', stage: 25, updated: T - 1 * DAY });
  // Anil, Subit, Abhishek
  mk({ title: 'Physio partner outreach', owner: 'anil', creator: 'selina', size: 'M', impact: 3, due: day(4), status: 'in_progress', stage: 25 });
  mk({ title: 'Community run event plan', owner: 'anil', creator: 'anil', reviewer: 'selina', size: 'L', impact: 3, due: day(12), status: 'open' });
  mk({ vertical: 'tec', title: 'Website speed fixes', owner: 'subit', creator: 'ankit', size: 'M', impact: 5, reason: 'Slow pages are losing bookings', due: day(3), status: 'in_progress', stage: 50, updated: T - 8 * HOUR });
  mk({ vertical: 'tec', title: 'Analytics dashboard for ads', owner: 'subit', creator: 'selina', size: 'M', impact: 3, due: day(1), status: 'in_progress', stage: 25, updated: T - 1 * DAY });
  mk({ title: 'Google Ads account restructure', owner: 'abhishek', creator: 'selina', size: 'L', impact: 5, reason: 'Cut wasted spend before festive peak', due: day(5), status: 'in_progress', stage: 50, updated: T - 1 * DAY });
  const oldBlog = mk({ title: 'Old blog migration', owner: 'abhishek', creator: 'ayush', size: 'M', impact: 1, reason: 'Low priority clean-up', due: day(9), status: 'open' });
  s.approvals.push({ id: uid('p'), type: 'cancel', itemId: oldBlog.id, requesterId: 'ayush', approverIds: ['selina'], status: 'pending', payload: { reason: 'New site launches in Jan — migration not needed.' }, text: 'Ayush wants to cancel *Old blog migration*: “New site launches in Jan — migration not needed.”', ts: T - 26 * HOUR });
  // Ops, Sales, HR, founders
  mk({ parentId: sops.id, vertical: 'ops', title: 'Physio screening form v2', owner: 'priya', creator: 'happy', size: 'S', impact: 3, due: day(3), status: 'in_progress', stage: 50 });
  mk({ parentId: sops.id, vertical: 'ops', title: 'Front desk opening SOP', owner: 'happy', creator: 'happy', reviewer: 'ankit', size: 'M', impact: 3, due: day(7), status: 'in_progress', stage: 25 });
  mk({ vertical: 'sal', title: 'Corporate wellness deck', owner: 'satya', creator: 'ankit', size: 'M', impact: 5, reason: 'Three corporate pitches next week', due: day(2), status: 'in_progress', stage: 50 });
  mk({ vertical: 'sal', title: 'Client follow-up list', owner: 'satya', creator: 'satya', reviewer: 'ankit', size: 'S', impact: 3, due: day(-1), status: 'in_progress', stage: 50, updated: T - 3 * DAY });
  mk({ vertical: 'hr', title: 'Payroll calendar 2027', owner: 'neha', creator: 'ankit', size: 'S', impact: 3, due: day(4), status: 'open' });
  mk({ vertical: 'ldr', title: 'Brand book rollout', owner: 'selina', creator: 'selina', reviewer: 'selina', size: 'M', impact: 5, reason: 'One look across every touchpoint', due: day(7), status: 'in_progress', stage: 50 });
  mk({ vertical: 'ldr', title: 'Investor update — November', owner: 'ankit', creator: 'ankit', reviewer: 'ankit', size: 'S', impact: 5, reason: 'Board commitment', due: day(4), status: 'open', private: true });

  /* ---------- Streams with KPIs ---------- */
  const mkStream = (title, owner, vertical, projKey, kpis, prevActuals, curActuals) => {
    const st = mk({ type: 'stream', projKey, title, owner, creator: owner === 'neha' ? 'ankit' : 'selina', vertical, size: 'L', impact: 5, reason: 'Core growth engine', status: 'in_progress', cycleLength: 'monthly', created: T - 60 * DAY });
    st.currentDeadline = null;
    st.originalDeadline = null;
    const prevStart = startOfMonth(addMonths(startOfMonth(T), -1));
    const curStart = startOfMonth(T);
    const mkCycle = (n, start, closed) => {
      const end = atTime(addDays(addMonths(start, 1), -1), '18:30');
      const c = mk({ type: 'cycle', parentId: st.id, title: `${title} · Cycle ${n}`, owner, creator: st.creatorId, reviewer: st.reviewerId, vertical, size: 'L', impact: 5, due: end, status: closed ? 'closed' : 'in_progress', created: start, method: 'stages' });
      c.cycleStart = start;
      c.verified = closed;
      if (closed) c.closedAt = end + DAY;
      return c;
    };
    const c1 = mkCycle(1, prevStart, true);
    const c2 = mkCycle(2, curStart, false);
    kpis.forEach((k, i) => {
      s.kpis.push({ id: uid('k'), itemId: c1.id, ...k, agg: k.dir === '<=' ? 'latest' : 'sum', actuals: prevActuals[i].map((v, w) => ({ id: uid('v'), weekOf: dateKey(addDays(prevStart, 7 * w + 5)), value: v, link: 'https://analytics.hbplus.in/report', by: owner, ts: addDays(prevStart, 7 * w + 5), verifiedBy: st.creatorId })) });
      s.kpis.push({ id: uid('k'), itemId: c2.id, ...k, agg: k.dir === '<=' ? 'latest' : 'sum', actuals: curActuals[i].map((v, w) => ({ id: uid('v'), weekOf: dateKey(addDays(curStart, 7 * w + 5)), value: v, link: 'https://analytics.hbplus.in/report', by: owner, ts: addDays(curStart, 7 * w + 5), verifiedBy: null })) });
    });
    scoreEvent(s, owner, c1.id, 'cycle', 'R5', baseOf(s, c1) * 0.96, `Stream cycle: Base ${baseOf(s, c1)} × 96% KPI achievement`, c1.closedAt);
    return st;
  };
  mkStream('Performance Marketing', 'riya', 'mkt', 'PM', [{ name: 'Leads', target: 400, unit: '', dir: '>=', source: 'meta', sourceMetric: 'leads' }, { name: 'Cost per lead', target: 300, unit: '₹', dir: '<=', source: 'meta', sourceMetric: 'cpl' }], [[90, 110, 95, 105], [310]], [[85], [290]]);
  mkStream('Hiring', 'neha', 'hr', 'HIR', [{ name: 'Hires closed', target: 4, unit: '', dir: '>=' }], [[1, 0, 2, 1]], [[1]]);

  // Riya's top 3 for today, planned on her last SOW
  const planned = s.sowDays.find((d) => d.userId === 'riya' && d.date === today) || { id: uid('s'), userId: 'riya', date: today, entries: [], submittedAt: null, status: null };
  const hopTask = s.items.find((i) => i.recurringId === rule.id);
  planned.top3 = [diwaliAds.id, sop.id, hopTask.id];
  planned.plannedAt = T - 2 * DAY;
  if (!s.sowDays.includes(planned)) s.sowDays.push(planned);

  /* ---------- Phase 3: goals & a past review ---------- */
  const periods = periodOptions(T);
  const thisQ = periods[0];
  const lastQ = periods.filter((p) => p.key.endsWith(':m'))[1]; // last month — fully covered by the demo history
  const goal = (userId, type, title, target, current, x = {}) => {
    const g = {
      id: uid('g'), userId, type, title, desc: x.desc || '', periodStart: x.q?.start || thisQ.start, periodEnd: x.q?.end || thisQ.end,
      measure: x.measure || 'number', dir: x.dir || '>=', target, current, unit: x.unit || '', weight: x.weight || 1, private: type === 'health',
      status: x.status || 'active', createdBy: x.by || userId, createdAt: T - 35 * DAY, lastCheckIn: T - 6 * DAY,
      checkins: [{ id: uid('gc'), ts: T - 20 * DAY, value: Math.round(current * 0.6), note: 'First check-in', by: userId }, { id: uid('gc'), ts: T - 6 * DAY, value: current, note: 'Weekly check-in', by: userId }],
    };
    s.goals.push(g);
    return g;
  };
  const leadsGoal = goal('riya', 'top', 'Grow monthly leads to 400', 400, 290, { by: 'selina', weight: 3 });
  goal('riya', 'initiative', 'Launch the HOP referral programme', 1, 0, { measure: 'done', by: 'riya', weight: 2 });
  goal('riya', 'behaviour', 'Weekly 1:1s with Manish & Ayush', 12, 7, { by: 'selina' });
  goal('riya', 'health', 'Average 8,000 steps a day', 8000, 7200, { unit: 'steps' });
  goal('riya', 'kpi', 'Cost per lead at or under ₹300', 300, 290, { dir: '<=', unit: '₹', by: 'selina' });
  goal('manish', 'top', 'Ship every Diwali landing page on time', 1, 0, { measure: 'done', by: 'riya', weight: 2 });
  goal('manish', 'behaviour', 'On-time SOW in 10 of 12 weeks', 10, 5, { by: 'riya' });
  goal('ayush', 'top', 'Publish 24 content pieces', 24, 15, { by: 'riya', weight: 2 });
  goal('ayush', 'initiative', 'Start the HB+ podcast pilot', 1, 1, { measure: 'done', status: 'achieved' });
  goal('manish', 'top', 'Set up email automation', 1, 1, { measure: 'done', q: lastQ, status: 'achieved', by: 'riya' });
  diwaliAds.goalLinks = [leadsGoal.id];
  const snap = perfSummary(s, 'manish', lastQ.start, lastQ.end);
  s.reviews.push({
    id: uid('rv'), userId: 'manish', reviewerId: 'riya', periodLabel: lastQ.label, periodStart: lastQ.start, periodEnd: lastQ.end,
    snapshot: { composite: snap.composite, components: snap.components, stats: snap.stats }, rating: 2,
    strengths: 'Owns his email work end to end; the automation set-up is now saving the team hours every week.',
    improve: 'SOW consistency — aim for on-time logging every day; flag blockers earlier instead of waiting.',
    notes: '', status: 'shared', createdAt: T - 30 * DAY, updatedAt: T - 30 * DAY, sharedAt: T - 30 * DAY,
  });

  s.channel.push({ id: uid('c'), channel: 'announce', text: '👋 HB+ Tasks is live for the pilot! Slack SOW canvases retire at the end of the pilot. Questions → #hb-tasks-help', ts: T - 14 * DAY });
  return s;
}
