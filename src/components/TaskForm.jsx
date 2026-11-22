import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Modal, Field, UserSelect, Choice, Seg, go } from './ui.jsx';
import { createItem, createRecurringRule, perform, canEditSizeImpact, FREQ_LABEL, KPI_SOURCES, cycleEnd } from '../engine/actions.js';
import { GOAL_LABEL } from '../engine/goals.js';
import { P } from '../engine/policy.js';
import {
  userById, itemById, sharesVertical, managerOf, firstName, isFounder, loadFor, SIZE_HOURS, verticalById, effectiveDeadline, isAbove, DONE, IMPACT_LABEL, uid,
} from '../engine/core.js';
import { potentialPoints } from '../engine/scoring.js';
import { now, atTime, addDays, toInputDate, startOfWeek, fmtDT, dateKey, parseKey, addKey, DAY } from '../lib/time.js';

const TYPES = [
  ['task', 'Task'],
  ['subtask', 'Sub-task'],
  ['project', 'Project'],
  ['stream', 'Stream'],
  ['recurring', 'Recurring task'],
];

export default function TaskForm({ onClose, edit = null, preset = {} }) {
  const { s, me, commit, toast } = useStore();
  const isEdit = !!edit;
  const [f, setF] = useState(() =>
    isEdit
      ? {
          title: edit.title,
          desc: edit.desc,
          links: edit.links?.length ? edit.links : [],
          checklist: edit.checklist || [],
          size: edit.size,
          impact: edit.impact,
          impactReason: edit.impactReason,
          estHours: edit.estHours,
          contributors: edit.contributors || [],
          goalLinks: edit.goalLinks || [],
          private: edit.private,
        }
      : {
          type: preset.type || 'task',
          title: '',
          desc: '',
          ownerId: preset.ownerId || me,
          vertical: '',
          date: toInputDate(addDays(now(), 3)),
          time: P(s, 'defaultDeadlineTime'),
          size: 'M',
          impact: 3,
          impactReason: '',
          estHours: '',
          progressMethod: 'stages',
          containerProgress: 'subtasks', // projects & streams
          parentId: preset.parentId || '',
          contributors: [],
          goalLinks: [],
          links: [],
          checklistText: '',
          private: false,
          pinned: false,
          freq: 'weekly',
          everyDays: 7,
          dueAfterDays: 5,
          firstRun: toInputDate(now()),
          firstDue: '', // '' = worked out from the frequency
          dueTime: P(s, 'defaultDeadlineTime'),
          cycleStart: toInputDate(now()),
          cycleDueDate: '', // '' = end of the first cycle
          cycleDueTime: P(s, 'defaultDeadlineTime'),
          cycleLength: 'monthly',
          projKey: '',
          kpis: [{ name: '', target: '', unit: '', dir: '>=', src: 'manual' }],
        }
  );
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // Recurring: first due date defaults to the usual gap for the frequency.
  const DUE_GAP = { daily: 0, weekly: 5, monthly: 7, quarterly: 14, yearly: 30, custom: 3 };
  const firstDue = f.firstDue || (f.firstRun ? addKey(f.firstRun, DUE_GAP[f.freq] ?? 5) : '');
  const dueAfterDays = f.firstRun && firstDue ? Math.round((parseKey(firstDue) - parseKey(f.firstRun)) / DAY) : 0;
  // Stream: first cycle due date defaults to the end of the first cycle.
  const cycleDueDate = f.cycleDueDate || (f.cycleStart ? dateKey(cycleEnd(parseKey(f.cycleStart), f.cycleLength)) : '');
  const owner = userById(s, isEdit ? edit.ownerId : f.ownerId);
  const deadline = isEdit ? edit.currentDeadline : f.date ? atTime(f.date, f.time || '18:30') : null;
  const vertical = isEdit ? edit.vertical : f.vertical || owner?.verticals.find((v) => v.main)?.vid;
  const parents = s.items.filter((i) => !DONE.includes(i.status) && (f.type === 'subtask' ? i.type === 'task' : ['project', 'cycle'].includes(i.type)));
  const noParent = f.type === 'subtask' && f.parentId === 'none'; // "Not applicable" → saved as a normal task
  const parent = !isEdit && f.parentId && !noParent ? itemById(s, f.parentId) : null;

  const hints = useMemo(() => {
    if (isEdit || !owner) return [];
    const h = [];
    const wk = deadline ? startOfWeek(deadline) : startOfWeek(now());
    const extraHours = +f.estHours || SIZE_HOURS[f.size];
    const cap = (owner.hours || 9) * 6 * 0.8;
    const pct = loadFor(s, owner.id, wk) + Math.round((extraHours / cap) * 100);
    if (f.type !== 'stream') h.push({ tone: pct > 100 ? 'bad' : pct >= 80 ? 'warn' : 'ok', text: `${firstName(s, owner.id)} at ${pct}% load that week with this task.${pct > 100 ? " Their manager will be told — consider another owner or date." : ''}` });
    if (owner.id !== me && P(s, 'crossVerticalApproval') && !sharesVertical(s, me, owner.id) && !isFounder(s, me)) {
      h.push({ tone: 'info', text: `Needs ${firstName(s, managerOf(s, owner.id, vertical))}'s approval — different vertical.` });
    }
    if (parent?.currentDeadline && deadline && deadline > effectiveDeadline(s, parent)) {
      h.push({ tone: 'bad', text: `Deadline is after the ${parent.type} deadline (${fmtDT(parent.currentDeadline)}). Extend the ${parent.type} first.` });
    }
    if (owner.id === me && !isFounder(s, me)) h.push({ tone: 'info', text: `Self-created: ${firstName(s, managerOf(s, me, vertical))} will review it and confirm size & impact.` });
    return h;
  }, [isEdit, owner, deadline, f.estHours, f.size, f.type, s, me, vertical, parent]);

  const pts = potentialPoints(s, { size: f.size, impact: +f.impact });
  const canPin = !isEdit && owner && (isFounder(s, me) || isAbove(s, me, owner.id));
  const sizeLocked = isEdit && !canEditSizeImpact(s, me, edit);

  const save = () => {
    if (isEdit) {
      const r = commit((st) =>
        perform(st, me, edit.id, 'edit', {
          title: f.title,
          desc: f.desc,
          links: f.links.filter((l) => l.url),
          checklist: f.checklist.filter((c) => c.text.trim()),
          contributors: f.contributors,
          goalLinks: f.goalLinks,
          private: f.private,
          ...(sizeLocked ? {} : { size: f.size, impact: +f.impact, impactReason: f.impactReason, estHours: +f.estHours || SIZE_HOURS[f.size] }),
        })
      );
      if (!r.error) {
        toast('Saved.');
        onClose();
      }
      return;
    }
    if (f.type === 'subtask' && !f.parentId) {
      toast('Pick the main task this sub-task belongs to, or choose "Not applicable".', 'error');
      return;
    }
    const data = {
      type: f.type === 'recurring' || noParent ? 'task' : f.type,
      title: f.title,
      desc: f.desc,
      ownerId: f.ownerId,
      vertical,
      deadline: f.type === 'stream' || f.type === 'recurring' ? null : deadline,
      size: f.size,
      impact: +f.impact,
      impactReason: f.impactReason,
      estHours: f.estHours,
      progressMethod: ['project', 'stream'].includes(f.type) ? f.containerProgress : f.progressMethod,
      parentId: noParent ? null : f.parentId || null,
      contributors: f.contributors,
      goalLinks: f.goalLinks,
      links: f.links.filter((l) => l.url),
      checklist: f.checklistText.split('\n').map((x) => x.trim()).filter(Boolean),
      private: f.private,
      pinned: f.pinned,
      cycleLength: f.cycleLength,
      cycleStart: f.type === 'stream' && f.cycleStart ? parseKey(f.cycleStart) : null,
      cycleDue: f.type === 'stream' && cycleDueDate ? atTime(cycleDueDate, f.cycleDueTime || '18:30') : null,
      projKey: f.projKey,
      kpis: f.kpis.filter((k) => k.name).map(({ src, ...k }) => ({ ...k, source: (src || 'manual').split(':')[0], sourceMetric: src && src !== 'manual' ? src.split(':')[1] : null })),
    };
    if (data.progressMethod === 'checklist' && !data.checklist.length) {
      toast('Add at least one checklist item (one per line).', 'error');
      return;
    }
    let newId = null;
    const r = commit((st) => {
      if (f.type === 'recurring') {
        if (!data.title?.trim()) return { error: 'Give it a title.' };
        if (dueAfterDays < 0) return { error: 'The first due date must be on or after the first occurrence.' };
        const res = createRecurringRule(st, me, { ...data, dueTime: f.dueTime || P(s, 'defaultDeadlineTime'), freq: f.freq, everyDays: f.everyDays, dueAfterDays, firstRun: atTime(f.firstRun, '09:00') });
        newId = res.id;
        return res.id ? res : { ok: true };
      }
      const res = createItem(st, me, data);
      newId = res.id;
      return res;
    });
    if (!r.error) {
      (r.warnings || []).forEach((w) => toast(w, 'ok'));
      toast(noParent ? 'Created as a normal task (no main task).' : f.type === 'recurring' ? `Recurring task set up (${FREQ_LABEL[f.freq].toLowerCase()}).` : `Created — ${f.ownerId === me ? "it's on your list" : `${firstName(s, f.ownerId)} has been notified on Slack`}.`);
      onClose();
      if (newId) go(`/task/${newId}`);
    }
  };

  return (
    <Modal
      wide
      title={isEdit ? `Edit ${edit.key}` : 'New'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={save}>
            {isEdit ? 'Save changes' : 'Create'}
          </button>
        </>
      }
    >
      {!isEdit && <Seg options={TYPES} value={f.type} onChange={(v) => set('type', v)} sm />}
      <div className="form-grid">
        <Field label="Title" className="full">
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="What needs to be done?" autoFocus />
        </Field>
        {!isEdit && (
          <Field label="Owner (one person, accountable)">
            <UserSelect value={f.ownerId} onChange={(v) => set('ownerId', v)} />
          </Field>
        )}
        {!isEdit && (
          <Field label="Vertical" hint="Defaults to the owner's main vertical">
            <select className="input" value={vertical || ''} onChange={(e) => set('vertical', e.target.value)}>
              {s.verticals.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!isEdit && !['stream', 'recurring'].includes(f.type) && (
          <Field label="Deadline (IST)">
            <div className="row">
              <input className="input" type="date" value={f.date} min={dateKey(now())} onChange={(e) => set('date', e.target.value)} />
              <input className="input" type="time" style={{ maxWidth: 130 }} value={f.time} onChange={(e) => set('time', e.target.value)} />
            </div>
          </Field>
        )}
        {!isEdit && ['subtask', 'task'].includes(f.type) && (
          <Field
            label={f.type === 'subtask' ? 'Parent task (required)' : 'Project / cycle (optional)'}
            hint={f.type === 'subtask' ? (noParent ? 'No main task — this will be created as a normal task.' : parents.length ? 'The main task this sits under.' : 'No open tasks yet — choose "Not applicable".') : undefined}
          >
            <select className="input" value={f.parentId} onChange={(e) => set('parentId', e.target.value)}>
              <option value="">{f.type === 'subtask' ? 'Choose a task' : 'None'}</option>
              {f.type === 'subtask' && <option value="none">Not applicable — no main task</option>}
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.key} · {p.title}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!isEdit && ['project', 'stream'].includes(f.type) && (
          <Field label="Key prefix (optional)" hint="e.g. DIW → task IDs DIW-01, DIW-02…">
            <input className="input" maxLength={4} value={f.projKey} onChange={(e) => set('projKey', e.target.value.toUpperCase())} />
          </Field>
        )}
        <Field label="Size">
          <Choice options={[['S', 'S · ≤2 days'], ['M', 'M · 3–10 days'], ['L', 'L · >10 days']]} value={f.size} onChange={(v) => !sizeLocked && set('size', v)} />
        </Field>
        <Field label="Impact">
          <Choice options={[[1, '1 Low'], [3, '3 Medium'], [5, '5 Critical']]} value={+f.impact} onChange={(v) => !sizeLocked && set('impact', v)} />
        </Field>
        <Field label="Why this impact? (optional)" className="full" hint={sizeLocked ? 'Only the creator, owner’s manager or founders change size & impact. You can flag a disagreement from the task page.' : `Worth ${pts.base} base points · up to ${pts.max} if early with 3★`}>
          <input className="input" disabled={sizeLocked} value={f.impactReason} onChange={(e) => set('impactReason', e.target.value)} placeholder={`e.g. ${IMPACT_LABEL[f.impact]} — client safety, revenue, launch…`} />
        </Field>
        {f.type !== 'stream' && (
          <Field label="Estimated hours" hint={`Pre-filled from size (S=4, M=16, L=40)`}>
            <input className="input" type="number" disabled={sizeLocked} value={f.estHours} placeholder={String(SIZE_HOURS[f.size])} onChange={(e) => set('estHours', e.target.value)} />
          </Field>
        )}
        {!isEdit && ['task', 'subtask', 'recurring'].includes(f.type) && (
          <Field label="Progress method">
            <Choice options={[['stages', 'Stages'], ['checklist', 'Checklist'], ['subtasks', 'Sub-tasks']]} value={f.progressMethod} onChange={(v) => set('progressMethod', v)} />
          </Field>
        )}
        {!isEdit && ['project', 'stream'].includes(f.type) && (
          <Field label="Progress method" hint={f.containerProgress === 'subtasks' ? (f.type === 'stream' ? 'Worked out from its cycles and tasks.' : 'Worked out from the tasks inside it.') : f.containerProgress === 'stages' ? 'The owner sets the stage with each update.' : 'Ticks off a checklist.'}>
            <Choice options={[['subtasks', f.type === 'stream' ? 'From cycles & tasks' : 'From tasks inside'], ['stages', 'Stages'], ['checklist', 'Checklist']]} value={f.containerProgress} onChange={(v) => set('containerProgress', v)} />
          </Field>
        )}
        {!isEdit && (['project', 'stream'].includes(f.type) ? f.containerProgress : f.progressMethod) === 'checklist' && (
          <Field label="Checklist (one item per line)" className="full">
            <textarea className="input" value={f.checklistText} onChange={(e) => set('checklistText', e.target.value)} />
          </Field>
        )}
        {isEdit && (
          <Field label="Checklist" className="full">
            {f.checklist.map((c, i) => (
              <div key={c.id} className="row">
                <input className="input sm" value={c.text} onChange={(e) => set('checklist', f.checklist.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn xs ghost" onClick={() => set('checklist', f.checklist.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <button className="btn xs" onClick={() => set('checklist', [...f.checklist, { id: uid('k'), text: '', done: false }])}>
              + Item
            </button>
          </Field>
        )}
        {f.type === 'recurring' && (
          <>
            <Field label="Repeats">
              <select className="input" value={f.freq} onChange={(e) => setF((x) => ({ ...x, freq: e.target.value, firstDue: '' }))}>
                {Object.entries(FREQ_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            {f.freq === 'custom' && (
              <Field label="Every N days">
                <input className="input" type="number" min={1} value={f.everyDays} onChange={(e) => set('everyDays', e.target.value)} />
              </Field>
            )}
            <Field label="First occurrence on">
              <input className="input" type="date" value={f.firstRun} onChange={(e) => setF((x) => ({ ...x, firstRun: e.target.value, firstDue: '' }))} />
            </Field>
            <Field
              label="First one due (IST)"
              hint={`Each later one is due ${dueAfterDays === 0 ? 'the same day it starts' : `${dueAfterDays} day${dueAfterDays === 1 ? '' : 's'} after it starts`}, at ${f.dueTime || '—'}.`}
            >
              <div className="row">
                <input className="input" type="date" value={firstDue} min={f.firstRun} onChange={(e) => set('firstDue', e.target.value)} />
                <input className="input" type="time" style={{ maxWidth: 130 }} value={f.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
              </div>
            </Field>
          </>
        )}
        {f.type === 'stream' && (
          <>
            <Field label="Cycle length">
              <select className="input" value={f.cycleLength} onChange={(e) => setF((x) => ({ ...x, cycleLength: e.target.value, cycleDueDate: '' }))}>
                {['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'].map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First cycle starts on">
              <input className="input" type="date" value={f.cycleStart} onChange={(e) => setF((x) => ({ ...x, cycleStart: e.target.value, cycleDueDate: '' }))} />
            </Field>
            <Field label="First cycle due (IST)" hint="Each next cycle starts the day after and runs for the cycle length, due at the same time.">
              <div className="row">
                <input className="input" type="date" value={cycleDueDate} min={f.cycleStart} onChange={(e) => set('cycleDueDate', e.target.value)} />
                <input className="input" type="time" style={{ maxWidth: 130 }} value={f.cycleDueTime} onChange={(e) => set('cycleDueTime', e.target.value)} />
              </div>
            </Field>
            <Field label="KPIs (required for streams)" className="full" hint="Actuals are entered every Saturday with a source link; the manager verifies at cycle end.">
              {f.kpis.map((k, i) => (
                <div key={i} className="row wrap">
                  <input className="input sm" style={{ flex: 2 }} placeholder="KPI name (e.g. Leads)" value={k.name} onChange={(e) => set('kpis', f.kpis.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <select className="input sm" style={{ width: 70 }} value={k.dir} onChange={(e) => set('kpis', f.kpis.map((x, j) => (j === i ? { ...x, dir: e.target.value } : x)))}>
                    <option value=">=">≥</option>
                    <option value="<=">≤</option>
                  </select>
                  <input className="input sm" style={{ width: 100 }} placeholder="Target" type="number" value={k.target} onChange={(e) => set('kpis', f.kpis.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
                  <input className="input sm" style={{ width: 70 }} placeholder="Unit" value={k.unit} onChange={(e) => set('kpis', f.kpis.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                  <select className="input sm" style={{ width: 230 }} value={k.src || 'manual'} onChange={(e) => set('kpis', f.kpis.map((x, j) => (j === i ? { ...x, src: e.target.value } : x)))} title="Where the weekly number comes from">
                    {KPI_SOURCES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <button className="btn xs" onClick={() => set('kpis', [...f.kpis, { name: '', target: '', unit: '', dir: '>=', src: 'manual' }])}>
                + KPI
              </button>
            </Field>
          </>
        )}
        <Field label="Description" className="full">
          <DescInput value={f.desc} onChange={(v) => set('desc', v)} />
        </Field>
        <Field label="Reference links" className="full" hint="Links only — no file uploads.">
          {f.links.map((l, i) => (
            <div key={i} className="row">
              <input className="input sm" style={{ maxWidth: 200 }} placeholder="Label" value={l.label} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <input className="input sm" placeholder="https://" value={l.url} onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <button className="btn xs ghost" onClick={() => set('links', f.links.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button className="btn xs" onClick={() => set('links', [...f.links, { label: '', url: '' }])}>
            + Link
          </button>
        </Field>
        <Field label="Contributors (optional)" className="full" hint="Tagged helpers. Their piece becomes a sub-task they own.">
          <div className="row wrap">
            {f.contributors.map((c) => (
              <span key={c} className="pill">
                {userById(s, c)?.name}{' '}
                <button className="btn xs ghost" onClick={() => set('contributors', f.contributors.filter((x) => x !== c))}>
                  ✕
                </button>
              </span>
            ))}
            <UserSelect className="input sm" placeholder="+ Add contributor" value="" onChange={(v) => v && set('contributors', [...new Set([...f.contributors, v])])} exclude={[f.ownerId]} />
          </div>
        </Field>
        {(() => {
          const ownerGoals = s.goals.filter((g) => g.userId === (isEdit ? edit.ownerId : f.ownerId) && g.status === 'active');
          if (!ownerGoals.length) return null;
          return (
            <Field label="Linked goals (optional)" className="full" hint="The goal page shows how many linked tasks are closed.">
              <div className="row wrap">
                {ownerGoals.map((g) => (
                  <label key={g.id} className="check small">
                    <input type="checkbox" checked={f.goalLinks.includes(g.id)} onChange={(e) => set('goalLinks', e.target.checked ? [...f.goalLinks, g.id] : f.goalLinks.filter((x) => x !== g.id))} />
                    {g.title} <span className="faint">· {GOAL_LABEL[g.type]}</span>
                  </label>
                ))}
              </div>
            </Field>
          );
        })()}
        <div className="row wrap full">
          {(!isEdit || edit.creatorId === me) && (
            <label className="check">
              <input type="checkbox" checked={f.private} onChange={(e) => set('private', e.target.checked)} /> Private (others see only “Private task”, status, deadline)
            </label>
          )}
          {canPin && (
            <label className="check">
              <input type="checkbox" checked={f.pinned} onChange={(e) => set('pinned', e.target.checked)} /> Pin (boosts their top-3)
            </label>
          )}
        </div>
      </div>
      {hints.map((h, i) => (
        <div key={i} className={`hint-box ${h.tone}`}>
          {h.text}
        </div>
      ))}
    </Modal>
  );
}

/* Description: write a summary, and switch on Points so Enter starts a new "• " line. */
export function DescInput({ value, onChange, placeholder = 'What does done look like?' }) {
  const [points, setPoints] = useState(() => /^\s*•/m.test(value || ''));
  const ref = React.useRef(null);
  const caret = React.useRef(null); // where the cursor goes after the next render
  React.useLayoutEffect(() => {
    if (caret.current == null || !ref.current) return;
    ref.current.focus();
    ref.current.selectionStart = ref.current.selectionEnd = caret.current;
    caret.current = null;
  }, [value]);
  const insertAtCursor = (text) => {
    const el = ref.current;
    const v = value || '';
    const a = el ? el.selectionStart : v.length;
    const b = el ? el.selectionEnd : v.length;
    caret.current = a + text.length;
    onChange(v.slice(0, a) + text + v.slice(b));
  };
  const startPoints = () => {
    setPoints(true);
    const v = value || '';
    const el = ref.current;
    if (el) el.selectionStart = el.selectionEnd = v.length;
    insertAtCursor(v.trim() === '' ? '• ' : v.endsWith('\n') ? '• ' : '\n• ');
  };
  const onKeyDown = (e) => {
    if (!points || e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    const v = value || '';
    const a = e.target.selectionStart;
    const lineStart = v.lastIndexOf('\n', a - 1) + 1;
    // Enter on an empty bullet ends the list.
    if (v.slice(lineStart, a).trim() === '•') {
      onChange(v.slice(0, lineStart) + v.slice(a));
      setPoints(false);
      return;
    }
    insertAtCursor('\n• ');
  };
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <Seg sm options={[['text', 'Summary'], ['points', '• Points']]} value={points ? 'points' : 'text'} onChange={(m) => (m === 'points' ? startPoints() : setPoints(false))} />
        <span className="tiny muted">{points ? 'Enter adds a new point · Enter on an empty point ends the list' : 'Write a summary · switch to Points for a bullet list'}</span>
      </div>
      <textarea ref={ref} className="input" rows={points ? 5 : 3} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} placeholder={placeholder} />
    </div>
  );
}
