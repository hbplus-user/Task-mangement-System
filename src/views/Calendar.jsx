import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Seg, Icon, go, StatusPill, Person, Empty } from '../components/ui.jsx';
import { healthTone, teamScope, canSeeFull, isHoliday, firstName, isFA, isManager } from '../engine/core.js';
import { offDayOf } from '../engine/sow.js';
import { now, DAY, startOfWeek, startOfDay, addDays, addMonths, dateKey, monthName, fmtLongDay, fmtTime, startOfMonth, yearOf, monthIndex, dayOfMonth } from '../lib/time.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function CalendarView() {
  const { s, me } = useStore();
  const [mode, setMode] = useState('month');
  const [anchor, setAnchor] = useState(now());
  const [scope, setScope] = useState('mine');
  const team = teamScope(s, me);
  const people = scope === 'mine' ? [me] : [me, ...team];
  const items = s.items.filter((i) => (people.includes(i.ownerId) || (scope === 'mine' && i.assigneeId === me)) && i.currentDeadline && i.type !== 'stream' && !['cancelled', 'skipped'].includes(i.status));
  const toneOf = (i) => (i.status === 'closed' ? 'done' : healthTone(s, i));

  const eventsOn = (dayTs) => {
    const k = dateKey(dayTs);
    const res = [];
    for (const i of items) {
      if (dateKey(i.currentDeadline) === k) res.push({ i, ghost: false });
      else if (i.originalDeadline && i.originalDeadline !== i.currentDeadline && dateKey(i.originalDeadline) === k) res.push({ i, ghost: true });
    }
    return res.sort((a, b) => a.ghost - b.ghost);
  };
  const Ev = ({ i, ghost }) => {
    const full = canSeeFull(s, me, i);
    return (
      <div className={`ev ${ghost ? 'ghost' : toneOf(i)}`} title={`${full ? i.title : 'Private task'}${ghost ? ' (original deadline)' : ''} · ${firstName(s, i.ownerId)}`} onClick={() => full && go(`/task/${i.id}`)}>
        {ghost ? 'orig: ' : ''}
        {scope === 'team' ? `${firstName(s, i.ownerId)}: ` : ''}
        {full ? i.title : 'Private task'}
      </div>
    );
  };

  const shift = (n) => setAnchor(mode === 'month' ? addMonths(startOfMonth(anchor), n) : addDays(anchor, n * (mode === 'week' ? 7 : 1)));
  const title = mode === 'month' ? `${monthName(anchor, true)} ${yearOf(anchor)}` : mode === 'week' ? `Week of ${fmtLongDay(startOfWeek(anchor))}` : fmtLongDay(anchor);

  let body;
  if (mode === 'day') {
    const ev = eventsOn(anchor);
    const off = offDayOf(s, me, dateKey(anchor));
    body = (
      <div className="card">
        {isHoliday(s, dateKey(anchor)) && <div className="hint-box info">Company holiday: {isHoliday(s, dateKey(anchor)).name}</div>}
        {off && <div className="hint-box info">You're off: {off.code}</div>}
        {ev.length === 0 && <Empty>Nothing due this day.</Empty>}
        {ev.map(({ i, ghost }) => (
          <div key={i.id + ghost} className="list-row" style={{ opacity: ghost ? 0.55 : 1, cursor: 'pointer' }} onClick={() => go(`/task/${i.id}`)}>
            <span className="muted small" style={{ width: 70 }}>
              {fmtTime(ghost ? i.originalDeadline : i.currentDeadline)}
            </span>
            <span className="grow">
              {canSeeFull(s, me, i) ? i.title : 'Private task'}
              {ghost && <span className="tiny muted"> · original deadline (moved)</span>}
            </span>
            <Person id={i.ownerId} />
            <StatusPill item={i} sm />
          </div>
        ))}
      </div>
    );
  } else {
    const start = mode === 'month' ? startOfWeek(startOfMonth(anchor)) : startOfWeek(anchor);
    const days = mode === 'month' ? 42 : 7;
    const m = monthIndex(anchor);
    body = (
      <div className="cal">
        {DOW.map((d) => (
          <div key={d} className="dh">
            {d}
          </div>
        ))}
        {Array.from({ length: days }, (_, n) => {
          const d = addDays(start, n);
          const k = dateKey(d);
          const ev = eventsOn(d);
          const hol = isHoliday(s, k);
          return (
            <div key={k} className={`cell ${monthIndex(d) !== m && mode === 'month' ? 'other' : ''} ${k === dateKey(now()) ? 'today' : ''} ${hol ? 'hol' : ''}`} style={mode === 'week' ? { minHeight: 300 } : {}}>
              <div className="row" style={{ gap: 4 }}>
                <span className="dn" onClick={() => { setAnchor(d); setMode('day'); }} style={{ cursor: 'pointer' }}>
                  {dayOfMonth(d)}
                </span>
                {hol && <span className="tiny muted ellipsis">{hol.name}</span>}
              </div>
              {ev.slice(0, mode === 'month' ? 4 : 20).map(({ i, ghost }) => (
                <Ev key={i.id + ghost} i={i} ghost={ghost} />
              ))}
              {mode === 'month' && ev.length > 4 && (
                <div className="tiny muted" style={{ cursor: 'pointer' }} onClick={() => { setAnchor(d); setMode('day'); }}>
                  +{ev.length - 4} more
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Tasks on their current deadline · original shown faintly</div>
          <h1 className="page-title">Calendar</h1>
        </div>
        <div className="row wrap">
          {team.length > 0 && <Seg sm options={[['mine', 'Mine'], ['team', 'My team']]} value={scope} onChange={setScope} />}
          <Seg options={[['month', 'Month'], ['week', 'Week'], ['day', 'Day']]} value={mode} onChange={setMode} />
        </div>
      </div>
      <div className="row" style={{ marginBottom: 14 }}>
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous">
          <Icon name="back" size={18} />
        </button>
        <button className="btn sm" onClick={() => setAnchor(now())}>
          Today
        </button>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next">
          <Icon name="next" size={18} />
        </button>
        <h3 className="serif" style={{ fontSize: 24, marginLeft: 8 }}>
          {title}
        </h3>
        <span className="spacer" />
        <span className="row wrap tiny muted hide-m">
          <span className="ev ok" style={{ display: 'inline-block' }}>On track</span>
          <span className="ev risk" style={{ display: 'inline-block' }}>At-risk</span>
          <span className="ev overdue" style={{ display: 'inline-block' }}>Overdue</span>
          <span className="ev review" style={{ display: 'inline-block' }}>In review</span>
          <span className="ev blocked" style={{ display: 'inline-block' }}>Blocked</span>
          <span className="ev done" style={{ display: 'inline-block' }}>Closed</span>
        </span>
      </div>
      {body}
    </div>
  );
}
