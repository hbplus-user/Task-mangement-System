import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Choice, Pill, StatusPill, Empty, go, Accent } from '../components/ui.jsx';
import { submitSetupList } from '../engine/actions.js';
import { P } from '../engine/policy.js';
import { userById, verticalById, firstName, mainManager } from '../engine/core.js';
import { now, atTime, addDays, toInputDate, fmtDate } from '../lib/time.js';

const blank = (vid) => ({ title: '', vertical: vid, size: 'M', impact: 3, impactReason: '', date: toInputDate(addDays(now(), 3)), stage: 0 });

export default function SetupView() {
  const { s, me, commit, toast } = useStore();
  const user = userById(s, me);
  const main = user.verticals.find((v) => v.main)?.vid || user.verticals[0]?.vid;
  const [rows, setRows] = useState([blank(main), blank(main), blank(main)]);
  const set = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const mine = s.items.filter((i) => i.setupBatch && i.ownerId === me).sort((a, b) => b.createdAt - a.createdAt);
  const open = P(s, 'setupSprintOpen');

  const submit = () => {
    const r = commit((st) =>
      submitSetupList(
        st,
        me,
        rows.map((x) => ({ ...x, deadline: x.date ? atTime(x.date, P(st, 'defaultDeadlineTime')) : null }))
      )
    );
    if (!r.error) {
      toast(`${r.count} task${r.count > 1 ? 's' : ''} sent to ${firstName(s, mainManager(s, me))} for approval.`);
      setRows([blank(main)]);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Pilot setup · about 1 hour</div>
          <h1 className="page-title">
            <Accent text="Setup *sprint*" />
          </h1>
          <div className="page-sub" style={{ maxWidth: 760 }}>
            Add every task you're working on right now. {firstName(s, mainManager(s, me))} approves the list, then the tasks land on your board. Nothing is imported from the old Slack canvases.
          </div>
        </div>
      </div>
      {!open && <div className="hint-box info" style={{ marginBottom: 16 }}>The setup sprint isn't open right now (Admin → Policy & Scoring → “Setup sprint open”). You can still send a list.</div>}

      <div className="card" style={{ padding: '10px 16px' }}>
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                <th>Task</th>
                <th>Vertical</th>
                <th>Size</th>
                <th>Impact</th>
                <th>Why this impact?</th>
                <th>Deadline</th>
                <th>Already done</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ minWidth: 200 }}>
                    <input className="input sm" placeholder="What are you working on?" value={r.title} onChange={(e) => set(i, 'title', e.target.value)} />
                  </td>
                  <td>
                    <select className="input sm" value={r.vertical} onChange={(e) => set(i, 'vertical', e.target.value)}>
                      {user.verticals.map((v) => (
                        <option key={v.vid} value={v.vid}>
                          {verticalById(s, v.vid)?.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Choice options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} value={r.size} onChange={(v) => set(i, 'size', v)} />
                  </td>
                  <td>
                    <Choice options={[[1, '1'], [3, '3'], [5, '5']]} value={r.impact} onChange={(v) => set(i, 'impact', v)} />
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <input className="input sm" placeholder="One line" value={r.impactReason} onChange={(e) => set(i, 'impactReason', e.target.value)} />
                  </td>
                  <td>
                    <input className="input sm" type="date" value={r.date} onChange={(e) => set(i, 'date', e.target.value)} />
                  </td>
                  <td>
                    <select className="input sm" value={r.stage} onChange={(e) => set(i, 'stage', +e.target.value)}>
                      <option value={0}>Not started</option>
                      <option value={25}>Started</option>
                      <option value={50}>Halfway</option>
                      <option value={75}>Almost done</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn xs ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove row">
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ padding: '12px 0 6px' }}>
          <button className="btn sm" onClick={() => setRows([...rows, blank(main)])}>
            + Another task
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={submit}>
            Send for approval
          </button>
        </div>
      </div>

      <div className="card mt">
        <h2 className="card-title">What you've sent</h2>
        {mine.length === 0 && <Empty>Nothing yet.</Empty>}
        {mine.map((i) => (
          <a key={i.id} className="list-row" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>
            <span className="tiny muted" style={{ width: 70 }}>
              {i.key}
            </span>
            <span className="grow">{i.title}</span>
            <span className="tiny muted">due {fmtDate(i.currentDeadline)}</span>
            <Pill className="sm">
              {i.size} · {i.impact}
            </Pill>
            {i.status === 'pending_approval' ? <Pill tone="gold" className="sm">Waiting for approval</Pill> : <StatusPill item={i} sm />}
          </a>
        ))}
      </div>
    </div>
  );
}
