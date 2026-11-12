import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Accent, Pill, Bar, Modal, Field, Choice, Empty, UserSelect, Icon } from '../components/ui.jsx';
import {
  GOAL_TYPES, GOAL_LABEL, MEASURES, periodOptions, goalProgress, goalHealth, HEALTH_LABEL, HEALTH_TONE, createGoal, checkInGoal, setGoalStatus,
  canSeePerson, linkedTasks, reviewsFor, acknowledgeReview, RATING_LABEL, PERF_COMPONENTS,
} from '../engine/goals.js';
import { teamScope, firstName, nameOf } from '../engine/core.js';
import { missingTables } from '../lib/sync.js';
import { fmtDate, parseKey, ago } from '../lib/time.js';

const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
const withUnit = (n, unit) => (unit === '₹' ? `₹${fmtNum(n)}` : unit === '%' ? `${fmtNum(n)}%` : `${fmtNum(n)}${unit ? ' ' + unit : ''}`);

export default function GoalsView() {
  const { s, me } = useStore();
  const periods = useMemo(() => periodOptions(), []);
  const [person, setPerson] = useState(me);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const [adding, setAdding] = useState(false);
  const [checking, setChecking] = useState(null);
  const [statusFor, setStatusFor] = useState(null);
  const period = periods.find((p) => p.key === periodKey);
  const scope = teamScope(s, me);
  const goals = s.goals
    .filter((g) => g.userId === person && canSeePerson(s, me, g.userId))
    .filter((g) => g.periodStart <= period.end && g.periodEnd >= period.start);
  const reviews = reviewsFor(s, me, person).filter((r) => r.status !== 'draft' || r.reviewerId === me);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{person === me ? 'Your' : `${firstName(s, person)}'s`} goals · {period.label}</div>
          <h1 className="page-title">
            <Accent text={person === me ? 'My *goals*' : `${firstName(s, person)}'s *goals*`} />
          </h1>
          <div className="page-sub" style={{ maxWidth: 760 }}>
            Tasks are one part of performance. Goals cover the rest: top goals, behaviour and skills, health (private), extra initiatives and KPIs.
          </div>
        </div>
        <div className="row wrap">
          {scope.length > 0 && <UserSelect className="input sm" style={{ width: 'auto' }} value={person} onChange={(v) => setPerson(v || me)} include={[me, ...scope.filter((x) => x !== me)]} placeholder="Me" />}
          <select className="input sm" style={{ width: 'auto' }} value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> New goal
          </button>
        </div>
      </div>

      {missingTables().length > 0 && (
        <div className="hint-box warn" style={{ marginBottom: 16 }}>
          Goals and reviews aren't saved yet: an admin needs to run supabase/migrations/004_goals_reviews_kpi_sources.sql in the Supabase SQL editor.
        </div>
      )}
      <div className="grid g2">
        {GOAL_TYPES.map(([type, label]) => {
          const list = goals.filter((g) => g.type === type);
          return (
            <div key={type} className="card">
              <div className="row" style={{ marginBottom: 8 }}>
                <h2 className="card-title spacer" style={{ margin: 0 }}>
                  {label}
                </h2>
                {type === 'health' && (
                  <Pill className="sm">
                    <Icon name="lock" size={12} /> Private
                  </Pill>
                )}
              </div>
              {list.length === 0 && <Empty>No {label.toLowerCase()} goals for this period.</Empty>}
              {list.map((g) => {
                const pct = goalProgress(g);
                const h = goalHealth(g);
                const tasks = linkedTasks(s, g.id);
                return (
                  <div key={g.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
                    <div className="row">
                      <b className="spacer">{g.title}</b>
                      <Pill tone={HEALTH_TONE[h]} className="sm">
                        {HEALTH_LABEL[h]}
                      </Pill>
                    </div>
                    <div className="row mt-sm" style={{ gap: 12 }}>
                      <Bar value={pct} tone={HEALTH_TONE[h] === 'blocked' ? 'blocked' : HEALTH_TONE[h]} />
                      <span className="small b nowrap">{pct}%</span>
                    </div>
                    <div className="tiny muted mt-sm">
                      {g.measure === 'done' ? (g.current >= 1 ? 'Done' : 'Not done yet') : `${withUnit(g.current, g.unit)} of ${g.dir === '<=' ? '≤ ' : ''}${withUnit(g.target, g.unit)}`}
                      {' · '}
                      {fmtDate(parseKey(g.periodStart))} – {fmtDate(parseKey(g.periodEnd))}
                      {g.weight > 1 ? ` · weight ${g.weight}` : ''}
                      {tasks.length ? ` · ${tasks.filter((t) => t.status === 'closed').length}/${tasks.length} linked tasks closed` : ''}
                      {g.lastCheckIn ? ` · checked in ${ago(g.lastCheckIn)}` : ''}
                      {g.createdBy !== g.userId ? ` · set by ${firstName(s, g.createdBy)}` : ''}
                    </div>
                    {g.status === 'active' && (
                      <div className="row mt-sm">
                        <button className="btn xs outline" onClick={() => setChecking(g)}>
                          Check in
                        </button>
                        <button className="btn xs ghost" onClick={() => setStatusFor(g)}>
                          Mark achieved / drop
                        </button>
                      </div>
                    )}
                    {g.statusNote && g.status !== 'active' && <div className="tiny muted mt-sm">“{g.statusNote}”</div>}
                  </div>
                );
              })}
            </div>
          );
        })}
        <ReviewsCard person={person} reviews={reviews} />
      </div>

      {adding && <GoalForm person={person} period={period} onClose={() => setAdding(false)} />}
      {checking && <CheckIn goal={checking} onClose={() => setChecking(null)} />}
      {statusFor && <StatusDialog goal={statusFor} onClose={() => setStatusFor(null)} />}
    </div>
  );
}

function ReviewsCard({ person, reviews }) {
  const { s, me, commit, toast } = useStore();
  const [ack, setAck] = useState(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(null);
  return (
    <div className="card">
      <h2 className="card-title">
        <Accent text={person === me ? 'My *reviews*' : 'Reviews'} />
      </h2>
      {reviews.length === 0 && <Empty>No reviews yet.</Empty>}
      {reviews
        .slice()
        .sort((a, b) => (b.sharedAt || b.createdAt) - (a.sharedAt || a.createdAt))
        .map((r) => (
          <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
            <div className="grow">
              <b>{r.periodLabel}</b> <span className="tiny muted">· by {firstName(s, r.reviewerId)}</span>
              <div className="tiny muted">
                {r.rating ? `${r.rating}/5 · ${RATING_LABEL[r.rating]}` : 'Not rated yet'} · overall {r.snapshot?.composite ?? '—'}
              </div>
            </div>
            <Pill tone={r.status === 'acknowledged' ? 'ok' : r.status === 'shared' ? 'gold' : ''} className="sm">
              {r.status === 'shared' ? 'Waiting for you' : r.status}
            </Pill>
            <button className="btn xs" onClick={() => setOpen(r)}>
              Read
            </button>
            {r.status === 'shared' && r.userId === me && (
              <button className="btn xs primary" onClick={() => setAck(r)}>
                Acknowledge
              </button>
            )}
          </div>
        ))}
      {open && (
        <Modal title={<Accent text={`${open.periodLabel} *review*`} />} sub={`${nameOf(s, open.userId)} · by ${nameOf(s, open.reviewerId)}`} onClose={() => setOpen(null)} wide>
          <ReviewBody r={open} />
        </Modal>
      )}
      {ack && (
        <Modal
          title="Acknowledge review"
          sub={ack.periodLabel}
          onClose={() => setAck(null)}
          footer={
            <button
              className="btn primary"
              onClick={() => {
                const res = commit((st) => acknowledgeReview(st, me, ack.id, note));
                if (!res.error) {
                  toast('Thanks — your manager has been told.');
                  setAck(null);
                }
              }}
            >
              Acknowledge
            </button>
          }
        >
          <Field label="Anything you'd like to add? (optional)">
            <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

export function ReviewBody({ r }) {
  const snap = r.snapshot || {};
  return (
    <div className="stack-sm">
      <div className="row wrap" style={{ gap: 8 }}>
        <Pill tone="primary">Overall {snap.composite ?? '—'}</Pill>
        {r.rating && <Pill tone="gold">{r.rating}/5 · {RATING_LABEL[r.rating]}</Pill>}
      </div>
      <div className="grid g3" style={{ gap: 10 }}>
        {(snap.components || []).map((c) => (
          <div key={c.key} className="card tight">
            <div className="card-label">{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{c.value ?? '—'}</div>
            <div className="tiny muted">weight {c.weight}%</div>
          </div>
        ))}
      </div>
      {r.strengths && (
        <Field label="Strengths">
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.strengths}</div>
        </Field>
      )}
      {r.improve && (
        <Field label="One area to grow">
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.improve}</div>
        </Field>
      )}
      {r.notes && (
        <Field label="Notes">
          <div style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>
        </Field>
      )}
      {r.ackNote && <div className="hint-box ok">Their response: “{r.ackNote}”</div>}
    </div>
  );
}

function GoalForm({ person, period, onClose }) {
  const { s, me, commit, toast } = useStore();
  const [f, setF] = useState({ userId: person, type: 'top', title: '', desc: '', periodStart: period.start, periodEnd: period.end, measure: 'number', dir: '>=', target: '', current: 0, unit: '', weight: 1 });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const scope = teamScope(s, me);
  const save = () => {
    const r = commit((st) => createGoal(st, me, f));
    if (!r.error) {
      toast('Goal added.');
      onClose();
    }
  };
  return (
    <Modal wide title={<Accent text="New *goal*" />} onClose={onClose} footer={<button className="btn primary" onClick={save}>Add goal</button>}>
      <div className="form-grid">
        <Field label="Type" className="full">
          <Choice options={GOAL_TYPES} value={f.type} onChange={(v) => set('type', v)} />
        </Field>
        {f.type === 'health' && <div className="hint-box info full">Health goals are always private: only the person, their managers and founders/admins can see them. They don't count in the overall review score unless an admin changes that.</div>}
        <Field label="Goal" className="full">
          <input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Grow monthly leads to 400" autoFocus />
        </Field>
        {scope.length > 0 && (
          <Field label="Whose goal">
            <UserSelect value={f.userId} onChange={(v) => set('userId', v || me)} include={[me, ...scope.filter((x) => x !== me)]} />
          </Field>
        )}
        <Field label="Measured as">
          <Choice options={MEASURES} value={f.measure} onChange={(v) => set('measure', v)} />
        </Field>
        {f.measure !== 'done' && (
          <>
            <Field label="Target">
              <div className="row">
                <select className="input sm" style={{ width: 70 }} value={f.dir} onChange={(e) => set('dir', e.target.value)}>
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                </select>
                <input className="input" type="number" value={f.target} onChange={(e) => set('target', e.target.value)} />
              </div>
            </Field>
            <Field label="Unit (optional)">
              <input className="input" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="leads, ₹, steps…" />
            </Field>
            <Field label="Where it stands today">
              <input className="input" type="number" value={f.current} onChange={(e) => set('current', e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Period start">
          <input className="input" type="date" value={f.periodStart} onChange={(e) => set('periodStart', e.target.value)} />
        </Field>
        <Field label="Period end">
          <input className="input" type="date" value={f.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} />
        </Field>
        <Field label="Weight (1–5)" hint="How much this goal counts compared with the person's other goals.">
          <Choice options={[1, 2, 3, 4, 5].map((n) => [n, String(n)])} value={+f.weight} onChange={(v) => set('weight', v)} />
        </Field>
        <Field label="Description (optional)" className="full">
          <textarea className="input" value={f.desc} onChange={(e) => set('desc', e.target.value)} placeholder="What does success look like?" />
        </Field>
      </div>
    </Modal>
  );
}

function CheckIn({ goal, onClose }) {
  const { me, commit, toast } = useStore();
  const [value, setValue] = useState(goal.measure === 'done' ? 1 : goal.current ?? '');
  const [note, setNote] = useState('');
  const save = () => {
    const r = commit((st) => checkInGoal(st, me, goal.id, value, note));
    if (!r.error) {
      toast('Check-in saved.');
      onClose();
    }
  };
  return (
    <Modal title="Check in" sub={goal.title} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save check-in</button>}>
      {goal.measure === 'done' ? (
        <Field label="Status">
          <Choice options={[[0, 'Not done yet'], [1, 'Done']]} value={+value} onChange={setValue} />
        </Field>
      ) : (
        <Field label={`Current value${goal.unit ? ` (${goal.unit})` : ''}`} hint={`Target ${goal.dir === '<=' ? '≤ ' : ''}${goal.target}${goal.unit}`}>
          <input className="input" type="number" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      )}
      <Field label="What moved? (required)">
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {(goal.checkins || []).length > 0 && (
        <div className="small">
          <div className="lbl">Earlier check-ins</div>
          {[...goal.checkins].reverse().slice(0, 5).map((c) => (
            <div key={c.id} className="list-row tiny">
              <span className="muted" style={{ width: 90 }}>
                {fmtDate(c.ts)}
              </span>
              <span className="b" style={{ width: 70 }}>
                {fmtNum(c.value)}
              </span>
              <span className="grow">{c.note}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function StatusDialog({ goal, onClose }) {
  const { me, commit, toast } = useStore();
  const [status, setStatus] = useState('achieved');
  const [note, setNote] = useState('');
  return (
    <Modal
      title="Update goal"
      sub={goal.title}
      onClose={onClose}
      footer={
        <button
          className="btn primary"
          onClick={() => {
            const r = commit((st) => setGoalStatus(st, me, goal.id, status, note));
            if (!r.error) {
              toast('Saved.');
              onClose();
            }
          }}
        >
          Save
        </button>
      }
    >
      <Choice options={[['achieved', 'Achieved'], ['dropped', 'Drop this goal']]} value={status} onChange={setStatus} tones={{ achieved: 'ok', dropped: 'warn' }} />
      <Field label="Why? (required)">
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}
export { PERF_COMPONENTS };
