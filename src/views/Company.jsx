import React from 'react';
import { useStore } from '../store.jsx';
import { Pill, Person, go, TierPill, Avatar, Empty } from '../components/ui.jsx';
import { LineChart } from '../components/charts.jsx';
import { activeUsers, flagsOf, isWorkItem, canSeeFull, children, firstName, userById } from '../engine/core.js';
import { cycleAchievement } from '../engine/actions.js';
import { leaderboard, tierOf } from '../engine/scoring.js';
import { sowCompliance } from '../engine/sow.js';
import { onTimePct } from './Team.jsx';
import { now, DAY, startOfWeek, fmtShort, dueLabel } from '../lib/time.js';

export default function CompanyView() {
  const { s, me } = useStore();
  const t = now();
  const live = s.items.filter((i) => isWorkItem(i) && ['awaiting', 'open', 'in_progress', 'blocked', 'in_review'].includes(i.status));
  const peopleIn = (vid) => activeUsers(s).filter((u) => u.verticals.some((v) => v.vid === vid)).map((u) => u.id);

  const delayed = live
    .filter((i) => (i.size === 'L' || i.impact === 5) && (flagsOf(s, i).overdue || (i.originalDeadline && i.currentDeadline > i.originalDeadline)))
    .sort((a, b) => a.currentDeadline - b.currentDeadline);
  const blockers = {};
  for (const i of live.filter((i) => i.status === 'blocked')) blockers[i.blockedBy] = (blockers[i.blockedBy] || 0) + 1;
  const overdueBy = {};
  for (const i of live.filter((i) => flagsOf(s, i).overdue)) overdueBy[i.ownerId] = (overdueBy[i.ownerId] || 0) + 1;
  const bottlenecks = [
    ...Object.entries(blockers).map(([id, n]) => ({ id, text: `blocking ${n} task${n > 1 ? 's' : ''}`, n: n * 2 })),
    ...Object.entries(overdueBy).map(([id, n]) => ({ id, text: `${n} overdue`, n })),
  ]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5);
  const top5 = leaderboard(s, t).slice(0, 5);
  const all = activeUsers(s).map((u) => u.id);
  const trend = Array.from({ length: 8 }, (_, n) => {
    const ws = startOfWeek(t) - (7 - n) * 7 * DAY;
    return { label: fmtShort(ws), value: sowCompliance(s, all, ws, ws + 6 * DAY) };
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">All verticals · this month</div>
          <h1 className="page-title">Company</h1>
        </div>
      </div>
      <div className="grid g3" style={{ marginBottom: 24 }}>
        {s.verticals.map((v) => {
          const ppl = peopleIn(v.id);
          const items = live.filter((i) => i.vertical === v.id);
          const ot = onTimePct(s, ppl, t);
          const sow = sowCompliance(s, ppl, t - 30 * DAY, t);
          const streams = s.items.filter((i) => i.type === 'stream' && i.vertical === v.id);
          return (
            <div key={v.id} className="card">
              <div className="row">
                <h3 className="serif spacer" style={{ fontSize: 24 }}>
                  {v.name}
                </h3>
                <span className="tiny muted">{ppl.length} people</span>
              </div>
              <div className="grid g2 mt-sm" style={{ gap: 10 }}>
                <Kpi l="On-time" v={ot == null ? '—' : `${ot}%`} />
                <Kpi l="SOW compliance" v={sow == null ? '—' : `${sow}%`} />
                <Kpi l="Overdue" v={items.filter((i) => flagsOf(s, i).overdue).length} tone="var(--overdue)" />
                <Kpi l="At-risk" v={items.filter((i) => flagsOf(s, i).atRisk).length} tone="var(--risk-ink)" />
              </div>
              {streams.map((st) => {
                const cyc = children(s, st.id).filter((c) => c.type === 'cycle').sort((a, b) => b.cycleStart - a.cycleStart)[0];
                const ach = cyc ? Math.round(cycleAchievement(s, cyc) * 100) : 0;
                return (
                  <a key={st.id} href={`#/task/${st.id}`} className="row small mt-sm" style={{ color: 'inherit' }}>
                    <span className="spacer">Stream: {st.title}</span>
                    <Pill tone={ach >= 70 ? 'ok' : 'risk'} className="sm">
                      KPI {ach}%
                    </Pill>
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="grid g2">
        <div className="card">
          <h2 className="card-title">Delayed L / Impact-5 tasks</h2>
          {delayed.length === 0 && <Empty>No big tasks delayed. 🌿</Empty>}
          {delayed.map((i) => (
            <div key={i.id} className="list-row" style={{ cursor: 'pointer' }} onClick={() => canSeeFull(s, me, i) && go(`/task/${i.id}`)}>
              <span className="grow ellipsis">{canSeeFull(s, me, i) ? i.title : 'Private task'}</span>
              <Person id={i.ownerId} />
              <Pill tone={flagsOf(s, i).overdue ? 'overdue' : 'gold'} className="sm">
                {flagsOf(s, i).overdue ? dueLabel(i.currentDeadline) : 'Extended'}
              </Pill>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="card-title">Top bottlenecks</h2>
          {bottlenecks.length === 0 && <Empty>No bottlenecks right now.</Empty>}
          {bottlenecks.map((b, i) => (
            <div key={i} className="list-row">
              <Person id={b.id} size="" />
              <span className="grow muted">{b.text}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="card-title">Top 5 this month</h2>
          {top5.map((r, i) => (
            <div key={r.id} className="list-row">
              <b style={{ width: 20 }}>{i + 1}</b>
              <Avatar id={r.id} />
              <span className="grow">{userById(s, r.id).name}</span>
              <Pill tone={tierOf(s, r.score).key === 'platinum' ? 'platinum' : 'gold'} className="sm">
                {tierOf(s, r.score).name}
              </Pill>
            </div>
          ))}
          <div className="tiny faint mt-sm">The board shows name + tier only.</div>
        </div>
        <div className="card">
          <h2 className="card-title">SOW compliance · 8 weeks</h2>
          <LineChart data={trend} height={190} unit="%" max={100} target={95} targetLabel="Goal 95%" />
        </div>
      </div>
    </div>
  );
}

const Kpi = ({ l, v, tone }) => (
  <div>
    <div className="tiny muted">{l}</div>
    <div style={{ fontSize: 24, fontWeight: 600, color: tone }}>{v}</div>
  </div>
);
