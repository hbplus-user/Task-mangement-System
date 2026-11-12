import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Pill, Modal, Field, Empty, Accent } from '../components/ui.jsx';
import { ColumnChart } from '../components/charts.jsx';
import { deliveryScore, tierOf, moodOf, badgesOf, ALL_BADGES, monthEvents, EVENT_LABEL, eventTitle } from '../engine/scoring.js';
import { P } from '../engine/policy.js';
import { uid } from '../engine/core.js';
import { now, startOfMonth, addMonths, monthName, fmtDate, dateKey } from '../lib/time.js';

export default function ScoreView() {
  const { s, me, commit, toast } = useStore();
  const [month, setMonth] = useState(0);
  const [appeal, setAppeal] = useState(null);
  const [reason, setReason] = useState('');
  const m = addMonths(startOfMonth(now()), -month);
  const ds = deliveryScore(s, me, m);
  const tier = tierOf(s, ds.score);
  const mood = moodOf(ds.score);
  const history = Array.from({ length: 6 }, (_, i) => {
    const mm = addMonths(startOfMonth(now()), -(5 - i));
    const d = deliveryScore(s, me, mm);
    return { label: monthName(mm), value: Math.max(0, d.score ?? 0), tip: `${monthName(mm, true)}: ${d.score ?? '—'} (${tierOf(s, d.score).name})` };
  });
  const events = monthEvents(s, me, m);
  const mine = badgesOf(s, me).map((b) => b.name);
  const send = () => {
    if (!reason.trim()) return toast('Add a reason.', 'error');
    commit((st) => {
      st.appeals.push({ id: uid('ap'), scoreEventId: appeal.id, userId: me, reason, month: dateKey(startOfMonth(now())), status: 'open', ts: now() });
    });
    toast('Appeal raised for the monthly review window.');
    setAppeal(null);
    setReason('');
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Only you, your managers and founders see this</div>
          <h1 className="page-title">
            <Accent text="My *score* & badges" />
          </h1>
        </div>
        <select className="input sm" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(+e.target.value)}>
          {Array.from({ length: 6 }, (_, i) => (
            <option key={i} value={i}>
              {monthName(addMonths(startOfMonth(now()), -i), true)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid g3" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="card-label">Delivery score · {monthName(m)}</div>
          <div className="num">
            {ds.score ?? '—'} <span style={{ fontSize: 28 }}>{mood.icon}</span>
          </div>
          <div className="sub">
            {ds.earned} earned ÷ {ds.available} available × 100 · {mood.label}
          </div>
        </div>
        <div className="card stat">
          <div className="card-label">Tier</div>
          <div className="num" style={{ fontSize: 32 }}>
            {tier.emoji} {tier.name}
          </div>
          <div className="sub">
            Platinum ≥{P(s, 'tierPlatinum')} · Gold {P(s, 'tierGold')}+ · Silver {P(s, 'tierSilver')}+ · Bronze {P(s, 'tierBronze')}+
          </div>
        </div>
        <div className="card">
          <div className="card-label">Last 6 months</div>
          <ColumnChart data={history} height={130} color="var(--gold)" />
        </div>
      </div>
      {tier.key === 'support' && <div className="hint-box info" style={{ marginBottom: 20 }}>This month needs some support. Your manager will set up a friendly 1:1 — it's never shared publicly.</div>}
      <div className="split">
        <div className="card">
          <h2 className="card-title">Score events</h2>
          {events.length === 0 && <Empty>No points yet this month.</Empty>}
          {events.map((e) => {
            const ap = s.appeals.find((a) => a.scoreEventId === e.id);
            return (
              <div key={e.id} className="list-row small">
                <span className="muted nowrap" style={{ width: 90 }}>
                  {fmtDate(e.ts)}
                </span>
                <span className="grow">
                  <Pill className="sm">{e.code}</Pill> <b>{EVENT_LABEL[e.type]}</b> · {e.itemId ? <a href={`#/task/${e.itemId}`}>{eventTitle(s, e)}</a> : null}
                  <div className="tiny muted">
                    {e.note} · policy {e.policyVersion}
                    {e.trial ? ' · trial' : ''}
                  </div>
                </span>
                <b style={{ color: e.points >= 0 ? 'var(--ok)' : 'var(--overdue)' }}>
                  {e.points > 0 ? '+' : ''}
                  {e.points}
                </b>
                {!ap && (e.points < 0 || e.type === 'task') && (
                  <button className="btn xs ghost" onClick={() => setAppeal(e)}>
                    Appeal
                  </button>
                )}
                {ap && <Pill className="sm">Appeal {ap.status}</Pill>}
              </div>
            );
          })}
        </div>
        <div className="card">
          <h2 className="card-title">Badges (lifetime)</h2>
          {ALL_BADGES.map(([name, how]) => (
            <div key={name} className="list-row" style={{ opacity: mine.includes(name) ? 1 : 0.45 }}>
              <span style={{ fontSize: 22 }}>{mine.includes(name) ? '🏅' : '○'}</span>
              <span className="grow">
                <b>{name}</b>
                <div className="tiny muted">{how}</div>
              </span>
              {mine.includes(name) && <Pill tone="gold" className="sm">Earned</Pill>}
            </div>
          ))}
        </div>
      </div>
      {appeal && (
        <Modal title="Raise an appeal" sub={`${appeal.code} · ${appeal.note}`} onClose={() => setAppeal(null)} footer={<button className="btn primary" onClick={send}>Send appeal</button>}>
          <Field label="What should be reconsidered, and why?">
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  );
}
