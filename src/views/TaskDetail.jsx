import React, { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon, Pill, Bar, Flags, StatusPill, Person, go, useRoute, Empty, Modal, Field, impactText, SizeImpact, Deadline } from '../components/ui.jsx';
import { LineChart } from '../components/charts.jsx';
import ActionDialog, { ACTION_UI } from '../components/ActionDialog.jsx';
import TaskForm from '../components/TaskForm.jsx';
import { P } from '../engine/policy.js';
import {
  itemById, userById, firstName, nameOf, progressOf, progressText, healthTone, projectOf, children, canSeeFull, verticalById, TYPE_LABEL, effectiveDeadline,
  allowedPauseMs, addComment, IMPACT_LABEL, DONE, uid,
} from '../engine/core.js';
import { allowedActions, perform, kpiActual, kpiAchievement, cycleAchievement, enterKpiActual, FREQ_LABEL, kpiSourceLabel } from '../engine/actions.js';
import { goalProgress, GOAL_LABEL, canSeePerson } from '../engine/goals.js';
import { potentialPoints, EVENT_LABEL } from '../engine/scoring.js';
import { now, DAY, HOUR, fmtDT, fmtDate, ago, fmtShort, dateKey, weekday, startOfMonth } from '../lib/time.js';

const BAR_ORDER = ['accept', 'decline', 'update', 'give_assignee', 'assign_back', 'block', 'unblock', 'request_extension', 'submit', 'review', 'verify_cycle', 'skip', 'change_owner', 'flag_size', 'reopen', 'cancel'];
const BAR_LABEL = { block: "I'm blocked", update: 'Update progress', submit: 'Submit for review', request_extension: 'Request extension', review: 'Review', give_assignee: 'Give to assignee', assign_back: 'Assign back', change_owner: 'Change owner', flag_size: 'Flag size/impact', skip: 'Skip occurrence', verify_cycle: 'Verify KPIs', cancel: 'Cancel', reopen: 'Reopen', unblock: 'Unblock', accept: 'Accept', decline: 'Decline' };

export default function TaskDetail({ id }) {
  const { s, me, commit, toast } = useStore();
  const { query } = useRoute();
  const item = itemById(s, id);
  const [act, setAct] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(null);
  const [tab, setTab] = useState('comments');

  useEffect(() => {
    if (query.do && item && allowedActions(s, me, item).includes(query.do)) setAct(query.do);
    if (query.do) go(`/task/${id}`);
  }, [query.do]); // eslint-disable-line

  if (!item) return <div className="card">This task doesn't exist (or was never created). Nothing is ever deleted, so check the link.</div>;
  if (!canSeeFull(s, me, item)) {
    return (
      <div className="card">
        <div className="eyebrow">Private task</div>
        <h1 className="page-title">Private task</h1>
        <div className="row mt">
          <StatusPill item={item} />
          <span className="muted">Due {fmtDT(item.currentDeadline)}</span>
        </div>
      </div>
    );
  }
  const acts = allowedActions(s, me, item);
  const bar = BAR_ORDER.filter((a) => acts.includes(a));
  const primary = ['accept', 'update', 'review', 'unblock', 'verify_cycle'];
  const proj = projectOf(s, item);
  const parent = item.parentId ? itemById(s, item.parentId) : null;
  const tone = healthTone(s, item);
  const kids = children(s, item.id).sort((a, b) => (a.cycleStart || a.currentDeadline || 0) - (b.cycleStart || b.currentDeadline || 0));
  const pts = potentialPoints(s, item);
  const user = userById(s, me);
  const muted = (user.muted || []).includes(item.id);
  const rule = item.recurringId ? s.recurring.find((r) => r.id === item.recurringId) : null;
  const eff = effectiveDeadline(s, item);

  return (
    <div>
      <div className="small muted" style={{ marginBottom: 8 }}>
        <a href="#/tasks" className="muted">
          ← My Tasks
        </a>
        {proj && (
          <>
            {' / '}
            <a href={`#/task/${proj.id}`} className="muted">
              {proj.title}
            </a>
          </>
        )}
        {parent && parent.id !== proj?.id && (
          <>
            {' / '}
            <a href={`#/task/${parent.id}`} className="muted">
              {parent.title}
            </a>
          </>
        )}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="muted" style={{ fontSize: 18 }}>
          {item.key}
        </span>
        <StatusPill item={item} />
        {item.type !== 'task' && <Pill>{TYPE_LABEL[item.type]}</Pill>}
        {rule && <Pill>↻ {FREQ_LABEL[rule.freq]}</Pill>}
        <Flags item={item} sm={false} />
      </div>
      <h1 className="page-title" style={{ margin: '8px 0 18px' }}>
        {item.title}
      </h1>

      <div className="row wrap" style={{ marginBottom: 22 }}>
        {bar.map((a) => (
          <button key={a} className={`btn ${primary.includes(a) && a === bar.find((x) => primary.includes(x)) ? 'primary' : a === 'submit' ? 'outline' : a === 'cancel' ? 'danger' : ''}`} onClick={() => setAct(a)}>
            {BAR_LABEL[a]}
          </button>
        ))}
        {acts.includes('edit') && (
          <button className="btn ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {acts.includes('pin') && (
          <button className="btn ghost" onClick={() => commit((st) => perform(st, me, item.id, 'pin', {}))}>
            <Icon name="pin" size={16} /> {item.pinned ? 'Unpin' : 'Pin'}
          </button>
        )}
        <button
          className="btn ghost"
          title="Mute non-critical Slack messages for this task"
          onClick={() =>
            commit((st) => {
              const u = userById(st, me);
              u.muted = muted ? u.muted.filter((x) => x !== item.id) : [...(u.muted || []), item.id];
            })
          }
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </div>
      {item.declined && item.status === 'awaiting' && (
        <div className="hint-box bad" style={{ marginBottom: 16 }}>
          {firstName(s, item.declined.by)} declined: “{item.declined.reason}”. {acts.includes('change_owner') ? 'Pick another owner with “Change owner”.' : ''}
        </div>
      )}
      {item.rejected && item.status === 'pending_approval' && (
        <div className="hint-box bad" style={{ marginBottom: 16 }}>
          {firstName(s, item.rejected.by)} didn't approve this owner: “{item.rejected.reason}”. Change the owner or cancel.
        </div>
      )}
      {item.status === 'blocked' && (
        <div className="hint-box warn" style={{ marginBottom: 16 }}>
          Blocked by <b>{firstName(s, item.blockedBy)}</b> since {ago(item.blockedAt)}: “{item.blockedReason}”. Deadline clock paused ({Math.min(Math.round((now() - item.blockedAt) / DAY * 10) / 10, allowedPauseMs(s, item) / DAY)} of {allowedPauseMs(s, item) / DAY} days used).
        </div>
      )}

      <div className="split">
        <div className="stack">
          <div className="card">
            <div className="card-label">Description</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{item.desc || <span className="faint">No description yet.</span>}</div>
            {item.links?.length > 0 && (
              <>
                <div className="card-label mt">Reference links</div>
                <div className="row wrap">
                  {item.links.map((l, i) => (
                    <a key={i} className="pill primary" href={l.url} target="_blank" rel="noreferrer">
                      <Icon name="link" size={13} /> {l.label || l.url}
                    </a>
                  ))}
                </div>
              </>
            )}
            {item.proofLinks?.length > 0 && (
              <>
                <div className="card-label mt">Proof</div>
                {item.proofLinks.map((l, i) => (
                  <div key={i}>
                    <a href={l} target="_blank" rel="noreferrer">
                      {l}
                    </a>
                  </div>
                ))}
              </>
            )}
            {item.cancelReason && item.status === 'cancelled' && <div className="hint-box info mt">Cancelled: “{item.cancelReason}”</div>}
          </div>

          {item.type !== 'stream' && (
            <div className="card">
              <div className="row">
                <div className="card-label spacer">
                  {item.progressMethod === 'checklist' ? 'Checklist · ' : item.progressMethod === 'subtasks' ? 'Sub-tasks · ' : 'Stage · '}Progress
                </div>
                <b style={{ fontSize: 18 }}>{progressText(s, item)}</b>
              </div>
              <Bar value={progressOf(s, item)} tone={tone} thick />
              {item.progressMethod === 'checklist' && (
                <div className="mt">
                  {item.checklist.map((c) => (
                    <div key={c.id} className="check" style={{ cursor: 'default' }}>
                      <span>{c.done ? '☑' : '☐'}</span> <span className={c.done ? '' : 'muted'}>{c.text}</span>
                    </div>
                  ))}
                  {acts.includes('update') && <div className="tiny muted mt-sm">Tick items with “Update progress” — every change carries a comment.</div>}
                </div>
              )}
              {item.pickupDate && <div className="small muted mt-sm">Next pick-up: {fmtDate(new Date(item.pickupDate).getTime())}</div>}
            </div>
          )}

          {(item.type === 'cycle' || item.type === 'stream') && <KpiPanel item={item} kids={kids} />}

          {['project', 'task', 'stream', 'cycle'].includes(item.type) && (
            <div className="card">
              <div className="row" style={{ marginBottom: 6 }}>
                <div className="card-label spacer">{item.type === 'stream' ? 'Cycles' : item.type === 'task' ? 'Sub-tasks' : 'Tasks'}</div>
                {item.type !== 'stream' && !DONE.includes(item.status) && (
                  <button className="btn xs" onClick={() => setAdding(item.type === 'task' ? 'subtask' : 'task')}>
                    + {item.type === 'task' ? 'Sub-task' : 'Task'}
                  </button>
                )}
              </div>
              {kids.length === 0 && <Empty>None yet.</Empty>}
              {kids.map((k) => (
                <a key={k.id} className="list-row" href={`#/task/${k.id}`} style={{ color: 'inherit' }}>
                  <span className="tiny muted" style={{ width: 64 }}>
                    {k.key}
                  </span>
                  <span className="grow ellipsis">{canSeeFull(s, me, k) ? k.title : 'Private task'}</span>
                  {k.type === 'cycle' && <span className="tiny muted">{fmtShort(k.cycleStart)}–{fmtShort(k.currentDeadline)}</span>}
                  <Person id={k.ownerId} />
                  <StatusPill item={k} sm />
                </a>
              ))}
            </div>
          )}

          <div className="card">
            <div className="tabs" style={{ marginBottom: 8 }}>
              {[['comments', `Comments (${s.comments.filter((c) => c.itemId === item.id).length})`], ...(['project', 'stream'].includes(item.type) ? [['all', 'All comments']] : []), ['activity', 'Activity'], ['score', 'Score']].map(([k, l]) => (
                <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
            </div>
            {tab === 'comments' && <Comments item={item} />}
            {tab === 'all' && <AllComments item={item} />}
            {tab === 'activity' && <Activity item={item} />}
            {tab === 'score' && <ScoreTab item={item} />}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-label">People</div>
            {[
              ['Owner', item.ownerId],
              ['Assignee', item.assigneeId],
              ['Creator', item.creatorId],
              ['Reviewer', item.reviewerId],
            ].map(([l, uid_]) => (
              <div key={l} className="row" style={{ padding: '6px 0' }}>
                <span className="muted" style={{ width: 100 }}>
                  {l}
                </span>
                {uid_ ? <Person id={uid_} size="" full /> : <span className="faint">—</span>}
              </div>
            ))}
            <div className="row" style={{ padding: '6px 0', alignItems: 'flex-start' }}>
              <span className="muted" style={{ width: 100 }}>
                Contributors
              </span>
              <span>{item.contributors?.length ? item.contributors.map((c) => firstName(s, c)).join(', ') : <span className="faint">—</span>}</span>
            </div>
          </div>
          <div className="card">
            <div className="card-label">Deadline</div>
            <Row l="Current" v={<b>{item.currentDeadline ? fmtDT(item.currentDeadline) : 'No end date (stream)'}</b>} />
            <Row l="Original" v={item.originalDeadline ? fmtDT(item.originalDeadline) : '—'} />
            {eff && eff !== item.currentDeadline && <Row l="With pause" v={fmtDT(eff)} />}
            <Row l="Extensions" v={`${item.extensionsCount || 0} used · ${P(s, 'freeExtensions')} free with ${P(s, 'freeExtNoticeH')}h notice`} />
            {item.submittedAt && <Row l="Submitted" v={fmtDT(item.submittedAt)} />}
            {item.closedAt && <Row l={item.status === 'cancelled' ? 'Cancelled' : 'Closed'} v={fmtDT(item.closedAt)} />}
          </div>
          <div className="card">
            <div className="card-label">Size & Impact</div>
            <div className="row wrap">
              <Pill>
                Size {item.size} · {item.estHours}h
              </Pill>
              <Pill tone={item.impact === 5 ? 'overdue' : item.impact === 3 ? 'gold' : ''}>{impactText(item.impact)}</Pill>
            </div>
            <div className="muted mt-sm">“{item.impactReason}”</div>
            <div className="row" style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
              <span className="muted spacer">{item.status === 'closed' ? 'Rating' : 'Potential points'}</span>
              <b style={{ color: 'var(--primary-ink)' }}>
                {item.status === 'closed' ? '★'.repeat(item.rating || 0) : `${pts.base} → up to ${pts.max}`}
              </b>
            </div>
          </div>
          <div className="card">
            <Row l="Vertical" v={verticalById(s, item.vertical)?.name} />
            <Row l={proj?.type === 'stream' ? 'Stream' : 'Project'} v={proj ? <a href={`#/task/${proj.id}`}>{proj.title}</a> : '—'} />
            {rule && <Row l="Repeats" v={`${FREQ_LABEL[rule.freq]} · next ${fmtDate(rule.nextRun)}`} />}
            <Row l="Created" v={`${fmtDate(item.createdAt)} by ${firstName(s, item.creatorId)}`} />
            {item.acceptedAt && <Row l="Accepted" v={fmtDT(item.acceptedAt)} />}
          </div>
          {(item.goalLinks || []).length > 0 && (
            <div className="card">
              <div className="card-label">Linked goals</div>
              {item.goalLinks
                .map((id) => s.goals.find((g) => g.id === id))
                .filter((g) => g && canSeePerson(s, me, g.userId))
                .map((g) => (
                  <a key={g.id} href="#/goals" className="list-row" style={{ color: 'inherit' }}>
                    <span className="grow">
                      {g.title}
                      <div className="tiny muted">{GOAL_LABEL[g.type]}</div>
                    </span>
                    <b>{goalProgress(g)}%</b>
                  </a>
                ))}
            </div>
          )}
        </div>
      </div>

      {act && <ActionDialog item={item} action={act} onClose={() => setAct(null)} />}
      {editing && <TaskForm edit={item} onClose={() => setEditing(false)} />}
      {adding && <TaskForm preset={{ type: adding, parentId: item.type === 'stream' ? null : item.id, ownerId: item.ownerId }} onClose={() => setAdding(null)} />}
    </div>
  );
}

const Row = ({ l, v }) => (
  <div className="row" style={{ padding: '5px 0', alignItems: 'flex-start' }}>
    <span className="muted" style={{ width: 100, flexShrink: 0 }}>
      {l}
    </span>
    <span>{v}</span>
  </div>
);

function Comments({ item }) {
  const { s, me, commit } = useStore();
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const list = s.comments.filter((c) => c.itemId === item.id).sort((a, b) => a.ts - b.ts);
  const roots = list.filter((c) => !c.parentId);
  const post = () => {
    if (!text.trim()) return;
    commit((st) => {
      addComment(st, me, item.id, text, null, reply);
    });
    setText('');
    setReply(null);
  };
  const One = ({ c, nested }) => (
    <div className="row" style={{ alignItems: 'flex-start', padding: '10px 0', marginLeft: nested ? 42 : 0 }}>
      <Person id={c.userId} size="" />
      <div className="spacer" style={{ minWidth: 0 }}>
        <div className="small muted">
          {c.action ? `${c.action} · ` : ''}
          {ago(c.ts)}
        </div>
        <div style={{ whiteSpace: 'pre-wrap' }}>{c.text.split(/(@[A-Za-z]+)/g).map((p, i) => (p.startsWith('@') ? <b key={i} style={{ color: 'var(--primary-ink)' }}>{p}</b> : p))}</div>
        {!nested && (
          <button className="btn xs ghost" style={{ padding: 0, marginTop: 2 }} onClick={() => setReply(c.id)}>
            Reply
          </button>
        )}
      </div>
    </div>
  );
  return (
    <div>
      {roots.length === 0 && <Empty>No comments yet.</Empty>}
      {[...roots].reverse().map((c) => (
        <div key={c.id} style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <One c={c} />
          {list.filter((r) => r.parentId === c.id).map((r) => (
            <One key={r.id} c={r} nested />
          ))}
        </div>
      ))}
      {reply && (
        <div className="tiny muted mt-sm">
          Replying in thread · <button className="btn xs ghost" onClick={() => setReply(null)}>cancel</button>
        </div>
      )}
      <div className="row mt">
        <input className="input" placeholder="Write a comment… use @ to mention" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && post()} />
        <button className="btn primary" onClick={post}>
          Post
        </button>
      </div>
    </div>
  );
}

function AllComments({ item }) {
  const { s, me } = useStore();
  const ids = new Set();
  const walk = (id) => {
    ids.add(id);
    children(s, id).forEach((k) => walk(k.id));
  };
  walk(item.id);
  const list = s.comments.filter((c) => ids.has(c.itemId) && canSeeFull(s, me, itemById(s, c.itemId))).sort((a, b) => b.ts - a.ts).slice(0, 100);
  if (!list.length) return <Empty>No comments across this {item.type} yet.</Empty>;
  return list.map((c) => (
    <div key={c.id} className="list-row" style={{ alignItems: 'flex-start' }}>
      <Person id={c.userId} />
      <div className="grow">
        <div className="tiny muted">
          <a href={`#/task/${c.itemId}`}>{itemById(s, c.itemId)?.title}</a> · {c.action ? `${c.action} · ` : ''}
          {ago(c.ts)}
        </div>
        <div>{c.text}</div>
      </div>
    </div>
  ));
}

function Activity({ item }) {
  const { s } = useStore();
  const list = s.activity.filter((a) => a.itemId === item.id).sort((a, b) => b.ts - a.ts);
  return (
    <div>
      {list.map((a) => (
        <div key={a.id} className="list-row small">
          <span className="muted nowrap" style={{ width: 130 }}>
            {fmtDT(a.ts)}
          </span>
          <span className="grow">
            <b>{a.userId ? firstName(s, a.userId) : 'System'}</b> · {a.action}
            {(a.from || a.to) && (
              <span className="muted">
                {' '}
                {a.from ?? '—'} → {a.to ?? '—'}
              </span>
            )}
          </span>
        </div>
      ))}
      <div className="tiny faint mt-sm">The activity log can't be edited or deleted.</div>
    </div>
  );
}

function ScoreTab({ item }) {
  const { s, me, commit, toast } = useStore();
  const [appeal, setAppeal] = useState(null);
  const [reason, setReason] = useState('');
  const list = s.scoreEvents.filter((e) => e.itemId === item.id).sort((a, b) => b.ts - a.ts);
  const send = () => {
    if (!reason.trim()) return toast('Add a reason for the appeal.', 'error');
    commit((st) => {
      st.appeals.push({ id: uid('ap'), scoreEventId: appeal.id, userId: me, reason, month: dateKey(startOfMonth(now())), status: 'open', ts: now() });
    });
    toast('Appeal raised — it will be settled in the monthly review window.');
    setAppeal(null);
    setReason('');
  };
  return (
    <div>
      {list.length === 0 && <Empty>No score events yet. Points are awarded when the reviewer accepts.</Empty>}
      {list.map((e) => {
        const appealed = s.appeals.find((a) => a.scoreEventId === e.id);
        return (
          <div key={e.id} className="list-row small">
            <span className="muted nowrap" style={{ width: 100 }}>
              {fmtDate(e.ts)}
            </span>
            <span className="grow">
              <b>{firstName(s, e.userId)}</b> · {e.code} {EVENT_LABEL[e.type]} — <span className="muted">{e.note}</span>
              {e.reversed && <Pill className="sm"> reversed</Pill>}
            </span>
            <b style={{ color: e.points >= 0 ? 'var(--ok)' : 'var(--overdue)' }}>
              {e.points > 0 ? '+' : ''}
              {e.points}
            </b>
            {e.userId === me && (e.points < 0 || e.type === 'task') && !appealed && (
              <button className="btn xs ghost" onClick={() => setAppeal(e)}>
                Appeal
              </button>
            )}
            {appealed && <Pill className="sm">Appeal {appealed.status}</Pill>}
          </div>
        );
      })}
      <div className="tiny faint mt-sm">Policy version is stored on every event — later setting changes never recalculate past scores.</div>
      {appeal && (
        <Modal
          title="Raise an appeal"
          sub={`${appeal.code} · ${appeal.note}`}
          onClose={() => setAppeal(null)}
          footer={
            <button className="btn primary" onClick={send}>
              Send appeal
            </button>
          }
        >
          <Field label="What should be reconsidered, and why?">
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function KpiPanel({ item, kids }) {
  const { s, me, commit, toast } = useStore();
  const cycles = item.type === 'stream' ? kids.filter((k) => k.type === 'cycle') : [item];
  const current = item.type === 'stream' ? cycles.find((c) => !c.verified && c.cycleStart <= now()) || cycles[cycles.length - 1] : item;
  const [vals, setVals] = useState({});
  if (!current) return null;
  const kpis = s.kpis.filter((k) => k.itemId === current.id);
  const isOwner = current.ownerId === me;
  const saturday = weekday(now()) === 6;
  const save = (k) => {
    const v = vals[k.id] || {};
    const r = commit((st) => enterKpiActual(st, me, k.id, v.value, v.link));
    if (!r.error) {
      toast(`${k.name} actual saved.`);
      setVals((x) => ({ ...x, [k.id]: {} }));
    }
  };
  return (
    <div className="card">
      {item.type === 'stream' && (
        <>
          <div className="card-label">Cycle timeline</div>
          <div className="row wrap" style={{ marginBottom: 16 }}>
            {cycles.map((c) => (
              <a key={c.id} href={`#/task/${c.id}`} className={`pill ${c.id === current.id ? 'primary' : c.verified ? 'ok' : ''}`}>
                {c.title.split('· ')[1]} · {fmtShort(c.cycleStart)}–{fmtShort(c.currentDeadline)} · {Math.round(cycleAchievement(s, c) * 100)}%{c.verified ? ' ✓' : ''}
              </a>
            ))}
          </div>
        </>
      )}
      <div className="row">
        <div className="card-label spacer">KPIs · {current.title.split('· ')[1] || current.title}</div>
        {isOwner && <span className={`pill sm ${saturday ? 'risk' : ''}`}>{saturday ? "It's Saturday — enter this week's actuals" : 'Actuals due every Saturday'}</span>}
      </div>
      {kpis.map((k) => {
        const actual = kpiActual(k);
        const ach = Math.round(kpiAchievement(s, k) * 100);
        let run = 0;
        const series = k.actuals.map((a, i) => {
          run = k.agg === 'latest' ? +a.value : run + +a.value;
          return { label: `Wk ${i + 1}`, value: run };
        });
        return (
          <div key={k.id} style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 12, marginTop: 12 }}>
            <div className="row">
              <b className="spacer">{k.name}</b>
              <span>
                {actual ?? '—'}
                {k.unit} <span className="muted">/ {k.dir === '<=' ? '≤' : '≥'} {k.target}{k.unit}</span>
              </span>
              <Pill tone={ach >= 100 ? 'ok' : ach >= 70 ? 'gold' : 'risk'} className="sm">
                {ach}%
              </Pill>
            </div>
            <div className="tiny muted">
              Source: {kpiSourceLabel(k)}
              {k.source && k.source !== 'manual' ? ' · filled in automatically every morning (a hand-entered number for the same week wins)' : ''}
            </div>
            {series.length > 0 && <LineChart data={series} height={150} target={k.target} unit={k.unit === '₹' ? '' : k.unit} targetLabel={`Target ${k.dir === '<=' ? '≤' : '≥'} ${k.target}`} />}
            <div className="tiny muted">
              {k.actuals.map((a) => `${fmtShort(a.ts)}: ${a.value}${k.unit}${a.auto ? ' (auto)' : ''}${a.verifiedBy ? ' ✓' : ''}`).join(' · ') || 'No actuals yet.'}
            </div>
            {isOwner && !current.verified && (
              <div className="row wrap mt-sm">
                <input className="input sm" style={{ width: 110 }} type="number" placeholder="Value" value={vals[k.id]?.value || ''} onChange={(e) => setVals((x) => ({ ...x, [k.id]: { ...x[k.id], value: e.target.value } }))} />
                <input className="input sm" style={{ flex: 1, minWidth: 180 }} placeholder="Source link (Zoho, Meta Ads, sheet)" value={vals[k.id]?.link || ''} onChange={(e) => setVals((x) => ({ ...x, [k.id]: { ...x[k.id], link: e.target.value } }))} />
                <button className="btn sm outline" onClick={() => save(k)}>
                  Enter actual
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
