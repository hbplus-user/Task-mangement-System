import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Seg, Pill, go, UserSelect, Accent } from '../components/ui.jsx';
import { flagsOf, effectiveDeadline, isManager, teamScope, firstName, canSeeFull } from '../engine/core.js';
import { now, DAY, atTime, startOfWeek, endOfMonth, endOfQuarter, dueLabel, fmtShort } from '../lib/time.js';

function windowEnd(win, t) {
  if (win === 'day') return atTime(t, '23:59');
  if (win === 'week') return startOfWeek(t) + 7 * DAY - 1;
  if (win === 'month') return endOfMonth(t);
  return endOfQuarter(t);
}
const WIN_LABEL = { day: 'today', week: 'this week', month: 'this month', quarter: 'this quarter' };

export default function MatrixView({ embedded = false }) {
  const { s, me, commit } = useStore();
  const [win, setWin] = useState('week');
  const [person, setPerson] = useState(me);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const t = now();
  const end = windowEnd(win, t);
  const own = person === me;
  const scope = teamScope(s, me);
  const delegate = isManager(s, person);
  const overrides = (own && s.matrixOverrides[me]) || {};

  const items = s.items.filter(
    (i) => (i.ownerId === person || i.assigneeId === person) && ['awaiting', 'open', 'in_progress', 'blocked'].includes(i.status) && (i.type === 'task' || i.type === 'subtask')
  );
  const quadOf = (i) => {
    if (overrides[i.id]) return overrides[i.id];
    const d = effectiveDeadline(s, i);
    const urgent = d != null && d <= end;
    const important = i.impact >= 3;
    return urgent && important ? 'q1' : !urgent && important ? 'q2' : urgent ? 'q3' : 'q4';
  };
  const Q = [
    ['q1', 'Do now'],
    ['q2', 'Schedule'],
    ['q3', delegate ? 'Delegate' : 'Quick wins'],
    ['q4', 'Later'],
  ];
  const drop = (q) => {
    setOver(null);
    if (!own || !drag) return;
    commit((st) => {
      st.matrixOverrides[me] = { ...(st.matrixOverrides[me] || {}), [drag]: q };
    });
    setDrag(null);
  };

  const Card = ({ i, q }) => {
    const f = flagsOf(s, i);
    const hidden = !canSeeFull(s, me, i);
    return (
      <div className="mcard" draggable={own} onDragStart={() => setDrag(i.id)} onClick={() => !hidden && go(`/task/${i.id}`)}>
        <div className="t">
          {hidden ? 'Private task' : i.title} {overrides[i.id] && <span title="Moved by you (your view only)">✋</span>}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {f.overdue ? (
            <Pill tone="overdue" className="sm">Overdue</Pill>
          ) : f.atRisk ? (
            <Pill tone="risk" className="sm">At-risk · {dueLabel(i.currentDeadline)}</Pill>
          ) : (
            <Pill className="sm" tone={q === 'q1' ? 'ok' : ''}>{i.currentDeadline - t > 7 * DAY ? fmtShort(i.currentDeadline) : dueLabel(i.currentDeadline)}</Pill>
          )}
          <Pill className="sm">Impact {i.impact}</Pill>
          {q === 'q3' && !delegate && i.size === 'S' && <Pill tone="primary" className="sm">⏱ Timebox 30 min</Pill>}
          {q === 'q3' && delegate && <Pill tone="primary" className="sm">Hand to someone?</Pill>}
          {i.assigneeId && <Pill tone="gold" className="sm">With {firstName(s, i.assigneeId)}</Pill>}
        </div>
      </div>
    );
  };

  return (
    <div>
      {embedded ? (
        <div className="row wrap" style={{ marginBottom: 14, gap: 10, justifyContent: 'space-between' }}>
          <div className="small muted" style={{ maxWidth: 760 }}>
            <b>{firstName(s, person)}</b> · Urgent = due {WIN_LABEL[win]} · Important = Impact 3 or 5 · {own ? 'drag to adjust your own view (it never changes the real Impact)' : 'view only'}
            {delegate ? ' · you have reports, so the third box is “Delegate”' : ''}
          </div>
          <div className="row wrap">
            {scope.length > 0 && (
              <UserSelect className="input sm" style={{ width: 'auto' }} value={person} onChange={(v) => setPerson(v || me)} include={[me, ...scope]} placeholder="Me" />
            )}
            <Seg sm options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Qtr']]} value={win} onChange={setWin} />
          </div>
        </div>
      ) : (
      <div className="page-head">
        <div>
          <div className="eyebrow">{firstName(s, person)} · pending tasks</div>
          <h1 className="page-title">
            <Accent text="Eisenhower *Matrix*" />
          </h1>
          <div className="page-sub" style={{ maxWidth: 820 }}>
            Urgent = due {WIN_LABEL[win]} · Important = Impact 3 or 5 · {own ? 'drag to adjust your own view (it never changes the real Impact)' : 'view only'}
            {delegate ? ' · you have reports, so the third box is “Delegate”' : ''}
          </div>
        </div>
        <div className="row wrap">
          {scope.length > 0 && (
            <UserSelect className="input sm" style={{ width: 'auto' }} value={person} onChange={(v) => setPerson(v || me)} include={[me, ...scope]} placeholder="Me" />
          )}
          <Seg options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', 'Quarter']]} value={win} onChange={setWin} />
        </div>
      </div>
      )}
      {own && Object.keys(overrides).length > 0 && (
        <button className="btn xs ghost" style={{ marginBottom: 10 }} onClick={() => commit((st) => { st.matrixOverrides[me] = {}; })}>
          Reset my drag overrides
        </button>
      )}
      <div className="matrix">
        <div />
        <div className="colh">Urgent</div>
        <div className="colh">Not urgent</div>
        {[['Important', ['q1', 'q2']], ['Less important', ['q3', 'q4']]].map(([label, qs]) => (
          <React.Fragment key={label}>
            <div className="rowh">{label}</div>
            {qs.map((q) => {
              const list = items.filter((i) => quadOf(i) === q).sort((a, b) => (a.currentDeadline || 0) - (b.currentDeadline || 0));
              return (
                <div
                  key={q}
                  className={`quad ${q} ${over === q ? 'drop' : ''}`}
                  onDragOver={(e) => {
                    if (!own) return;
                    e.preventDefault();
                    setOver(q);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={() => drop(q)}
                >
                  <h3>
                    {Q.find((x) => x[0] === q)[1]}
                    <span className="n">{list.length}</span>
                  </h3>
                  {list.map((i) => (
                    <Card key={i.id} i={i} q={q} />
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
