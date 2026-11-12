import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Seg, Pill, Bar, Avatar, Modal, TierPill, go, Empty, StatusPill, Icon } from '../components/ui.jsx';
import TaskForm from '../components/TaskForm.jsx';
import { Kanban } from './Tasks.jsx';
import { ApprovalCard } from './Approvals.jsx';
import { teamScope, userById, flagsOf, loadFor, loadTone, isWorkItem, canSeeFull, verticalById, firstName, isFA } from '../engine/core.js';
import { approvalsFor } from '../engine/actions.js';
import { deliveryScore } from '../engine/scoring.js';
import { sowStatus, offDayOf, sowDayOf, sowRequired } from '../engine/sow.js';
import { now, DAY, startOfWeek, startOfMonth, endOfMonth, addMonths, dateKey, addKey, fmtTime, fmtShort, monthName } from '../lib/time.js';

export function onTimePct(s, people, monthTs) {
  const from = startOfMonth(monthTs);
  const to = endOfMonth(monthTs);
  const ev = s.scoreEvents.filter((e) => e.type === 'task' && people.includes(e.userId) && e.ts >= from && e.ts <= to && !e.reversed);
  return ev.length ? Math.round((ev.filter((e) => e.meta?.onTime).length / ev.length) * 100) : null;
}

export function SowPill({ userId }) {
  const { s } = useStore();
  const today = dateKey(now());
  const st = sowStatus(s, userId, today);
  const d = sowDayOf(s, userId, today);
  if (st === 'on_time') return <Pill tone="ok" className="sm">✓ {fmtTime(d.submittedAt)}</Pill>;
  if (st === 'off') return <Pill className="sm">Off · {offDayOf(s, userId, today).code}</Pill>;
  if (st === 'holiday') return <Pill className="sm">Holiday</Pill>;
  if (st === 'sunday') return <Pill className="sm">Sunday</Pill>;
  // Not yet today — show yesterday's miss if any
  let k = addKey(today, -1);
  for (let g = 0; g < 3 && !sowRequired(s, userId, k); g++) k = addKey(k, -1);
  const prev = sowStatus(s, userId, k);
  if (prev === 'missed') return <Pill tone="overdue" className="sm">✗ Missing</Pill>;
  return <Pill className="sm">Due tonight</Pill>;
}

export default function TeamView() {
  const { s, me } = useStore();
  const [view, setView] = useState('people');
  const [vertical, setVertical] = useState('all');
  const [cell, setCell] = useState(null);
  const [creating, setCreating] = useState(false);
  const t = now();
  let people = teamScope(s, me);
  if (vertical !== 'all') people = people.filter((id) => userById(s, id).verticals.some((v) => v.vid === vertical));
  const ws = startOfWeek(t);
  const work = s.items.filter((i) => people.includes(i.ownerId) && isWorkItem(i));
  const live = work.filter((i) => ['awaiting', 'open', 'in_progress', 'blocked', 'in_review'].includes(i.status));
  const overdue = live.filter((i) => flagsOf(s, i).overdue);
  const atRisk = live.filter((i) => flagsOf(s, i).atRisk);
  const today = dateKey(t);
  const sowIn = people.filter((p) => ['on_time', 'late'].includes(sowStatus(s, p, today))).length;
  const sowOff = people.filter((p) => ['off', 'holiday'].includes(sowStatus(s, p, today))).length;
  const otNow = onTimePct(s, people, t);
  const otPrev = onTimePct(s, people, addMonths(startOfMonth(t), -1));
  const pending = [
    ...approvalsFor(s, me),
  ];
  const reviews = s.items.filter((i) => i.status === 'in_review' && i.reviewerId === me);
  const masked = (i) => !canSeeFull(s, me, i);
  const verts = [...new Set(teamScope(s, me).flatMap((id) => userById(s, id).verticals.map((v) => v.vid)))];

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {vertical === 'all' ? (isFA(s, me) ? 'Everyone' : 'Your reporting tree') : verticalById(s, vertical)?.name} · {people.length} people
          </div>
          <h1 className="page-title">Team</h1>
        </div>
        <div className="row wrap">
          <select className="input sm" style={{ width: 'auto' }} value={vertical} onChange={(e) => setVertical(e.target.value)}>
            <option value="all">All verticals</option>
            {verts.map((v) => (
              <option key={v} value={v}>
                {verticalById(s, v)?.name}
              </option>
            ))}
          </select>
          <Seg options={[['people', 'List'], ['kanban', 'Kanban'], ['workload', 'Workload']]} value={view} onChange={setView} />
          <button className="btn primary" onClick={() => setCreating(true)}>
            + New task
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="card stat">
          <div className="card-label">SOW submitted today</div>
          <div className="num">
            {sowIn}
            <small>/{people.length - sowOff}</small>
          </div>
          <div className="sub">
            {sowOff} off · {people.length - sowOff - sowIn} not yet
          </div>
        </div>
        <div className="card stat">
          <div className="card-label">On-time this month</div>
          <div className="num" style={{ color: 'var(--ok-ink)' }}>{otNow == null ? '—' : `${otNow}%`}</div>
          <div className="sub">{otNow != null && otPrev != null ? `${otNow >= otPrev ? '↑' : '↓'} ${Math.abs(otNow - otPrev)}% vs ${monthName(addMonths(startOfMonth(t), -1))}` : 'No closed tasks yet'}</div>
        </div>
        <div className="card stat">
          <div className="card-label">Overdue</div>
          <div className="num" style={{ color: 'var(--overdue)' }}>{overdue.length}</div>
          <div className="sub">{overdue.filter((i) => i.impact === 5).length} are Impact 5</div>
        </div>
        <div className="card stat">
          <div className="card-label">At-risk</div>
          <div className="num" style={{ color: 'var(--risk-ink)' }}>{atRisk.length}</div>
          <div className="sub">alerts sent to owners</div>
        </div>
      </div>

      {view === 'kanban' && <Kanban items={live.concat(work.filter((i) => i.status === 'closed' && t - (i.closedAt || 0) < 7 * DAY))} masked={masked} />}

      {view === 'workload' && (
        <div className="card">
          <div className="small muted" style={{ marginBottom: 12 }}>
            Load = estimated hours due ÷ (daily hours × 6 × 80%). <Pill tone="ok" className="sm">&lt;80%</Pill> <Pill tone="risk" className="sm">80–100%</Pill> <Pill tone="overdue" className="sm">&gt;100%</Pill> Click a cell to see the tasks.
          </div>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Person</th>
                  {[0, 1, 2, 3].map((w) => (
                    <th key={w} className="num">
                      Week of {fmtShort(ws + w * 7 * DAY)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p}>
                    <td>
                      <span className="person">
                        <Avatar id={p} /> {userById(s, p).name}
                      </span>
                    </td>
                    {[0, 1, 2, 3].map((w) => {
                      const pct = loadFor(s, p, ws + w * 7 * DAY);
                      return (
                        <td key={w} className="num">
                          <Pill tone={loadTone(pct)} className="click" onClick={() => setCell({ p, w })}>
                            {pct}%
                          </Pill>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'people' && (
        <div className="split" style={{ gridTemplateColumns: 'minmax(0, 2.3fr) minmax(280px, 1fr)' }}>
          <div className="card" style={{ padding: '10px 14px' }}>
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>SOW today</th>
                    <th className="num">Due wk</th>
                    <th className="num">Overdue</th>
                    <th className="num">At-risk</th>
                    <th className="num">Blocked</th>
                    <th>Load</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => {
                    const mine = live.filter((i) => i.ownerId === p);
                    const due = work.filter((i) => i.ownerId === p && i.currentDeadline >= ws && i.currentDeadline < ws + 7 * DAY && i.status !== 'cancelled').length;
                    const od = mine.filter((i) => flagsOf(s, i).overdue).length;
                    const ar = mine.filter((i) => flagsOf(s, i).atRisk).length;
                    const bl = mine.filter((i) => i.status === 'blocked').length;
                    const load = loadFor(s, p, ws);
                    const ds = deliveryScore(s, p);
                    return (
                      <tr key={p} className="click" onClick={() => setCell({ p, list: true })}>
                        <td>
                          <span className="person">
                            <Avatar id={p} />
                            <b style={{ fontWeight: 500 }}>{userById(s, p).name.split(' ')[0]}</b>
                          </span>
                        </td>
                        <td>
                          <SowPill userId={p} />
                        </td>
                        <td className="num">{due}</td>
                        <td className="num" style={{ color: od ? 'var(--overdue)' : '', fontWeight: od ? 600 : 400 }}>
                          {od}
                        </td>
                        <td className="num">{ar}</td>
                        <td className="num">{bl}</td>
                        <td style={{ minWidth: 90 }}>
                          <Bar value={Math.min(load, 100)} tone={loadTone(load)} />
                          <div className="tiny">{load}%</div>
                        </td>
                        <td className="nowrap">
                          <TierPill score={ds.score} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <h2 className="card-title" style={{ marginBottom: 2 }}>
              Pending my action
            </h2>
            <div className="small muted">{pending.length + reviews.length} items</div>
            {pending.map((a) => (
              <ApprovalCard key={a.id} ap={a} compact />
            ))}
            {reviews.map((i) => (
              <div key={i.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <Pill tone="ok" className="sm">
                  Review
                </Pill>
                <div className="mt-sm">
                  <a href={`#/task/${i.id}?do=review`} style={{ color: 'inherit' }}>
                    <b>{i.title}</b>
                  </a>{' '}
                  submitted by {firstName(s, i.ownerId)}
                </div>
              </div>
            ))}
            {pending.length + reviews.length === 0 && <Empty>All clear. 🌿</Empty>}
          </div>
        </div>
      )}

      {cell && (
        <Modal title={userById(s, cell.p).name} sub={cell.list ? 'Open work' : `Week of ${fmtShort(ws + cell.w * 7 * DAY)}`} onClose={() => setCell(null)} wide>
          {live
            .filter((i) => i.ownerId === cell.p)
            .filter((i) => cell.list || (i.currentDeadline >= ws + cell.w * 7 * DAY && i.currentDeadline < ws + (cell.w + 1) * 7 * DAY) || (cell.w === 0 && i.currentDeadline < ws))
            .sort((a, b) => a.currentDeadline - b.currentDeadline)
            .map((i) => (
              <div key={i.id} className="list-row" style={{ cursor: masked(i) ? 'default' : 'pointer' }} onClick={() => !masked(i) && go(`/task/${i.id}`)}>
                <span className="grow">{masked(i) ? 'Private task' : i.title}</span>
                <span className="tiny muted">{i.estHours}h · {fmtShort(i.currentDeadline)}</span>
                <StatusPill item={i} sm />
              </div>
            ))}
        </Modal>
      )}
      {creating && <TaskForm onClose={() => setCreating(false)} />}
    </div>
  );
}
