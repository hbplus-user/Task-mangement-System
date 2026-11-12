import { P, POLICY_LABEL, DEFAULT_POLICY } from './policy.js';
import {
  uid, userById, itemById, firstName, nameOf, isFounder, isManager, isAbove, managerOf, mainManager, sharesVertical, ownersManager,
  reviewerFor, nextKey, children, progressOf, effectiveDeadline, allowedPauseMs, baseOf, log, notify, post, addComment, scoreEvent,
  founders, loadFor, isWorkItem, SIZE_HOURS, STAGES, DONE, IMPACT_LABEL, verticalById, can, once,
} from './core.js';
import { scoreTaskClose, reverseTaskPoints } from './scoring.js';
import { now, DAY, HOUR, fmtDT, fmtDate, atTime, addDays, startOfWeek, addMonths, startOfDay, dateKey } from '../lib/time.js';
import { weekday } from '../lib/time.js';

const err = (message) => ({ error: message });
const isUrl = (u) => /^https?:\/\/\S+\.\S+/.test((u || '').trim());

export const ACTION_LABEL = {
  accept: 'Accepted ownership',
  decline: 'Declined',
  update: 'Updated progress',
  give_assignee: 'Gave to assignee',
  assign_back: 'Assigned back to owner',
  block: 'Marked blocked',
  unblock: 'Unblocked',
  request_extension: 'Requested extension',
  submit: 'Submitted for review',
  review: 'Reviewed',
  cancel: 'Cancel',
  reopen: 'Reopened',
  change_owner: 'Change owner',
  edit: 'Edited',
  skip: 'Requested skip',
  pin: 'Pin',
  verify_cycle: 'Verified KPIs',
  flag_size: 'Flagged size/impact',
};

/* ---------- Create ---------- */
export function createItem(s, creatorId, d) {
  const type = d.type;
  if (!d.title?.trim()) return err('Give it a title.');
  if (!d.ownerId) return err('Pick one owner.');
  if (!['S', 'M', 'L'].includes(d.size)) return err('Pick a size.');
  if (![1, 3, 5].includes(+d.impact)) return err('Pick an impact.');
  if (!d.impactReason?.trim()) return err('Add a one-line reason for the impact.');
  if (type !== 'stream' && !d.deadline) return err('Set a deadline.');
  if (type === 'subtask' && !d.parentId) return err('A sub-task needs a parent task.');
  if (type === 'stream' && !(d.kpis || []).filter((k) => k.name).length) return err('A stream needs at least one KPI.');
  const owner = userById(s, d.ownerId);
  const vertical = d.vertical || owner.verticals.find((v) => v.main)?.vid || owner.verticals[0]?.vid;
  const parent = d.parentId ? itemById(s, d.parentId) : null;
  if (parent && d.deadline && parent.currentDeadline && d.deadline > effectiveDeadline(s, parent)) {
    return err(`Deadline is after the parent's deadline (${fmtDT(parent.currentDeadline)}). Extend “${parent.title}” first.`);
  }
  const t = now();
  const item = {
    id: uid('i'),
    key: nextKey(s, d.parentId, vertical),
    projKey: (type === 'project' || type === 'stream') && d.projKey ? d.projKey.toUpperCase().slice(0, 4) : null,
    type,
    parentId: d.parentId || null,
    title: d.title.trim(),
    desc: d.desc || '',
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
    progressMethod: type === 'project' || type === 'stream' ? 'subtasks' : d.progressMethod || 'stages',
    progress: 0,
    stage: 0,
    checklist: (d.checklist || []).filter(Boolean).map((text) => ({ id: uid('k'), text, done: false })),
    originalDeadline: d.deadline || null,
    currentDeadline: d.deadline || null,
    pickupDate: null,
    status: 'awaiting',
    private: !!d.private,
    pinned: !!d.pinned,
    links: (d.links || []).filter((l) => l.url),
    goalLinks: d.goalLinks || [],
    proofLinks: [],
    rating: null,
    recurringId: d.recurringId || null,
    cycleLength: type === 'stream' ? d.cycleLength || 'monthly' : null,
    pausedMs: 0,
    extensionsCount: 0,
    createdAt: t,
    assignedAt: t,
    lastUpdateAt: t,
  };
  s.items.push(item);
  log(s, creatorId, item.id, 'Created', null, `${item.key} · owner ${nameOf(s, item.ownerId)}`);
  if (d.comment) addComment(s, creatorId, item.id, d.comment, 'Created');

  const self = creatorId === d.ownerId;
  const crossVertical = !self && P(s, 'crossVerticalApproval') && !sharesVertical(s, creatorId, d.ownerId) && !isFounder(s, creatorId);
  const result = { id: item.id, warnings: [] };
  if (crossVertical) {
    item.status = 'pending_approval';
    const mgr = managerOf(s, d.ownerId, vertical);
    requestApproval(s, 'cross_vertical', item, creatorId, [mgr], {}, `${firstName(s, creatorId)} wants to give *${item.title}* to ${firstName(s, d.ownerId)} (${verticalById(s, vertical)?.name}).`);
    result.warnings.push(`Sent to ${firstName(s, mgr)} for approval — different vertical.`);
  } else if (self || !P(s, 'acceptToOwn') || d.autoAccept) {
    item.status = 'open';
    item.acceptedAt = t;
    // Self-created: the owner's manager (the reviewer) confirms size & impact (PRD §6).
    if (self && item.reviewerId !== creatorId && !d.recurringId && !d.setup && (type === 'task' || type === 'subtask')) {
      requestApproval(s, 'self_review', item, creatorId, [item.reviewerId], { size: item.size, impact: item.impact },
        `${firstName(s, creatorId)} created *${item.title}* for themselves — size ${item.size}, impact ${item.impact} (“${item.impactReason}”). Confirm or adjust.`);
    }
  } else {
    sendAssignedDM(s, item);
  }
  if (type === 'stream') {
    startCycle(s, item, startOfDay(t), d.kpis || []);
  }
  // Red-load warning (F2)
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
    `Hi ${firstName(s, item.ownerId)} 👋 ${firstName(s, item.creatorId)} has trusted you with *${item.title}* (Impact: ${IMPACT_LABEL[item.impact]} · Due ${fmtDT(item.currentDeadline)}). Tap Accept to own it, or Discuss if anything's unclear.`,
    { itemId: item.id, buttons: ['accept', 'decline', 'open'] }
  );
  notify(s, ownersManager(s, item), `${firstName(s, item.creatorId)} assigned *${item.title}* to ${firstName(s, item.ownerId)}.`, { itemId: item.id, mode: 'digest', exclude: [item.creatorId] });
}

/* ---------- Streams & cycles ---------- */
const CYCLE_DAYS = { weekly: 7, fortnightly: 14 };
export function cycleEnd(start, length) {
  if (CYCLE_DAYS[length]) return atTime(addDays(start, CYCLE_DAYS[length] - 1), '18:30');
  const months = length === 'quarterly' ? 3 : 1;
  return atTime(addDays(addMonths(start, months), -1), '18:30');
}
export function startCycle(s, stream, start, kpiTemplates) {
  const n = children(s, stream.id).filter((c) => c.type === 'cycle').length + 1;
  const end = cycleEnd(start, stream.cycleLength);
  const c = {
    ...stream,
    id: uid('i'),
    key: nextKey(s, stream.id, stream.vertical),
    projKey: null,
    type: 'cycle',
    parentId: stream.id,
    title: `${stream.title} · Cycle ${n}`,
    desc: '',
    status: 'in_progress',
    progressMethod: 'stages',
    stage: 0,
    checklist: [],
    links: [],
    originalDeadline: end,
    currentDeadline: end,
    cycleStart: start,
    createdAt: now(),
    acceptedAt: now(),
    lastUpdateAt: now(),
    verified: false,
  };
  s.items.push(c);
  for (const k of kpiTemplates.filter((k) => k.name)) {
    s.kpis.push({ id: uid('k'), itemId: c.id, name: k.name, target: +k.target, unit: k.unit || '', dir: k.dir || '>=', agg: k.agg || (k.dir === '<=' ? 'latest' : 'sum'), source: k.source || 'manual', sourceMetric: k.sourceMetric || null, actuals: [] });
  }
  log(s, null, c.id, 'Cycle started', null, `${fmtDate(start)} → ${fmtDate(end)}`);
  return c;
}
export function kpiActual(k) {
  if (!k.actuals.length) return null;
  if (k.agg === 'latest') return k.actuals[k.actuals.length - 1].value;
  return k.actuals.reduce((a, x) => a + +x.value, 0);
}
export function kpiAchievement(s, k) {
  const a = kpiActual(k);
  if (a == null || !k.target) return 0;
  const raw = k.dir === '<=' ? (a <= 0 ? 1 : k.target / a) : a / k.target;
  return Math.min(raw, P(s, 'kpiCap') / 100);
}
export function cycleAchievement(s, cycle) {
  const ks = s.kpis.filter((k) => k.itemId === cycle.id);
  if (!ks.length) return 0;
  return ks.reduce((a, k) => a + kpiAchievement(s, k), 0) / ks.length;
}
export function enterKpiActual(s, userId, kpiId, value, link, weekOf) {
  const k = s.kpis.find((x) => x.id === kpiId);
  const cycle = itemById(s, k.itemId);
  if (cycle.ownerId !== userId && !isFounder(s, userId)) return err('Only the stream owner enters actuals.');
  if (value === '' || isNaN(+value)) return err('Enter a number.');
  if (!isUrl(link)) return err('Add a source link (Zoho, Meta Ads, sheet…).');
  k.actuals.push({ id: uid('v'), weekOf: weekOf || dateKey(now()), value: +value, link, by: userId, ts: now(), verifiedBy: null });
  cycle.lastUpdateAt = now();
  cycle.stage = Math.min(100, Math.round(cycleAchievement(s, cycle) * 100));
  log(s, userId, cycle.id, `KPI actual: ${k.name}`, null, `${value}${k.unit}`);
  return { ok: true };
}

/* ---------- Approvals ---------- */
export function requestApproval(s, type, item, requesterId, approverIds, payload, text) {
  const ap = { id: uid('p'), type, itemId: item?.id || null, requesterId, approverIds: [...new Set(approverIds.filter(Boolean))], status: 'pending', payload, text, ts: now() };
  if (!ap.approverIds.length) ap.approverIds = founders(s);
  s.approvals.push(ap);
  notify(s, ap.approverIds, `Approval needed: ${text}`, { itemId: item?.id, approvalId: ap.id, buttons: ['approve', 'reject', 'open'], kind: 'approval', exclude: [requesterId] });
  return ap;
}
export const pendingFor = (s, item, type) => s.approvals.find((a) => a.itemId === item.id && a.type === type && a.status === 'pending');
export const canDecide = (s, userId, ap) => ap.status === 'pending' && (ap.approverIds.includes(userId) || isFounder(s, userId)) && ap.requesterId !== userId;
export const approvalsFor = (s, userId) => s.approvals.filter((a) => canDecide(s, userId, a));

export const APPROVAL_LABEL = {
  cross_vertical: 'Cross-vertical',
  extension: 'Extension',
  owner_change: 'Owner change',
  cancel: 'Cancel',
  skip: 'Skip occurrence',
  blocked_extra: 'Blocked > 3 days',
  setup: 'Setup sprint',
  self_review: 'Confirm size & impact',
};

export function decideApproval(s, userId, apId, approve, comment, changes = {}) {
  const ap = s.approvals.find((a) => a.id === apId);
  if (!ap || !canDecide(s, userId, ap)) return err('This approval is no longer waiting on you.');
  if (P(s, 'commentRequired') && !comment?.trim()) return err('Add a short comment with your decision.');
  ap.status = approve ? 'approved' : 'rejected';
  ap.decidedBy = userId;
  ap.decidedAt = now();
  ap.comment = comment;
  const item = ap.itemId ? itemById(s, ap.itemId) : null;
  const who = firstName(s, userId);
  if (item) {
    log(s, userId, item.id, `${APPROVAL_LABEL[ap.type]} ${approve ? 'approved' : 'rejected'}`);
    addComment(s, userId, item.id, comment, `${approve ? 'Approved' : 'Rejected'}: ${APPROVAL_LABEL[ap.type]}`);
  }
  const b = item ? baseOf(s, item) : 0;
  switch (ap.type) {
    case 'cross_vertical':
      if (approve) {
        item.status = 'awaiting';
        item.assignedAt = now();
        item.rejected = null;
        sendAssignedDM(s, item);
        notify(s, item.creatorId, `${who} approved giving *${item.title}* to ${firstName(s, item.ownerId)}.`, { itemId: item.id });
      } else {
        item.rejected = { by: userId, reason: comment };
        notify(s, item.creatorId, `${who} didn't approve *${item.title}* for ${firstName(s, item.ownerId)}: “${comment}”. Pick another owner or cancel it.`, { itemId: item.id });
      }
      break;
    case 'extension':
      if (approve) {
        const old = item.currentDeadline;
        item.currentDeadline = ap.payload.newDeadline;
        item.extensionsCount = (item.extensionsCount || 0) + 1;
        log(s, userId, item.id, 'Deadline extended', fmtDT(old), fmtDT(item.currentDeadline));
        const notes = [];
        if (ap.payload.noticeH < P(s, 'freeExtNoticeH')) {
          const pts = -b * P(s, 'extLateNotice');
          scoreEvent(s, item.ownerId, item.id, 'extension', 'P4', pts, `Extension asked less than ${P(s, 'freeExtNoticeH')}h before deadline`);
          notes.push(`${pts} pts (short notice)`);
        }
        if (ap.payload.nth > P(s, 'freeExtensions')) {
          const pts = -b * P(s, 'extRepeat');
          scoreEvent(s, item.ownerId, item.id, 'extension', 'P5', pts, `Extension #${ap.payload.nth} on this task`);
          notes.push(`${pts} pts (extension #${ap.payload.nth})`);
        }
        notify(s, item.ownerId, `✅ Extension approved for *${item.title}* — new deadline ${fmtDT(item.currentDeadline)}${notes.length ? ' · ' + notes.join(', ') : ' · no points lost'}.`, { itemId: item.id });
      } else {
        notify(s, item.ownerId, `${who} couldn't approve the extension on *${item.title}*: “${comment}”. Deadline stays ${fmtDT(item.currentDeadline)}.`, { itemId: item.id });
      }
      break;
    case 'owner_change':
      if (approve) {
        const old = item.ownerId;
        item.ownerId = ap.payload.newOwnerId;
        item.assigneeId = null;
        item.prevStatus = ['awaiting', 'pending_approval'].includes(item.status) ? null : item.status;
        item.status = 'awaiting';
        item.assignedAt = now();
        item.declined = null;
        item.reviewerId = reviewerFor(s, item.creatorId, item.ownerId, item.vertical);
        log(s, userId, item.id, 'Owner changed', nameOf(s, old), nameOf(s, item.ownerId));
        sendAssignedDM(s, item);
        notify(s, old, `*${item.title}* has moved to ${firstName(s, item.ownerId)}. Points you already earned on it stay with you.`, { itemId: item.id });
      }
      break;
    case 'cancel':
      if (approve) doCancel(s, userId, item, ap.payload.reason);
      else notify(s, ap.requesterId, `${who} kept *${item.title}* open: “${comment}”.`, { itemId: item.id });
      break;
    case 'skip':
      if (approve) {
        item.status = 'skipped';
        log(s, userId, item.id, 'Status', 'open', 'skipped');
        notify(s, item.ownerId, `This occurrence of *${item.title}* is skipped. No penalty.`, { itemId: item.id });
      }
      break;
    case 'blocked_extra':
      if (approve) {
        item.blockedApprovedDays = (item.blockedApprovedDays || 0) + 1;
        notify(s, item.ownerId, `${who} approved one more paused day on *${item.title}*. The deadline clock stays paused.`, { itemId: item.id });
      } else {
        notify(s, item.ownerId, `${who} didn't extend the pause on *${item.title}* — the clock is running again. Let's find a way around the block.`, { itemId: item.id });
      }
      break;
    case 'self_review':
      if (approve) {
        for (const k of ['size', 'impact']) {
          if (changes[k] != null && changes[k] !== item[k]) {
            log(s, userId, item.id, `Manager set ${k}`, item[k], changes[k]);
            item[k] = changes[k];
          }
        }
        if (changes.size && changes.size !== ap.payload.size) item.estHours = { S: 4, M: 16, L: 40 }[changes.size];
        ap.payload.confirmedSize = item.size;
        ap.payload.confirmedImpact = item.impact;
        item.sizeConfirmedBy = userId;
        notify(s, item.ownerId, `${who} confirmed *${item.title}* at size ${item.size} · impact ${item.impact}.`, { itemId: item.id, mode: 'digest' });
      }
      break;
    case 'setup': {
      const ids = ap.payload.itemIds || [];
      for (const id of ids) {
        const it = itemById(s, id);
        if (!it || it.status !== 'pending_approval') continue;
        if (approve) {
          it.status = (it.stage || 0) > 0 ? 'in_progress' : 'open';
          it.acceptedAt = now();
          log(s, userId, it.id, 'Setup sprint approved', 'Pending approval', it.status);
        } else {
          it.status = 'cancelled';
          it.cancelReason = `Setup list sent back: ${comment}`;
          it.closedAt = now();
          log(s, userId, it.id, 'Setup sprint sent back', 'Pending approval', 'cancelled');
        }
      }
      notify(s, ap.requesterId, approve ? `✅ ${who} approved your setup list (${ids.length} tasks). They're on your board now.` : `${who} sent your setup list back: “${comment}”. Please re-add the tasks with the changes.`, { buttons: ['open'] });
      break;
    }
    default:
  }
  if (!['cross_vertical', 'extension', 'setup', 'self_review'].includes(ap.type) && ap.requesterId) {
    notify(s, ap.requesterId, `${who} ${approve ? 'approved' : 'rejected'} your ${APPROVAL_LABEL[ap.type].toLowerCase()} request${item ? ` on *${item.title}*` : ''}.`, { itemId: item?.id, exclude: [item?.ownerId] });
  }
  return { ok: true };
}

/* ---------- Permissions ---------- */
export function canCancelDirect(s, userId, item) {
  return isFounder(s, userId) || ownersManager(s, item) === userId || (item.creatorId === userId && isManager(s, userId));
}
export function canEditSizeImpact(s, userId, item) {
  return isFounder(s, userId) || item.creatorId === userId || ownersManager(s, item) === userId;
}
export function allowedActions(s, userId, item) {
  if (!item) return [];
  const st = item.status;
  const owner = item.ownerId === userId;
  const assignee = item.assigneeId === userId;
  const F = isFounder(s, userId);
  const om = ownersManager(s, item) === userId;
  const creator = item.creatorId === userId;
  const working = ['open', 'in_progress'].includes(st);
  const container = item.type === 'project' || item.type === 'stream';
  const a = [];
  if (st === 'awaiting' && owner && !item.declined) a.push('accept', 'decline');
  if (working && (owner || assignee) && item.type !== 'stream') a.push('update');
  if (working && owner && !item.assigneeId && !container) a.push('give_assignee');
  if (item.assigneeId && (owner || assignee) && [...['open', 'in_progress', 'blocked']].includes(st)) a.push('assign_back');
  if (working && (owner || assignee) && !container) a.push('block');
  if (st === 'blocked' && (owner || assignee || item.blockedBy === userId || F)) a.push('unblock');
  if (['open', 'in_progress', 'blocked'].includes(st) && owner && item.currentDeadline && !pendingFor(s, item, 'extension')) a.push('request_extension');
  if (working && owner && !container && item.type !== 'cycle') a.push('submit');
  if (st === 'in_review' && (item.reviewerId === userId || F)) a.push('review');
  if (item.type === 'cycle' && !item.verified && item.currentDeadline < now() && (om || F || isAbove(s, userId, item.ownerId))) a.push('verify_cycle');
  if (!DONE.includes(st) && (canCancelDirect(s, userId, item) || creator) && !pendingFor(s, item, 'cancel') && item.type !== 'cycle') a.push('cancel');
  if (['closed', 'cancelled'].includes(st) && (item.reviewerId === userId || om || F)) a.push('reopen');
  if (!DONE.includes(st) && (creator || om || F) && !pendingFor(s, item, 'owner_change') && item.type !== 'cycle') a.push('change_owner');
  if (creator || owner || om || F) a.push('edit');
  if (owner && !canEditSizeImpact(s, userId, item) && !DONE.includes(st)) a.push('flag_size');
  if (item.recurringId && owner && ['awaiting', 'open', 'in_progress'].includes(st) && !pendingFor(s, item, 'skip')) a.push('skip');
  if ((om || F || isAbove(s, userId, item.ownerId)) && !DONE.includes(st)) a.push('pin');
  return a;
}

/* ---------- Perform an action ---------- */
export function perform(s, userId, itemId, action, payload = {}) {
  const item = itemById(s, itemId);
  if (!item) return err('Task not found.');
  if (!allowedActions(s, userId, item).includes(action)) return err("That action isn't available to you on this task right now.");
  const comment = (payload.comment || '').trim();
  const needsComment = !['pin', 'edit'].includes(action);
  if (needsComment && P(s, 'commentRequired') && !comment) return err('Add a short comment — every action needs one.');
  const who = firstName(s, userId);
  const t = now();
  const b = baseOf(s, item);
  const om = ownersManager(s, item);
  let label = ACTION_LABEL[action];

  switch (action) {
    case 'accept': {
      item.status = item.prevStatus || 'open';
      item.prevStatus = null;
      item.acceptedAt = t;
      item.lastUpdateAt = t;
      log(s, userId, item.id, 'Accepted ownership', 'Awaiting acceptance', 'Open');
      if (t - (item.assignedAt || item.createdAt) <= P(s, 'fastAcceptH') * HOUR) {
        scoreEvent(s, userId, item.id, 'fast_accept', 'R9', P(s, 'fastAcceptBonus'), `Accepted within ${P(s, 'fastAcceptH')} hours`);
      }
      notify(s, item.creatorId, `🙌 ${who} accepted *${item.title}* and owns it now. Due ${fmtDT(item.currentDeadline)}.`, { itemId: item.id, exclude: [userId] });
      notify(s, om, `${who} accepted *${item.title}*.`, { itemId: item.id, mode: 'digest', exclude: [userId, item.creatorId] });
      break;
    }
    case 'decline': {
      item.declined = { by: userId, reason: comment, at: t };
      log(s, userId, item.id, 'Declined ownership');
      notify(s, item.creatorId, `${who} can't take *${item.title}*: “${comment}”. Pick another owner from the task page.`, { itemId: item.id, buttons: ['open'] });
      notify(s, om, `${who} declined *${item.title}*.`, { itemId: item.id, mode: 'digest' });
      break;
    }
    case 'update': {
      const before = progressOf(s, item);
      if (payload.checklist && item.progressMethod === 'checklist') item.checklist = payload.checklist;
      if (payload.stage != null && item.progressMethod === 'stages') item.stage = Math.min(75, +payload.stage);
      if (payload.progress != null) item.progress = +payload.progress;
      if (payload.pickupDate) item.pickupDate = payload.pickupDate;
      const after = progressOf(s, item);
      if (item.status === 'open' && (after > 0 || payload.started)) item.status = 'in_progress';
      if (item.status === 'open' && after === 0) item.status = 'in_progress';
      item.lastUpdateAt = t;
      log(s, userId, item.id, 'Progress', `${before}%`, `${after}%`);
      label = `Updated progress ${before}% → ${after}%`;
      notify(s, [item.creatorId, om], `${who} moved *${item.title}* to ${after}%: “${comment.slice(0, 100)}”`, { itemId: item.id, mode: 'digest', critical: false, exclude: [userId] });
      break;
    }
    case 'give_assignee': {
      if (!payload.assigneeId || payload.assigneeId === item.ownerId) return err('Pick a colleague to hand this to.');
      item.assigneeId = payload.assigneeId;
      log(s, userId, item.id, 'Assignee', null, nameOf(s, payload.assigneeId));
      label = `Gave to ${firstName(s, payload.assigneeId)}`;
      notify(s, payload.assigneeId, `${who} handed you part of *${item.title}*: “${comment}”. Assign it back when your part is done.`, { itemId: item.id, buttons: ['update', 'open'] });
      break;
    }
    case 'assign_back': {
      const was = item.assigneeId;
      item.assigneeId = null;
      item.lastUpdateAt = t;
      log(s, userId, item.id, 'Assigned back', nameOf(s, was), nameOf(s, item.ownerId));
      notify(s, [item.ownerId, was], `*${item.title}* is back with ${firstName(s, item.ownerId)}: “${comment}”`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case 'block': {
      if (!payload.blockedBy) return err('Who is it blocked by?');
      if (payload.blockedBy === userId) return err("You can't be blocked by yourself.");
      item.prevStatus = item.status;
      item.status = 'blocked';
      item.blockedBy = payload.blockedBy;
      item.blockedReason = comment;
      item.blockedAt = t;
      item.blockedApprovedDays = 0;
      log(s, userId, item.id, 'Blocked', null, `by ${nameOf(s, payload.blockedBy)}`);
      label = `Marked blocked by ${firstName(s, payload.blockedBy)}`;
      notify(s, payload.blockedBy, `${who} is blocked on *${item.title}* and needs you: “${comment}”. Unblocking within ${P(s, 'unblockWithinH')}h earns +${P(s, 'unblockBonus')}.`, { itemId: item.id, buttons: ['unblock', 'open'] });
      notify(s, [mainManager(s, payload.blockedBy), om], `${who} is blocked on *${item.title}* by ${firstName(s, payload.blockedBy)}: “${comment}”`, { itemId: item.id, exclude: [payload.blockedBy, userId] });
      break;
    }
    case 'unblock': {
      const held = t - item.blockedAt;
      item.pausedMs = (item.pausedMs || 0) + Math.min(held, allowedPauseMs(s, item));
      if (userId === item.blockedBy && held <= P(s, 'unblockWithinH') * HOUR) {
        scoreEvent(s, userId, item.id, 'unblock', 'R8', P(s, 'unblockBonus'), `Unblocked ${firstName(s, item.ownerId)} within ${P(s, 'unblockWithinH')}h`);
      }
      item.status = item.prevStatus || 'in_progress';
      item.prevStatus = null;
      log(s, userId, item.id, 'Unblocked', `by ${nameOf(s, item.blockedBy)}`, null);
      for (const ap of s.approvals.filter((a) => a.itemId === item.id && a.type === 'blocked_extra' && a.status === 'pending')) ap.status = 'closed';
      item.blockedBy = null;
      item.blockedAt = null;
      item.lastUpdateAt = t;
      notify(s, [item.ownerId, item.assigneeId], `🔓 *${item.title}* is unblocked: “${comment}”. The deadline clock is running again.`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case 'request_extension': {
      const nd = payload.newDeadline;
      if (!nd || nd <= item.currentDeadline) return err('Pick a new deadline after the current one.');
      const parent = item.parentId ? itemById(s, item.parentId) : null;
      if (parent?.currentDeadline && nd > effectiveDeadline(s, parent)) {
        notify(s, parent.ownerId, `${who} needs *${item.title}* to go past the ${parent.type} deadline (${fmtDT(parent.currentDeadline)}). Extend *${parent.title}* first if that's okay.`, { itemId: parent.id });
        return err(`That's after “${parent.title}” ends (${fmtDT(parent.currentDeadline)}). The ${parent.type} needs extending first — ${firstName(s, parent.ownerId)} has been told.`);
      }
      const noticeH = (effectiveDeadline(s, item) - t) / HOUR;
      const nth = (item.extensionsCount || 0) + 1;
      const mode = P(s, 'extensionApprover');
      let approvers = mode === 'creator' ? [item.creatorId] : mode === 'manager' ? [om] : [item.creatorId, om];
      approvers = approvers.filter((x) => x && x !== userId);
      if (!approvers.length) approvers = [om || founders(s)[0]];
      const cost = [];
      if (noticeH < P(s, 'freeExtNoticeH')) cost.push(`−${P(s, 'extLateNotice') * 100}% (short notice)`);
      if (nth > P(s, 'freeExtensions')) cost.push(`−${P(s, 'extRepeat') * 100}% (extension #${nth})`);
      requestApproval(s, 'extension', item, userId, approvers, { newDeadline: nd, oldDeadline: item.currentDeadline, noticeH, nth, cost }, `${who} asks to move *${item.title}* from ${fmtDT(item.currentDeadline)} to ${fmtDT(nd)}${cost.length ? ` · ${cost.join(', ')} of Base` : ' · free extension'}. “${comment}”`);
      label = `Requested extension to ${fmtDT(nd)}`;
      break;
    }
    case 'submit': {
      if (!isUrl(payload.proofLink)) return err('Add a proof link (Google Doc, Drive, Canva…) — it starts with https://');
      item.status = 'in_review';
      item.submittedAt = t;
      item.deadlineAtSubmit = effectiveDeadline(s, item);
      item.proofLinks = [...(item.proofLinks || []), payload.proofLink.trim()];
      if (item.progressMethod === 'stages') item.stage = 100;
      item.lastUpdateAt = t;
      log(s, userId, item.id, 'Status', 'In progress', 'In review');
      const early = item.deadlineAtSubmit - t;
      const when = early >= DAY ? `${Math.floor(early / DAY)}d early` : early >= 0 ? 'on time' : 'after the deadline';
      notify(s, item.reviewerId, `📬 ${who} submitted *${item.title}* for your review (${when}). Proof: ${payload.proofLink}`, { itemId: item.id, buttons: ['review', 'open'] });
      if (item.recurringId) {
        const rule = s.recurring.find((r) => r.id === item.recurringId);
        if (rule && early >= 0) rule.consecutiveMisses = 0;
      }
      break;
    }
    case 'review': {
      if (payload.decision === 'send_back') {
        item.status = 'in_progress';
        item.submittedAt = null;
        item.deadlineAtSubmit = null;
        if (item.progressMethod === 'stages') item.stage = 75;
        log(s, userId, item.id, 'Sent back', 'In review', 'In progress');
        label = 'Sent back';
        notify(s, item.ownerId, `${who} sent *${item.title}* back for a few changes: “${comment}”. The deadline clock is running again.`, { itemId: item.id });
        break;
      }
      const rating = +payload.rating;
      if (![1, 2, 3].includes(rating)) return err('Give a quality rating (1–3 ★).');
      if ((rating === 1 || rating === 3) && !comment) return err('Add a one-line reason for 1★ or 3★.');
      label = `Accepted with ${rating}★`;
      closeWithRating(s, item, rating, userId);
      break;
    }
    case 'verify_cycle': {
      const ach = cycleAchievement(s, item);
      for (const k of s.kpis.filter((k) => k.itemId === item.id)) for (const a of k.actuals) a.verifiedBy = a.verifiedBy || userId;
      item.verified = true;
      item.status = 'closed';
      item.closedAt = t;
      const pts = b * ach;
      scoreEvent(s, item.ownerId, item.id, 'cycle', 'R5', pts, `Stream cycle: Base ${b} × ${Math.round(ach * 100)}% KPI achievement`);
      log(s, userId, item.id, 'KPIs verified', null, `${Math.round(ach * 100)}%`);
      notify(s, item.ownerId, `📈 ${who} verified *${item.title}* — ${Math.round(ach * 100)}% KPI achievement, +${Math.round(pts * 10) / 10} points.`, { itemId: item.id });
      break;
    }
    case 'cancel': {
      if (canCancelDirect(s, userId, item)) doCancel(s, userId, item, comment);
      else {
        requestApproval(s, 'cancel', item, userId, [om], { reason: comment }, `${who} wants to cancel *${item.title}*: “${comment}”`);
        notify(s, [item.ownerId, item.assigneeId], `${who} asked to cancel *${item.title}* — waiting on ${firstName(s, om)}.`, { itemId: item.id, exclude: [userId] });
        label = 'Requested cancel';
      }
      break;
    }
    case 'reopen': {
      const from = item.status;
      reverseTaskPoints(s, item);
      item.status = 'in_progress';
      item.rating = null;
      item.closedAt = null;
      item.submittedAt = null;
      item.deadlineAtSubmit = null;
      if (item.progressMethod === 'stages') item.stage = 75;
      item.lastUpdateAt = t;
      log(s, userId, item.id, 'Reopened', from, 'in_progress');
      notify(s, [item.ownerId, om], `↩️ ${who} reopened *${item.title}*: “${comment}”. Points are on hold until it's re-submitted.`, { itemId: item.id, exclude: [userId] });
      break;
    }
    case 'change_owner': {
      const nid = payload.newOwnerId;
      if (!nid || nid === item.ownerId) return err('Pick the new owner.');
      if (['awaiting', 'pending_approval'].includes(item.status)) {
        // Not yet owned — reassign straight away (cross-vertical rule still applies).
        const old = item.ownerId;
        item.ownerId = nid;
        item.declined = null;
        item.rejected = null;
        item.reviewerId = reviewerFor(s, item.creatorId, nid, item.vertical);
        if (!userById(s, nid).verticals.some((v) => v.vid === item.vertical)) item.vertical = userById(s, nid).verticals.find((v) => v.main)?.vid;
        item.assignedAt = t;
        log(s, userId, item.id, 'Owner', nameOf(s, old), nameOf(s, nid));
        label = `Reassigned to ${firstName(s, nid)}`;
        if (P(s, 'crossVerticalApproval') && !sharesVertical(s, item.creatorId, nid) && !isFounder(s, item.creatorId) && item.creatorId !== nid) {
          item.status = 'pending_approval';
          requestApproval(s, 'cross_vertical', item, userId, [managerOf(s, nid, item.vertical)], {}, `${who} wants to give *${item.title}* to ${firstName(s, nid)}.`);
        } else if (item.creatorId === nid) {
          item.status = 'open';
          item.acceptedAt = t;
        } else {
          item.status = 'awaiting';
          sendAssignedDM(s, item);
        }
      } else {
        const newMgr = managerOf(s, nid, item.vertical);
        requestApproval(s, 'owner_change', item, userId, [newMgr], { newOwnerId: nid }, `${who} wants to move *${item.title}* from ${firstName(s, item.ownerId)} to ${firstName(s, nid)}. “${comment}”`);
        label = `Requested owner change to ${firstName(s, nid)}`;
      }
      break;
    }
    case 'edit': {
      const fields = ['title', 'desc', 'links', 'checklist', 'private', 'contributors', 'goalLinks'];
      if (canEditSizeImpact(s, userId, item)) fields.push('size', 'impact', 'impactReason', 'estHours');
      if (payload.private != null && item.creatorId !== userId) delete payload.private;
      for (const f of fields) {
        if (payload[f] === undefined) continue;
        const before = JSON.stringify(item[f]);
        const after = JSON.stringify(payload[f]);
        if (before !== after) {
          log(s, userId, item.id, `Edited ${f}`, typeof item[f] === 'object' ? null : item[f], typeof payload[f] === 'object' ? null : payload[f]);
          item[f] = payload[f];
        }
      }
      if (comment) addComment(s, userId, item.id, comment, 'Edited');
      notify(s, [item.creatorId, om, item.ownerId], `${who} edited *${item.title}*.`, { itemId: item.id, mode: 'digest', critical: false, exclude: [userId] });
      return { ok: true };
    }
    case 'flag_size': {
      log(s, userId, item.id, 'Flagged size/impact', null, comment);
      notify(s, [item.creatorId, om], `${who} thinks the size/impact on *${item.title}* needs another look: “${comment}”`, { itemId: item.id });
      break;
    }
    case 'skip': {
      requestApproval(s, 'skip', item, userId, [om], {}, `${who} asks to skip this occurrence of *${item.title}* (${fmtDate(item.currentDeadline)}): “${comment}”`);
      break;
    }
    case 'pin': {
      item.pinned = !item.pinned;
      log(s, userId, item.id, item.pinned ? 'Pinned by manager' : 'Unpinned');
      if (item.pinned) notify(s, item.ownerId, `📌 ${who} pinned *${item.title}* — it'll rank higher in your top 3.`, { itemId: item.id, mode: 'digest' });
      return { ok: true };
    }
    default:
      return err('Unknown action.');
  }
  if (comment) addComment(s, userId, item.id, comment, label);
  return { ok: true };
}

export function closeWithRating(s, item, rating, deciderId, system = false) {
  item.status = 'closed';
  item.rating = rating;
  item.closedAt = now();
  log(s, deciderId, item.id, system ? 'Auto-accepted (no review in time)' : 'Accepted', 'In review', `Closed ${rating}★`);
  const r = scoreTaskClose(s, item);
  const total = Math.round((r.pts + r.latePts) * 10) / 10;
  const when = r.when === 'late' ? 'submitted late' : r.when;
  notify(
    s,
    item.ownerId,
    r.when === 'late'
      ? `*${item.title}* is closed — ${rating}★, ${when}. ${total >= 0 ? '+' : ''}${total} points. Thanks for seeing it through.`
      : `✅ *${item.title}* accepted — ${rating}★ and ${when}! +${total} points. Beautiful ownership.`,
    { itemId: item.id }
  );
  checkProjectClose(s, item.parentId);
  return r;
}

export function doCancel(s, userId, item, reason) {
  const from = item.status;
  item.status = 'cancelled';
  item.cancelReason = reason;
  item.closedAt = now();
  log(s, userId, item.id, 'Cancelled', from, 'cancelled');
  notify(s, [item.ownerId, item.assigneeId, item.creatorId, ownersManager(s, item)], `*${item.title}* was cancelled by ${firstName(s, userId)}: “${reason}”. No points either way.`, { itemId: item.id, exclude: [userId] });
  checkProjectClose(s, item.parentId);
}

export function checkProjectClose(s, projectId) {
  const p = projectId ? itemById(s, projectId) : null;
  if (!p) return;
  if (p.type === 'task') return checkProjectClose(s, p.parentId);
  if (p.type !== 'project' || DONE.includes(p.status) || !['open', 'in_progress'].includes(p.status)) return;
  const kids = children(s, p.id);
  if (!kids.length || !kids.every((k) => DONE.includes(k.status)) || !kids.some((k) => k.status === 'closed')) return;
  p.status = 'closed';
  p.closedAt = now();
  const b = baseOf(s, p);
  const onTime = p.closedAt <= effectiveDeadline(s, p);
  if (onTime) {
    scoreEvent(s, p.ownerId, p.id, 'project', 'R4', b * P(s, 'projectOnTimeBonus'), `Project closed on time: +project Base ${b}`);
    notify(s, p.ownerId, `🎉 Project *${p.title}* closed on time! +${b * P(s, 'projectOnTimeBonus')} points. Great job steering it home.`, { itemId: p.id });
  } else {
    scoreEvent(s, p.ownerId, p.id, 'project', 'P10', -b * P(s, 'projectLate'), `Project closed after its deadline: −${P(s, 'projectLate') * 100}% of Base ${b}`);
    notify(s, p.ownerId, `Project *${p.title}* is fully closed — a bit after its deadline. Worth a quick look at what slowed it down.`, { itemId: p.id });
  }
  log(s, null, p.id, 'Project closed', null, onTime ? 'on time' : 'late');
}

/* ---------- Recurring ---------- */
export const FREQ_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', custom: 'Every N days' };
export function advanceRun(rule, ts) {
  if (rule.freq === 'daily') {
    let n = addDays(ts, 1);
    if (weekday(n) === 0) n = addDays(n, 1);
    return n;
  }
  if (rule.freq === 'weekly') return addDays(ts, 7);
  if (rule.freq === 'monthly') return addMonths(ts, 1);
  if (rule.freq === 'quarterly') return addMonths(ts, 3);
  return addDays(ts, Math.max(1, rule.everyDays || 7));
}
export function createRecurringRule(s, creatorId, d) {
  const rule = {
    id: uid('r'),
    template: { ...d, type: 'task' },
    freq: d.freq || 'weekly',
    everyDays: +d.everyDays || 7,
    dueAfterDays: d.dueAfterDays != null ? +d.dueAfterDays : { daily: 0, weekly: 5, monthly: 7, quarterly: 14, custom: 3 }[d.freq || 'weekly'],
    ownerId: d.ownerId,
    creatorId,
    nextRun: atTime(d.firstRun || now(), '09:00'),
    active: true,
    consecutiveMisses: 0,
    createdAt: now(),
  };
  if (rule.nextRun < startOfDay(now())) rule.nextRun = atTime(now(), '09:00');
  s.recurring.push(rule);
  return runRecurring(s, rule);
}
export function runRecurring(s, rule) {
  let first = null;
  let guard = 0;
  while (rule.active && rule.nextRun <= now() + 60 * 1000 && guard++ < 30) {
    // An earlier occurrence still not submitted when the next one is created = missed (P9).
    for (const prev of s.items.filter((i) => i.recurringId === rule.id && ['awaiting', 'open', 'in_progress', 'blocked'].includes(i.status) && !i.missFlag && i.currentDeadline < rule.nextRun)) {
      prev.missFlag = true;
      scoreEvent(s, prev.ownerId, prev.id, 'recurring_missed', 'P9', -baseOf(s, prev) * P(s, 'recurringMissed'), 'Recurring occurrence missed');
      rule.consecutiveMisses = (rule.consecutiveMisses || 0) + 1;
      if (rule.consecutiveMisses >= 2) {
        notify(s, ownersManager(s, prev), `${firstName(s, prev.ownerId)} has missed *${rule.template.title}* twice in a row. A quick chat might help.`, { itemId: prev.id });
      }
    }
    const deadline = atTime(addDays(rule.nextRun, rule.dueAfterDays), P(s, 'defaultDeadlineTime'));
    const res = createItem(s, rule.creatorId, { ...rule.template, deadline, recurringId: rule.id, autoAccept: true, comment: null });
    if (res.id) {
      const it = itemById(s, res.id);
      it.createdAt = Math.min(now(), rule.nextRun);
      it.assignedAt = it.createdAt;
      it.lastUpdateAt = it.createdAt;
      first = first || res.id;
      notify(s, rule.ownerId, `↻ New ${FREQ_LABEL[rule.freq].toLowerCase()} occurrence: *${it.title}* — due ${fmtDT(deadline)}.`, { itemId: res.id });
    }
    rule.nextRun = advanceRun(rule, rule.nextRun);
  }
  return { id: first };
}

/* ---------- Off days, users, admin ---------- */
export function changePolicy(s, userId, changes, effectiveFrom) {
  if (!can(s, userId, 'policy')) return err('Only Founders, Admins or a role with Policy access can change this.');
  const lines = [];
  for (const [key, newValue] of Object.entries(changes)) {
    const oldValue = currentPolicyValue(s, key);
    if (String(oldValue) === String(newValue)) continue;
    s.policyVersions.push({ id: uid('v'), key, oldValue, newValue, effectiveFrom, changedBy: userId, ts: now() });
    s.activity.push({ id: uid('a'), ts: now(), userId, itemId: null, action: `Policy: ${POLICY_LABEL[key] || key}`, from: String(oldValue), to: `${newValue} (from ${fmtDate(effectiveFrom)})` });
    lines.push(`${POLICY_LABEL[key] || key}: ${fmtVal(oldValue)} → ${fmtVal(newValue)}`);
  }
  if (!lines.length) return err('Nothing changed.');
  notify(s, founders(s), `⚙️ ${firstName(s, userId)} changed Policy & Scoring Settings (effective ${fmtDate(effectiveFrom)}):\n• ${lines.join('\n• ')}`, { kind: 'policy', quietOk: true });
  post(s, 'announce', `📣 Heads up team — from ${fmtDate(effectiveFrom)} these rules change:\n• ${lines.join('\n• ')}\nPast scores stay as they are.`);
  return { ok: true, count: lines.length };
}
const fmtVal = (v) => (v === true ? 'On' : v === false ? 'Off' : v);
export function currentPolicyValue(s, key) {
  // latest value regardless of effective date (what the form shows)
  const vs = s.policyVersions.filter((v) => v.key === key).sort((a, b) => a.ts - b.ts);
  return vs.length ? vs[vs.length - 1].newValue : DEFAULT_POLICY[key];
}

export function rolesChanged(s, userId, text) {
  s.activity.push({ id: uid('a'), ts: now(), userId, itemId: null, action: 'Roles', from: null, to: text });
  notify(s, founders(s), `🔐 ${firstName(s, userId)} changed roles: ${text}`, { kind: 'policy', quietOk: true });
}

// Open items linked to a person (owner, assignee, creator, reviewer) — used by offboarding.
export function linkedOpenItems(s, userId) {
  return s.items.filter(
    (i) => !DONE.includes(i.status) && (i.ownerId === userId || i.assigneeId === userId || i.creatorId === userId || i.reviewerId === userId)
  );
}
export function offboardReassign(s, actorId, itemId, leaverId, toId) {
  const it = itemById(s, itemId);
  if (!toId) return err('Pick who takes it over.');
  const changes = [];
  if (it.creatorId === leaverId) {
    it.creatorId = toId;
    changes.push('creator');
  }
  if (it.reviewerId === leaverId) {
    it.reviewerId = toId;
    changes.push('reviewer');
  }
  if (it.assigneeId === leaverId) {
    it.assigneeId = null;
    changes.push('assignee (handed back to owner)');
  }
  if (it.ownerId === leaverId) {
    it.ownerId = toId;
    it.prevStatus = ['awaiting', 'pending_approval'].includes(it.status) ? null : it.status;
    it.status = 'awaiting';
    it.assignedAt = now();
    it.reviewerId = reviewerFor(s, it.creatorId, toId, it.vertical);
    it.offboardedFrom = leaverId;
    changes.push('owner');
    sendAssignedDM(s, it);
  }
  log(s, actorId, it.id, `Offboarding: ${changes.join(', ')}`, nameOf(s, leaverId), nameOf(s, toId));
  return { ok: true };
}
export { isUrl };

/* ---------- Pilot setup sprint (PRD §1) ---------- */
// Each person enters their currently open tasks in one go; their main manager approves the list.
export function submitSetupList(s, userId, rows) {
  const list = rows.filter((r) => r.title?.trim());
  if (!list.length) return err('Add at least one task.');
  for (const r of list) {
    if (!r.deadline) return err(`“${r.title}”: set a deadline.`);
    if (!r.impactReason?.trim()) return err(`“${r.title}”: add a one-line reason for the impact.`);
  }
  const ids = [];
  for (const r of list) {
    const res = createItem(s, userId, {
      type: 'task', title: r.title, ownerId: userId, vertical: r.vertical, deadline: r.deadline, size: r.size, impact: +r.impact,
      impactReason: r.impactReason, progressMethod: 'stages', setup: true, autoAccept: true, desc: r.desc || '',
    });
    if (res.error) return res;
    const it = itemById(s, res.id);
    it.status = 'pending_approval';
    it.stage = Math.min(75, +r.stage || 0);
    it.setupBatch = true;
    ids.push(res.id);
  }
  const mgr = mainManager(s, userId);
  requestApproval(s, 'setup', null, userId, [mgr], { itemIds: ids },
    `${firstName(s, userId)} entered ${ids.length} open task${ids.length > 1 ? 's' : ''} in the setup sprint. Approve to put them on the board.`);
  return { ok: true, count: ids.length };
}

/* ---------- KPI data sources (Phase 3 auto-pull) ---------- */
export const KPI_SOURCES = [
  ['manual', 'Entered by hand (Saturday)'],
  ['meta:leads', 'Meta Ads · Leads'],
  ['meta:spend', 'Meta Ads · Spend (₹)'],
  ['meta:cpl', 'Meta Ads · Cost per lead (₹)'],
  ['meta:clicks', 'Meta Ads · Clicks'],
  ['meta:impressions', 'Meta Ads · Impressions'],
  ['meta:ctr', 'Meta Ads · Click-through rate (%)'],
  ['zoho:leads_created', 'Zoho CRM · Leads created'],
  ['zoho:deals_created', 'Zoho CRM · Deals created'],
  ['zoho:deals_won', 'Zoho CRM · Deals won'],
  ['zoho:won_amount', 'Zoho CRM · Won amount (₹)'],
];
export const kpiSourceKey = (k) => (k.source && k.source !== 'manual' ? `${k.source}:${k.sourceMetric}` : 'manual');
export const kpiSourceLabel = (k) => (KPI_SOURCES.find(([v]) => v === kpiSourceKey(k)) || KPI_SOURCES[0])[1];
