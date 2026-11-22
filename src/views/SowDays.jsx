import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Pill, Empty, StatusPill, Accent, go, Modal, Field, Choice } from '../components/ui.jsx';
import { createItem } from '../engine/actions.js';
import { itemById, firstName, isWorkItem, isHoliday } from '../engine/core.js';
import { todaysTop3, sowDayOf, sowDay, sowRequired, sowStatus, openSowDays, myOpenWork, offDayOf, nextWorkingKey, SOW_LABEL } from '../engine/sow.js';
import { now, atTime, dateKey, parseKey, addKey, isWorkingDay, startOfWeek, fmtLongDay, fmtDate, fmtDT, dueLabel } from '../lib/time.js';
import { EodFlow, OffDialog } from './Sow.jsx';

const STATUS_TONE = { on_time: 'ok', late: 'risk', missed: 'overdue', pending: 'gold', off: '', holiday: '', sunday: '', future: '' };
const OUTCOME = { done: ['✓ Done', 'ok'], progress: ['Progress', 'review'], not_touched: ['Not touched', 'risk'] };
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FINISHED = ['closed', 'in_review', 'cancelled', 'skipped'];

const prevWorkingKey = (s, k) => {
  let p = addKey(k, -1);
  for (let n = 0; n < 10 && (!isWorkingDay(p) || isHoliday(s, p)); n++) p = addKey(p, -1);
  return p;
};
// Tasks planned for, or due on, a day that still aren't finished.
export function unfinishedOn(s, me, k) {
  const plan = new Set(sowDayOf(s, me, k)?.top3 || []);
  return s.items.filter(
    (i) => (i.ownerId === me || i.assigneeId === me) && isWorkItem(i) && !FINISHED.includes(i.status) && (plan.has(i.id) || (i.currentDeadline && dateKey(i.currentDeadline) === k))
  );
}
// Add tasks to a day's plan (the day's list; the first 3 are its Top 3).
function addToPlan(st, me, k, ids) {
  const d = sowDay(st, me, k);
  for (const id of ids) if (!d.top3.includes(id)) d.top3.push(id);
  d.plannedAt = d.plannedAt || now();
}

// The SOW inside My Tasks: look back at any past day, fill one that's still open,
// and plan the Top 3 for today or any day ahead.
export default function SowDaysView() {
  const { s, me, commit, toast } = useStore();
  const today = dateKey(now());
  const [day, setDay] = useState(today);
  const [eod, setEod] = useState(null);
  const [off, setOff] = useState(false);
  const [planning, setPlanning] = useState(null); // ids being picked, or null
  const [creating, setCreating] = useState(false);

  const weekStart = dateKey(startOfWeek(parseKey(day)) + 2 * 3600 * 1000);
  const week = Array.from({ length: 7 }, (_, i) => addKey(weekStart, i));
  const isPast = day < today;
  const isFuture = day > today;
  const status = sowStatus(s, me, day);
  const rec = sowDayOf(s, me, day);
  const required = sowRequired(s, me, day);
  const openDays = openSowDays(s, me);
  const canFill = !rec?.submittedAt && (day === today ? required : openDays.includes(day));
  const offDay = offDayOf(s, me, day);
  const top = todaysTop3(s, me, day);
  const topItems = top.ids.map((id) => itemById(s, id)).filter(Boolean);
  const due = s.items.filter(
    (i) => (i.ownerId === me || i.assigneeId === me) && isWorkItem(i) && i.currentDeadline && dateKey(i.currentDeadline) === day && !['cancelled', 'skipped'].includes(i.status)
  );
  const pickable = myOpenWork(s, me).filter((i) => i.type !== 'cycle');
  // Not finished on this day → move to the next working day (or to today, for older days).
  const leftover = isFuture ? [] : unfinishedOn(s, me, day);
  const moveTo = day < today && isWorkingDay(today) ? today : nextWorkingKey(s, day);
  const targetPlan = sowDayOf(s, me, moveTo)?.top3 || [];
  const notMoved = leftover.filter((i) => !targetPlan.includes(i.id));
  const moveLabel = moveTo === addKey(today, 1) ? 'tomorrow' : moveTo === today ? 'today' : fmtDate(parseKey(moveTo));
  const move = (ids) => {
    commit((st) => addToPlan(st, me, moveTo, ids));
    toast(`${ids.length === 1 ? 'Task' : `${ids.length} tasks`} moved to ${moveLabel}'s SOW.`);
  };

  const savePlan = () => {
    commit((st) => {
      const d = sowDay(st, me, day);
      d.top3 = [...planning];
      d.plannedAt = now();
    });
    toast(`Plan saved for ${fmtDate(parseKey(day))}.`);
    setPlanning(null);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          <button className="btn sm" onClick={() => setDay(addKey(weekStart, -7))} title="Previous week">‹ Week</button>
          <button className="btn sm" onClick={() => setDay(addKey(day, -1))} title="Previous day">‹ Day</button>
          <input className="input sm" type="date" style={{ width: 170 }} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <button className="btn sm" onClick={() => setDay(addKey(day, 1))} title="Next day">Day ›</button>
          <button className="btn sm" onClick={() => setDay(addKey(weekStart, 7))} title="Next week">Week ›</button>
          {day !== today && (
            <button className="btn sm outline" onClick={() => setDay(today)}>Today</button>
          )}
        </div>
        <div className="sow-week">
          {week.map((k, i) => {
            const st = sowStatus(s, me, k);
            return (
              <button key={k} className={`sow-day ${k === day ? 'on' : ''} ${k === today ? 'today' : ''}`} onClick={() => setDay(k)}>
                <span className="tiny muted">{DOW[i]}</span>
                <b>{+k.slice(8)}</b>
                <span className={`sow-dot ${st}`} title={SOW_LABEL[st]} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="row wrap" style={{ marginBottom: 14, gap: 10 }}>
          <div className="spacer">
            <div className="eyebrow">{isPast ? 'Previous SOW' : isFuture ? 'Upcoming SOW' : "Today's SOW"}</div>
            <h2 className="card-title" style={{ margin: 0 }}>
              <Accent text={`*${fmtLongDay(parseKey(day))}*`} />
            </h2>
          </div>
          {!['sunday', 'future'].includes(status) && (
            <Pill tone={STATUS_TONE[status]}>{status === 'pending' ? (isPast ? 'Still open' : 'Not submitted yet') : SOW_LABEL[status]}</Pill>
          )}
          {rec?.submittedAt && <span className="small muted">Submitted {fmtDT(rec.submittedAt)}</span>}
          {canFill && (
            <button className="btn sm orange" onClick={() => setEod(day)}>
              {day === today ? 'Fill today’s SOW' : 'Fill this SOW'}
            </button>
          )}
          {!isPast && required && !rec?.submittedAt && (
            <button className="btn sm primary" onClick={() => setCreating(true)}>{top.planned ? "Edit SOW" : "+ Create SOW"}</button>
          )}
          {!isPast && !offDay && required && (
            <button className="btn sm" onClick={() => setOff(true)}>Mark this day off</button>
          )}
        </div>

        {status === 'sunday' && <Empty>Sunday — no SOW needed.</Empty>}
        {status === 'holiday' && <Empty>Company holiday — no SOW needed.</Empty>}
        {status === 'off' && <Empty>You were off ({offDay?.code}) — no SOW needed.</Empty>}
        {isPast && !rec?.submittedAt && !canFill && required && status !== 'off' && (
          <div className="hint-box warn" style={{ marginBottom: 12 }}>This SOW wasn’t submitted, and it can no longer be filled (only the last 7 days can).</div>
        )}

        {required && (
          <>
            {/* Submitted SOW: what was reported for each task */}
            {rec?.submittedAt && (
              <>
                <h3 className="small" style={{ margin: '4px 0 8px' }}>What was reported</h3>
                {(rec.entries || []).length === 0 ? (
                  <Empty>No task lines in this SOW.</Empty>
                ) : (
                  <div className="table-wrap">
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>Outcome</th>
                          <th>Note</th>
                          <th>Pick up</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rec.entries.map((e, n) => {
                          const i = itemById(s, e.itemId);
                          const [label, tone] = OUTCOME[e.outcome] || [e.outcome || '—', ''];
                          return (
                            <tr key={n} className={i ? 'click' : ''} onClick={() => i && go(`/task/${i.id}`)}>
                              <td>
                                {i ? i.title : 'Deleted task'}
                                {i && <div className="tiny muted">{i.key}</div>}
                              </td>
                              <td><Pill className="sm" tone={tone}>{label}</Pill></td>
                              <td className="small">
                                {e.reason && <b>{e.reason}. </b>}
                                {e.comment || (!e.reason && <span className="muted">—</span>)}
                              </td>
                              <td className="small">{e.pickupDate ? fmtDate(parseKey(e.pickupDate)) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Unfinished work → carry it to the next day */}
            {leftover.length > 0 && (
              <div className="card" style={{ padding: 14, margin: '14px 0', background: 'var(--surface-2, #faf5ee)' }}>
                <div className="row wrap" style={{ marginBottom: 8, gap: 8 }}>
                  <h3 className="small spacer" style={{ margin: 0 }}>
                    Not finished {day === today ? 'today' : 'this day'} · {leftover.length}
                  </h3>
                  {notMoved.length > 1 && (
                    <button className="btn xs primary" onClick={() => move(notMoved.map((i) => i.id))}>
                      Move all {notMoved.length} to {moveLabel}
                    </button>
                  )}
                </div>
                {leftover.map((i) => {
                  const moved = targetPlan.includes(i.id);
                  return (
                    <div key={i.id} className="list-row">
                      <a className="grow ellipsis" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>{i.title}</a>
                      {i.currentDeadline && dateKey(i.currentDeadline) <= day && <Pill className="sm" tone="risk">{/^overdue/i.test(dueLabel(i.currentDeadline)) ? dueLabel(i.currentDeadline) : `Due ${dueLabel(i.currentDeadline)}`}</Pill>}
                      <StatusPill item={i} sm />
                      {moved ? (
                        <Pill className="sm" tone="ok">✓ On {moveLabel}'s SOW</Pill>
                      ) : (
                        <button className="btn xs" onClick={() => move([i.id])}>Move to {moveLabel}</button>
                      )}
                    </div>
                  );
                })}
                <div className="tiny muted" style={{ marginTop: 6 }}>
                  Moving adds the task to {moveLabel}'s SOW. Its deadline stays the same — use “Request extension” on the task if it needs more time.
                </div>
              </div>
            )}

            {/* The day's plan — first 3 are the Top 3; editable for today and ahead */}
            <div className="row" style={{ margin: '18px 0 8px' }}>
              <h3 className="small spacer" style={{ margin: 0 }}>
                Plan · Top 3 {top.planned ? '· planned' : isPast ? '' : '· suggested'}
              </h3>
              {!isPast && !rec?.submittedAt && planning === null && (
                <button className="btn xs" onClick={() => setPlanning(top.planned ? [...top.ids] : [])}>
                  {top.planned ? 'Change plan' : 'Plan the day'}
                </button>
              )}
            </div>
            {planning !== null ? (
              <div>
                <div className="small muted" style={{ marginBottom: 8 }}>Pick your tasks for {fmtDate(parseKey(day))} — the first 3 you pick are the Top 3. ({planning.length} picked)</div>
                {pickable.length === 0 && <Empty>No open tasks to pick.</Empty>}
                <div className="stack-sm">
                  {pickable.map((i) => {
                    const on = planning.includes(i.id);
                    return (
                      <label key={i.id} className="check list-row">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setPlanning(on ? planning.filter((x) => x !== i.id) : [...planning, i.id])}
                        />
                        <span className="grow ellipsis">{i.title}</span>
                        {on && planning.indexOf(i.id) < 3 && <Pill className="sm" tone="gold">★ Top 3</Pill>}
                        <span className="tiny muted">{i.currentDeadline ? dueLabel(i.currentDeadline) : 'No deadline'}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="row" style={{ marginTop: 10, gap: 8 }}>
                  <button className="btn sm primary" disabled={!planning.length} onClick={savePlan}>Save plan</button>
                  <button className="btn sm ghost" onClick={() => setPlanning(null)}>Cancel</button>
                </div>
              </div>
            ) : topItems.length ? (
              topItems.map((i, n) => (
                <a key={i.id} className="list-row" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>
                  <span className="grow ellipsis">{n < 3 ? '★ ' : ''}{i.title}</span>
                  {i.assigneeId && i.assigneeId !== me && <Pill className="sm" tone="gold">With {firstName(s, i.assigneeId)}</Pill>}
                  <StatusPill item={i} sm />
                </a>
              ))
            ) : (
              <Empty>{isPast ? 'No Top 3 was set for this day.' : 'Nothing planned yet — press “Plan the day” or “Create SOW”.'}</Empty>
            )}

            <h3 className="small" style={{ margin: '18px 0 8px' }}>Due this day</h3>
            {due.length ? (
              due.map((i) => (
                <a key={i.id} className="list-row" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>
                  <span className="grow ellipsis">{i.title}</span>
                  <StatusPill item={i} sm />
                </a>
              ))
            ) : (
              <Empty>Nothing due this day.</Empty>
            )}
          </>
        )}
      </div>

      {eod && <EodFlow dayKey={eod} onClose={() => setEod(null)} />}
      {off && <OffDialog initialDate={day} onClose={() => setOff(false)} />}
      {creating && <CreateSow day={day} onClose={() => setCreating(false)} />}
    </div>
  );
}


/* ---------- Create SOW: plan a day from open tasks + new ones ---------- */
const blankRow = () => ({ title: '', size: 'S', impact: 3, reason: '' });

function CreateSow({ day, onClose }) {
  const { s, me, commit, toast } = useStore();
  const current = todaysTop3(s, me, day);
  const prevDay = prevWorkingKey(s, day);
  const carried = unfinishedOn(s, me, prevDay);
  const carriedIds = new Set(carried.map((i) => i.id));
  const open = [...carried, ...myOpenWork(s, me).filter((i) => i.type !== 'cycle' && !carriedIds.has(i.id))];
  // Unfinished tasks from the day before start ticked, so they move to this day.
  const [picked, setPicked] = useState(() => [...new Set([...(current.planned ? current.ids : []), ...carried.map((i) => i.id)])]);
  const [rows, setRows] = useState([blankRow()]);
  const setRow = (n, k, v) => setRows(rows.map((r, j) => (j === n ? { ...r, [k]: v } : r)));
  const filled = rows.filter((r) => r.title.trim());
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const save = () => {
    if (!picked.length && !filled.length) return toast('Pick a task or add a new one.', 'error');
    let made = 0;
    const res = commit((st) => {
      const ids = [...picked];
      for (const r of filled) {
        const x = createItem(st, me, { type: 'task', title: r.title, ownerId: me, size: r.size, impact: +r.impact, impactReason: r.reason, deadline: atTime(day, '18:30') });
        if (x.error) return x;
        ids.push(x.id);
        made++;
      }
      const d = sowDay(st, me, day);
      d.top3 = [...new Set(ids)];
      d.plannedAt = now();
      return { ok: true };
    });
    if (res?.error) return;
    toast(`SOW created for ${fmtDate(parseKey(day))}${made ? ` · ${made} new task${made > 1 ? 's' : ''} due that day` : ''}.`);
    onClose();
  };

  return (
    <Modal
      wide
      title={`Create SOW · ${fmtLongDay(parseKey(day))}`}
      sub="Pick what you'll work on and add any new tasks. Unfinished tasks from the day before are already ticked. The first 3 are your Top 3; new tasks are due that day at 6:30 PM. You log how it went with the end-of-day update."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={save}>Save SOW</button>
        </>
      }
    >
      <Field label={`Your open tasks (${picked.length} picked)`}>
        {open.length === 0 && <Empty>No open tasks — add new ones below.</Empty>}
        <div className="stack-sm" style={{ maxHeight: 260, overflow: 'auto' }}>
          {open.map((i) => {
            const n = picked.indexOf(i.id);
            return (
              <label key={i.id} className="check list-row">
                <input type="checkbox" checked={n >= 0} onChange={() => toggle(i.id)} />
                <span className="grow ellipsis">{i.title}</span>
                {carriedIds.has(i.id) && <Pill className="sm" tone="risk">Not finished {fmtDate(parseKey(prevDay))}</Pill>}
                {n >= 0 && n < 3 && <Pill className="sm" tone="gold">★ Top 3</Pill>}
                <span className="tiny muted">{i.currentDeadline ? dueLabel(i.currentDeadline) : 'No deadline'}</span>
              </label>
            );
          })}
        </div>
      </Field>
      <Field label="New tasks for this day">
        {rows.map((r, n) => (
          <div key={n} className="card" style={{ padding: 10, marginBottom: 8 }}>
            <div className="row wrap" style={{ gap: 8 }}>
              <input className="input sm grow" placeholder="Task title" value={r.title} onChange={(e) => setRow(n, 'title', e.target.value)} />
              {rows.length > 1 && <button className="btn xs ghost" onClick={() => setRows(rows.filter((_, j) => j !== n))}>Remove</button>}
            </div>
            {r.title.trim() && (
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                <Choice options={[['S', 'S'], ['M', 'M'], ['L', 'L']]} value={r.size} onChange={(v) => setRow(n, 'size', v)} />
                <Choice options={[[1, '1 Low'], [3, '3 Medium'], [5, '5 Critical']]} value={+r.impact} onChange={(v) => setRow(n, 'impact', v)} />
                <input className="input sm grow" placeholder="Why this impact? (optional)" value={r.reason} onChange={(e) => setRow(n, 'reason', e.target.value)} />
              </div>
            )}
          </div>
        ))}
        <button className="btn xs" onClick={() => setRows([...rows, blankRow()])}>+ Another task</button>
      </Field>
    </Modal>
  );
}
