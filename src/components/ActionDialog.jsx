import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Modal, Field, UserSelect, Choice, Stars, Bar } from './ui.jsx';
import { perform, canCancelDirect, cycleAchievement, kpiActual, ACTION_LABEL } from '../engine/actions.js';
import { P } from '../engine/policy.js';
import { baseOf, effectiveDeadline, ownersManager, firstName, progressOf, STAGES, itemById, userById } from '../engine/core.js';
import { now, HOUR, DAY, fmtDT, atTime, dateKey, addKey, toInputDate, toInputTime, parseKey } from '../lib/time.js';
import { nextWorkingKey } from '../engine/sow.js';

export const ACTION_UI = {
  accept: { title: 'Accept ownership', button: 'Accept', primary: true },
  decline: { title: 'Decline', button: 'Decline', placeholder: "What's unclear or why can't you take it?" },
  update: { title: 'Update progress', button: 'Save update', primary: true, placeholder: 'What moved today? What is next?' },
  give_assignee: { title: 'Give to assignee', button: 'Hand over', placeholder: 'What exactly should they do?' },
  assign_back: { title: 'Assign back to owner', button: 'Assign back', placeholder: 'What did you finish?' },
  block: { title: "I'm blocked", button: 'Mark blocked', placeholder: 'What do you need from them?' },
  unblock: { title: 'Unblock', button: 'Unblock', primary: true, placeholder: 'What changed?' },
  request_extension: { title: 'Request extension', button: 'Send request', placeholder: 'Why do you need more time, and what is the new plan?' },
  submit: { title: 'Submit for review', button: 'Submit', primary: true, placeholder: 'Anything the reviewer should know?' },
  review: { title: 'Review', button: 'Save review', primary: true },
  cancel: { title: 'Cancel task', button: 'Cancel task', danger: true, placeholder: 'Why are we stopping this?' },
  reopen: { title: 'Reopen', button: 'Reopen', placeholder: 'What needs another look?' },
  change_owner: { title: 'Change owner', button: 'Change owner', placeholder: 'Why is it moving?' },
  skip: { title: 'Skip this occurrence', button: 'Request skip', placeholder: 'Why skip this one?' },
  verify_cycle: { title: 'Verify KPIs & close cycle', button: 'Verify & close', primary: true, placeholder: 'Checked against the sources?' },
  flag_size: { title: 'Flag size / impact', button: 'Send flag', placeholder: 'What do you think it should be, and why?' },
};

export default function ActionDialog({ item, action, onClose, onDone, preset = {} }) {
  const { s, me, commit, toast } = useStore();
  const ui = ACTION_UI[action] || { title: ACTION_LABEL[action], button: 'Save' };
  const [comment, setComment] = useState('');
  const [f, setF] = useState(() => ({
    checklist: item.checklist ? item.checklist.map((c) => ({ ...c })) : [],
    stage: Math.min(75, item.stage || 0),
    progress: progressOf(s, item),
    pickup: 'tomorrow',
    pickupCustom: '',
    rating: 2,
    decision: 'accept',
    newDate: toInputDate((item.currentDeadline || now()) + 2 * DAY),
    newTime: toInputTime(item.currentDeadline || atTime(now(), P(s, 'defaultDeadlineTime'))),
    ...preset,
  }));
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const b = baseOf(s, item);
  const today = dateKey(now());

  const extInfo = useMemo(() => {
    if (action !== 'request_extension') return null;
    const notice = (effectiveDeadline(s, item) - now()) / HOUR;
    const nth = (item.extensionsCount || 0) + 1;
    const cost = [];
    if (notice < P(s, 'freeExtNoticeH')) cost.push(`−${Math.round(b * P(s, 'extLateNotice') * 10) / 10} pts (asked less than ${P(s, 'freeExtNoticeH')}h before)`);
    if (nth > P(s, 'freeExtensions')) cost.push(`−${Math.round(b * P(s, 'extRepeat') * 10) / 10} pts (extension #${nth})`);
    return { notice, nth, cost };
  }, [action, s, item, b]);

  const submit = () => {
    const payload = { comment };
    if (action === 'update') {
      if (item.progressMethod === 'checklist') payload.checklist = f.checklist;
      if (item.progressMethod === 'stages') payload.stage = f.stage;
      const next = nextWorkingKey(s, today);
      payload.pickupDate = f.pickup === 'tomorrow' ? next : f.pickup === 'plus2' ? nextWorkingKey(s, next) : f.pickupCustom || null;
      if (payload.pickupDate && item.currentDeadline && parseKey(payload.pickupDate) > item.currentDeadline) {
        toast('Pick-up date must be before the deadline.', 'error');
        return;
      }
    }
    if (action === 'give_assignee') payload.assigneeId = f.assigneeId;
    if (action === 'block') payload.blockedBy = f.blockedBy;
    if (action === 'request_extension') payload.newDeadline = atTime(f.newDate, f.newTime || '18:30');
    if (action === 'submit') payload.proofLink = f.proofLink;
    if (action === 'review') {
      payload.decision = f.decision;
      payload.rating = f.rating;
    }
    if (action === 'change_owner') payload.newOwnerId = f.newOwnerId;
    const r = commit((st) => perform(st, me, item.id, action, payload));
    if (r && !r.error) {
      toast(doneText(action, f, s, item));
      onDone?.();
      onClose();
    }
  };

  const om = ownersManager(s, item);
  return (
    <Modal
      title={ui.title}
      sub={item.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className={`btn ${ui.danger ? 'danger' : ui.primary ? 'primary' : 'outline'}`} onClick={submit}>
            {action === 'review' && f.decision === 'send_back' ? 'Send back' : ui.button}
          </button>
        </>
      }
    >
      {action === 'accept' && (
        <div className="hint-box ok">
          You're confirming the deadline: <b>{fmtDT(item.currentDeadline)}</b>. Accepting within {P(s, 'fastAcceptH')} hours earns +{P(s, 'fastAcceptBonus')}.
        </div>
      )}

      {action === 'update' && item.progressMethod === 'checklist' && (
        <Field label={`Checklist · ${Math.round((f.checklist.filter((c) => c.done).length / Math.max(1, f.checklist.length)) * 100)}%`}>
          <div>
            {f.checklist.map((c, i) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={c.done} onChange={(e) => set('checklist', f.checklist.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} />
                {c.text}
              </label>
            ))}
          </div>
        </Field>
      )}
      {action === 'update' && item.progressMethod === 'stages' && (
        <Field label="Stage">
          <Choice options={STAGES.filter(([v]) => v < 100).map(([v, l]) => [v, `${l} ${v}%`])} value={f.stage} onChange={(v) => set('stage', v)} />
          <div className="hint">“Submitted 100%” happens when you submit with a proof link.</div>
        </Field>
      )}
      {action === 'update' && item.progressMethod === 'subtasks' && <div className="hint-box info">Progress comes from the sub-tasks ({progressOf(s, item)}%). Add a note on where things stand.</div>}
      {action === 'update' && item.type !== 'project' && (
        <Field label="Next pick-up">
          <Choice options={[['tomorrow', 'Tomorrow'], ['plus2', '+2 days'], ['custom', 'Custom']]} value={f.pickup} onChange={(v) => set('pickup', v)} />
          {f.pickup === 'custom' && <input className="input" type="date" min={addKey(today, 1)} max={item.currentDeadline ? dateKey(item.currentDeadline) : undefined} value={f.pickupCustom} onChange={(e) => set('pickupCustom', e.target.value)} />}
        </Field>
      )}

      {action === 'give_assignee' && (
        <Field label="Give to" hint="One assignee at a time. Only they or you can assign it back. You stay the owner.">
          <UserSelect value={f.assigneeId} onChange={(v) => set('assigneeId', v)} exclude={[item.ownerId]} />
        </Field>
      )}
      {action === 'block' && (
        <Field label="Blocked by" hint={`They and their manager get pinged now. The deadline clock pauses for up to ${P(s, 'blockedFreeDays')} days; after that ${firstName(s, om)} approves each extra day.`}>
          <UserSelect value={f.blockedBy} onChange={(v) => set('blockedBy', v)} exclude={[me]} />
        </Field>
      )}
      {action === 'request_extension' && (
        <>
          <div className="row">
            <Field label="New deadline" className="spacer">
              <input className="input" type="date" min={dateKey(item.currentDeadline)} value={f.newDate} onChange={(e) => set('newDate', e.target.value)} />
            </Field>
            <Field label="Time">
              <input className="input" type="time" value={f.newTime} onChange={(e) => set('newTime', e.target.value)} />
            </Field>
          </div>
          <div className={`hint-box ${extInfo.cost.length ? 'warn' : 'ok'}`}>
            {extInfo.cost.length ? (
              <span>
                This extension costs: {extInfo.cost.join(' and ')}. Original deadline stays on record.
              </span>
            ) : (
              <span>This is a free extension — asked with {Math.round(extInfo.notice)}h notice and it's your first. No points lost.</span>
            )}
          </div>
        </>
      )}
      {action === 'submit' && (
        <Field label="Proof link (required)" hint="Google Doc, Drive, Canva, Sheet… No file uploads — just the link.">
          <input className="input" placeholder="https://" value={f.proofLink || ''} onChange={(e) => set('proofLink', e.target.value)} autoFocus />
        </Field>
      )}
      {action === 'review' && (
        <>
          {item.proofLinks?.length > 0 && (
            <div className="small">
              Proof:{' '}
              {item.proofLinks.map((l) => (
                <a key={l} href={l} target="_blank" rel="noreferrer">
                  {l}
                </a>
              ))}
            </div>
          )}
          <Choice options={[['accept', 'Accept'], ['send_back', 'Send back']]} value={f.decision} onChange={(v) => set('decision', v)} tones={{ accept: 'ok', send_back: 'warn' }} />
          {f.decision === 'accept' && (
            <Field label="Quality rating" hint="★ below standard (×0.5) · ★★ as expected (×1.0) · ★★★ exceptional (×1.5). A reason is needed for ★ and ★★★.">
              <Stars value={f.rating} onChange={(v) => set('rating', v)} />
            </Field>
          )}
          {f.decision === 'send_back' && <div className="hint-box info">It goes back to In progress and the deadline clock resumes. No rating yet.</div>}
        </>
      )}
      {action === 'cancel' && (
        <div className={`hint-box ${canCancelDirect(s, me, item) ? 'warn' : 'info'}`}>
          {canCancelDirect(s, me, item)
            ? 'Cancelling stops the task. Nothing is deleted; no points either way, earned penalties stay.'
            : `${firstName(s, om)} (owner's manager) needs to approve this cancel.`}
        </div>
      )}
      {action === 'reopen' && <div className="hint-box warn">Points earned on this task are reversed until it's re-submitted and accepted.</div>}
      {action === 'change_owner' && (
        <Field label="New owner" hint={['awaiting', 'pending_approval'].includes(item.status) ? 'Not accepted yet, so it moves straight away.' : "The new owner must accept and their manager approves. Points already earned stay with the current owner."}>
          <UserSelect value={f.newOwnerId} onChange={(v) => set('newOwnerId', v)} exclude={[item.ownerId]} />
        </Field>
      )}
      {action === 'verify_cycle' && (
        <div className="stack-sm">
          {s.kpis
            .filter((k) => k.itemId === item.id)
            .map((k) => (
              <div key={k.id} className="row small">
                <span className="spacer">{k.name}</span>
                <span>
                  {kpiActual(k) ?? '—'} / {k.dir === '<=' ? '≤' : '≥'} {k.target}
                  {k.unit}
                </span>
              </div>
            ))}
          <div className="hint-box ok">
            Achievement {Math.round(cycleAchievement(s, item) * 100)}% → {Math.round(b * cycleAchievement(s, item) * 10) / 10} points for {firstName(s, item.ownerId)} (cap {P(s, 'kpiCap')}%).
          </div>
        </div>
      )}

      <Field label={P(s, 'commentRequired') ? 'Comment (required)' : 'Comment'}>
        <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={ui.placeholder || 'Add a short comment…'} autoFocus={action !== 'submit'} />
      </Field>
    </Modal>
  );
}

function doneText(action, f, s, item) {
  switch (action) {
    case 'accept':
      return "It's yours now — nice. 🙌";
    case 'submit':
      return `Submitted to ${firstName(s, item.reviewerId)} for review.`;
    case 'review':
      return f.decision === 'accept' ? `Closed with ${f.rating}★ — points awarded.` : 'Sent back with your notes.';
    case 'request_extension':
      return 'Extension request sent.';
    case 'block':
      return 'Marked blocked — the clock is paused.';
    case 'unblock':
      return 'Unblocked. Back to it!';
    default:
      return 'Saved.';
  }
}
