import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Pill, Seg, Icon, Avatar, downloadFile, toCSV, Empty } from '../components/ui.jsx';
import { ColumnChart, HBars } from '../components/charts.jsx';
import { teamScope, userById, isWorkItem, projectOf, verticalById, progressOf, firstName, isFA, nameOf, STATUS, children, canSeeFull } from '../engine/core.js';
import { winnersReport, tierOf } from '../engine/scoring.js';
import { sowStatus, sowRequired } from '../engine/sow.js';
import { now, DAY, HOUR, startOfWeek, startOfMonth, endOfMonth, addMonths, fmtShort, fmtDate, dateKey, monthName, startOfDay, parseKey } from '../lib/time.js';

const PRESETS = [
  ['30d', 'Last 30 days'],
  ['month', 'This month'],
  ['last', 'Last month'],
  ['90d', 'Last 90 days'],
  ['custom', 'Custom'],
];

export default function ReportsView() {
  const { s, me } = useStore();
  const t = now();
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState(dateKey(t - 30 * DAY));
  const [to, setTo] = useState(dateKey(t));
  const [vertical, setVertical] = useState('all');
  const [person, setPerson] = useState('all');
  const [rewardMonth, setRewardMonth] = useState(dateKey(startOfMonth(addMonths(startOfMonth(t), -1))));

  const range = useMemo(() => {
    if (preset === '30d') return [startOfDay(t - 30 * DAY), t];
    if (preset === '90d') return [startOfDay(t - 90 * DAY), t];
    if (preset === 'month') return [startOfMonth(t), t];
    if (preset === 'last') {
      const m = addMonths(startOfMonth(t), -1);
      return [startOfMonth(m), endOfMonth(m)];
    }
    return [parseKey(from), parseKey(to) + DAY - 1];
  }, [preset, from, to, t]);
  const [R0, R1] = range;

  let scope = isFA(s, me) ? s.users.map((u) => u.id) : [me, ...teamScope(s, me)];
  if (vertical !== 'all') scope = scope.filter((id) => userById(s, id).verticals.some((v) => v.vid === vertical));
  if (person !== 'all') scope = [person];

  const tasks = s.items.filter((i) => isWorkItem(i) && scope.includes(i.ownerId) && (vertical === 'all' || i.vertical === vertical));
  const closedIn = tasks.filter((i) => i.status === 'closed' && i.closedAt >= R0 && i.closedAt <= R1);
  const taskEv = s.scoreEvents.filter((e) => e.type === 'task' && scope.includes(e.userId) && e.ts >= R0 && e.ts <= R1 && !e.reversed);

  // Completion trend by week
  const weeks = [];
  for (let w = startOfWeek(R0); w <= R1; w += 7 * DAY) weeks.push(w);
  const trend = weeks.map((w) => ({ label: fmtShort(w), value: closedIn.filter((i) => i.closedAt >= w && i.closedAt < w + 7 * DAY).length, tip: `Week of ${fmtShort(w)}: ${closedIn.filter((i) => i.closedAt >= w && i.closedAt < w + 7 * DAY).length} closed` }));

  // Tasks by project
  const byProj = {};
  for (const i of tasks.filter((i) => (i.createdAt <= R1 && (i.closedAt || t) >= R0))) {
    const p = projectOf(s, i);
    const k = p ? p.title : 'No project';
    byProj[k] = (byProj[k] || 0) + 1;
  }
  const projBars = Object.entries(byProj).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  const projects = s.items.filter((i) => i.type === 'project' && (person === 'all' ? true : i.ownerId === person));

  // On-time by vertical & person
  const byVert = s.verticals
    .map((v) => {
      const ev = taskEv.filter((e) => s.items.find((i) => i.id === e.itemId)?.vertical === v.id);
      return { label: v.name, value: ev.length ? Math.round((ev.filter((e) => e.meta?.onTime).length / ev.length) * 100) : 0, n: ev.length };
    })
    .filter((x) => x.n > 0);
  const personRows = scope.map((id) => {
    const ev = taskEv.filter((e) => e.userId === id);
    const late = ev.filter((e) => !e.meta?.onTime).length;
    const avg = ev.length ? (ev.reduce((a, e) => a + (e.meta?.rating || 2), 0) / ev.length).toFixed(1) : '—';
    let req = 0, on = 0, lt = 0, miss = 0;
    const notTouched = [];
    for (let d = startOfDay(R0); d <= Math.min(R1, t); d += DAY) {
      const k = dateKey(d + 2 * HOUR);
      if (!sowRequired(s, id, k)) continue;
      const st = sowStatus(s, id, k);
      if (st === 'pending' || st === 'future') continue;
      req++;
      if (st === 'on_time') on++;
      else if (st === 'late') lt++;
      else if (st === 'missed') miss++;
    }
    const ext = s.approvals.filter((a) => a.type === 'extension' && a.requesterId === id && a.status === 'approved' && a.decidedAt >= R0 && a.decidedAt <= R1).length;
    const blocked = s.activity.filter((a) => a.action === 'Blocked' && a.ts >= R0 && a.ts <= R1 && s.items.find((i) => i.id === a.itemId)?.ownerId === id).length;
    const blocking = s.activity.filter((a) => a.action === 'Blocked' && a.ts >= R0 && a.ts <= R1 && a.to === `by ${nameOf(s, id)}`).length;
    return { id, closed: ev.length, onTime: ev.length ? Math.round(((ev.length - late) / ev.length) * 100) : null, late, avg, req, on, lt, miss, sow: req ? Math.round(((on + lt) / req) * 100) : null, ext, blocked, blocking };
  });
  const reasons = {};
  for (const d of s.sowDays.filter((d) => scope.includes(d.userId) && parseKey(d.date) >= R0 && parseKey(d.date) <= R1)) {
    for (const e of d.entries || []) if (e.outcome === 'not_touched' && e.reason) reasons[e.reason] = (reasons[e.reason] || 0) + 1;
  }
  const reasonBars = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

  const exportCSV = () => {
    const rows = [['ID', 'Title', 'Type', 'Vertical', 'Owner', 'Status', 'Size', 'Impact', 'Original deadline', 'Current deadline', 'Submitted', 'Closed', 'Rating', 'Extensions', 'Progress %']];
    for (const i of tasks.filter((i) => (i.currentDeadline >= R0 && i.currentDeadline <= R1) || (i.closedAt >= R0 && i.closedAt <= R1))) {
      const full = canSeeFull(s, me, i);
      rows.push([i.key, full ? i.title : 'Private task', i.type, verticalById(s, i.vertical)?.name, nameOf(s, i.ownerId), STATUS[i.status].label, i.size, i.impact, fmtDate(i.originalDeadline, true), fmtDate(i.currentDeadline, true), i.submittedAt ? fmtDate(i.submittedAt, true) : '', i.closedAt ? fmtDate(i.closedAt, true) : '', i.rating || '', i.extensionsCount || 0, progressOf(s, i)]);
    }
    rows.push([]);
    rows.push(['Person', 'Closed', 'On-time %', 'Avg rating', 'SOW required', 'SOW on time', 'SOW late', 'SOW missed', 'SOW compliance %', 'Extensions', 'Times blocked', 'Times blocking others']);
    for (const r of personRows) rows.push([nameOf(s, r.id), r.closed, r.onTime ?? '', r.avg, r.req, r.on, r.lt, r.miss, r.sow ?? '', r.ext, r.blocked, r.blocking]);
    downloadFile(`hbplus-report-${dateKey(R0)}-to-${dateKey(R1)}.csv`, toCSV(rows));
  };

  const showRewards = isFA(s, me);
  const win = showRewards ? winnersReport(s, parseKey(rewardMonth)) : null;
  const months = Array.from({ length: 12 }, (_, i) => dateKey(startOfMonth(addMonths(startOfMonth(t), -i))));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {fmtDate(R0, true)} – {fmtDate(R1, true)} · {scope.length} people
          </div>
          <h1 className="page-title">Reports</h1>
        </div>
        <div className="row wrap no-print">
          <button className="btn" onClick={exportCSV}>
            <Icon name="download" size={16} /> CSV
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Icon name="download" size={16} /> PDF
          </button>
        </div>
      </div>
      <div className="row wrap no-print" style={{ marginBottom: 20 }}>
        <Seg sm options={PRESETS} value={preset} onChange={setPreset} />
        {preset === 'custom' && (
          <>
            <input type="date" className="input sm" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="input sm" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <select className="input sm" style={{ width: 'auto' }} value={vertical} onChange={(e) => setVertical(e.target.value)}>
          <option value="all">All verticals</option>
          {s.verticals.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <select className="input sm" style={{ width: 'auto' }} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">Everyone in scope</option>
          {(isFA(s, me) ? s.users.map((u) => u.id) : [me, ...teamScope(s, me)]).map((id) => (
            <option key={id} value={id}>
              {nameOf(s, id)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <Stat l="Tasks closed" v={closedIn.length} />
        <Stat l="On-time" v={taskEv.length ? `${Math.round((taskEv.filter((e) => e.meta?.onTime).length / taskEv.length) * 100)}%` : '—'} />
        <Stat l="SOW compliance" v={(() => { const r = personRows.reduce((a, x) => a + x.req, 0); const ok = personRows.reduce((a, x) => a + x.on + x.lt, 0); return r ? `${Math.round((ok / r) * 100)}%` : '—'; })()} />
        <Stat l="Extensions approved" v={personRows.reduce((a, x) => a + x.ext, 0)} />
      </div>

      <div className="grid g2">
        <div className="card">
          <h2 className="card-title">Completion trend</h2>
          <div className="tiny muted">Tasks closed per week</div>
          {trend.length ? <ColumnChart data={trend} height={210} /> : <Empty>No data.</Empty>}
        </div>
        <div className="card">
          <h2 className="card-title">Tasks by project</h2>
          {projBars.length ? <HBars data={projBars} /> : <Empty>No tasks in range.</Empty>}
        </div>
        <div className="card">
          <h2 className="card-title">On-time % by vertical</h2>
          {byVert.length ? <HBars data={byVert.map((v) => ({ ...v, tip: `${v.label}: ${v.value}% on time (${v.n} tasks)` }))} max={100} unit="%" /> : <Empty>No closed tasks in range.</Empty>}
        </div>
        <div className="card">
          <h2 className="card-title">Not-touched reasons</h2>
          <div className="tiny muted">From daily SOWs</div>
          {reasonBars.length ? <HBars data={reasonBars} color="var(--accent)" /> : <Empty>No “not touched” entries.</Empty>}
        </div>
      </div>

      <div className="card mt">
        <h2 className="card-title">Project summary</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Project</th>
                <th>Owner</th>
                <th>Deadline</th>
                <th className="num">Tasks closed</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const kids = children(s, p.id).filter((k) => k.type !== 'cycle');
                return (
                  <tr key={p.id} className="click" onClick={() => (window.location.hash = `/task/${p.id}`)}>
                    <td>
                      <b>{p.title}</b> <span className="tiny muted">{p.key}</span>
                    </td>
                    <td>{firstName(s, p.ownerId)}</td>
                    <td className="small">{fmtDate(p.currentDeadline)}</td>
                    <td className="num">
                      {kids.filter((k) => k.status === 'closed').length}/{kids.filter((k) => k.status !== 'cancelled').length}
                    </td>
                    <td className="small">{progressOf(s, p)}%</td>
                    <td>
                      <Pill className="sm" tone={STATUS[p.status].tone}>
                        {STATUS[p.status].label}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card mt">
        <h2 className="card-title">People: on-time, SOW, extensions & blocks</h2>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Person</th>
                <th className="num">Closed</th>
                <th className="num">On-time</th>
                <th className="num">Avg ★</th>
                <th className="num">SOW</th>
                <th className="num">Late</th>
                <th className="num">Missed</th>
                <th className="num">Extensions</th>
                <th className="num">Blocked</th>
                <th className="num">Blocking others</th>
              </tr>
            </thead>
            <tbody>
              {personRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="person">
                      <Avatar id={r.id} size="sm" /> {nameOf(s, r.id)}
                    </span>
                  </td>
                  <td className="num">{r.closed}</td>
                  <td className="num">{r.onTime == null ? '—' : `${r.onTime}%`}</td>
                  <td className="num">{r.avg}</td>
                  <td className="num">{r.sow == null ? '—' : `${r.sow}%`}</td>
                  <td className="num">{r.lt}</td>
                  <td className="num" style={{ color: r.miss ? 'var(--overdue)' : '' }}>
                    {r.miss}
                  </td>
                  <td className="num">{r.ext}</td>
                  <td className="num">{r.blocked}</td>
                  <td className="num">{r.blocking}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showRewards && win && (
        <div className="card mt">
          <div className="row wrap">
            <h2 className="card-title spacer">Rewards & winners</h2>
            <select className="input sm no-print" style={{ width: 'auto' }} value={rewardMonth} onChange={(e) => setRewardMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(parseKey(m), true)} {m.slice(0, 4)}
                </option>
              ))}
            </select>
          </div>
          <div className="small muted" style={{ marginBottom: 12 }}>
            Founders are scored but not eligible. Ties: on-time %, then Impact-5 tasks closed on time, then SOW streak. Periods follow the financial year (Apr–Mar). {s.policyVersions.length >= 0 && 'Vouchers are issued by HR/Finance within 7 days.'}
          </div>
          <div className="grid g3">
            <div>
              <div className="card-label">Monthly · {monthName(parseKey(rewardMonth), true)}</div>
              <div className="small">
                <b>₹1,000 Amazon voucher:</b> {win.monthWinner ? nameOf(s, win.monthWinner.id) : '—'} {win.monthWinner && `(${win.monthWinner.score})`}
              </div>
              <div className="small mt-sm">
                <b>Shout-out (top 5):</b>
              </div>
              {win.monthTop5.map((r, i) => (
                <div key={r.id} className="small">
                  {i + 1}. {nameOf(s, r.id)} — {tierOf(s, r.score).name}
                </div>
              ))}
            </div>
            <div>
              <div className="card-label">Quarterly · {win.quarter.label}</div>
              <div className="small">
                <b>Half-day off:</b> {win.quarterWinner ? `${nameOf(s, win.quarterWinner.id)} (${win.quarterWinner.score})` : '—'}
              </div>
              <div className="small mt-sm">
                <b>₹3,000 voucher (Platinum in 2+ months):</b> {win.quarterPlatinum2.length ? win.quarterPlatinum2.map((x) => nameOf(s, x.id)).join(', ') : 'No one yet'}
              </div>
            </div>
            <div>
              <div className="card-label">Annual · {win.year.label}</div>
              <div className="small">
                <b>₹8,000 + HOP session (4+ Platinum months):</b> {win.yearPlatinum4.length ? win.yearPlatinum4.map((x) => nameOf(s, x.id)).join(', ') : 'No one yet'}
              </div>
              <div className="small mt-sm">
                <b>Town Hall recognition (most Platinum months):</b> {win.yearMostPlatinum ? `${nameOf(s, win.yearMostPlatinum[0])} (${win.yearMostPlatinum[1]})` : '—'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Stat = ({ l, v }) => (
  <div className="card stat">
    <div className="card-label">{l}</div>
    <div className="num">{v}</div>
  </div>
);
