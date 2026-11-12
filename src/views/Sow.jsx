import React, { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store.jsx';
import { Icon, Pill, Bar, HealthPill, SizeImpact, Modal, Field, Choice, go, useRoute, Empty, Flags, StatusPill, TierPill, Accent, Trail } from '../components/ui.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import { P } from '../engine/policy.js';
import {
  userById, itemById, firstName, progressOf, progressText, healthTone, flagsOf, projectOf, loadFor, loadTone, OFF_CODES, NOT_TOUCHED_CODES, STAGES, isWorkItem, isHoliday,
} from '../engine/core.js';
import { approvalsFor, APPROVAL_LABEL } from '../engine/actions.js';
import { deliveryScore, tierOf, moodOf } from '../engine/scoring.js';
import {
  weekStreak, todaysTop3, eodItems, nextWorkingKey, rankCandidates, submitSOW, markOff, offDayOf, sowDayOf, sowRequired, openSowDays, myOpenWork, SOW_LABEL,
} from '../engine/sow.js';
import { now, DAY, dateKey, parseKey, atTime, fmtLongDay, fmtDate, fmtDT, monthName, startOfWeek, greeting, ago, addKey, startOfDay, dueLabel } from '../lib/time.js';

export function TaskCard({ item, showOwner }) {
  const { s } = useStore();
  const proj = projectOf(s, item);
  const tone = healthTone(s, item);
  const rule = item.recurringId ? s.recurring.find((r) => r.id === item.recurringId) : null;
  return (
    <a className={`tcard ${tone}`} href={`#/task/${item.id}`}>
      <div className="row">
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="meta">
            {item.key}
            {proj ? ` · ${proj.title}` : ''}
            {rule ? ` · ↻ ${rule.freq[0].toUpperCase() + rule.freq.slice(1)}` : ''}
            {showOwner ? ` · ${firstName(s, item.ownerId)}` : ''}
          </div>
          <div className="title">{item.title}</div>
        </div>
        <HealthPill item={item} />
      </div>
      <div className="foot">
        <SizeImpact item={item} />
        <span className="nowrap">
          Due {fmtDT(item.currentDeadline)}
          {item.originalDeadline && item.originalDeadline !== item.currentDeadline && <span className="strike faint" style={{ marginLeft: 6 }}>orig. {fmtDate(item.originalDeadline).slice(4)}</span>}
        </span>
        <Bar value={progressOf(s, item)} tone={tone} />
        <b>{progressText(s, item)}</b>
      </div>
    </a>
  );
}

export default function SowView() {
  const { s, me } = useStore();
  const { query } = useRoute();
  const user = userById(s, me);
  const t = now();
  const today = dateKey(t);
  const [eod, setEod] = useState(null); // date key being filled
  const [off, setOff] = useState(false);
  const [act, setAct] = useState(null);

  useEffect(() => {
    if (query.eod) {
      const open = openSowDays(s, me);
      setEod(open.length ? open[open.length - 1] : today);
      go('/sow');
    }
  }, [query.eod]); // eslint-disable-line

  const streak = weekStreak(s, me);
  const ds = deliveryScore(s, me);
  const tier = tierOf(s, ds.score);
  const mood = moodOf(ds.score);
  const ws = startOfWeek(t);
  const mine = myOpenWork(s, me).filter((i) => i.ownerId === me);
  const dueWeek = s.items.filter((i) => i.ownerId === me && isWorkItem(i) && i.currentDeadline >= ws && i.currentDeadline < ws + 7 * DAY && !['cancelled', 'skipped'].includes(i.status));
  const atRisk = mine.filter((i) => flagsOf(s, i).atRisk).length;
  const overdue = mine.filter((i) => flagsOf(s, i).overdue).length;
  const load = loadFor(s, me, ws);
  const top = todaysTop3(s, me, today);
  const topItems = top.ids.map((id) => itemById(s, id)).filter(Boolean);
  const offToday = offDayOf(s, me, today);
  const holiday = isHoliday(s, today);
  const required = sowRequired(s, me, today);
  const submittedToday = sowDayOf(s, me, today)?.submittedAt;
  const openDays = openSowDays(s, me);
  const afterNudge = t >= atTime(today, P(s, 'sowNudge1'));
  const remaining = topItems.filter((i) => !['in_review', 'closed'].includes(i.status)).length;

  // Waiting on you
  const waiting = [];
  for (const i of s.items) {
    if (i.status === 'awaiting' && i.ownerId === me && !i.declined) waiting.push({ i, verb: 'Accept', sub: `from ${firstName(s, i.creatorId)} · ${ago(i.assignedAt)}`, btn: ['Accept', 'accept', 'primary'] });
    if (i.status === 'in_review' && i.reviewerId === me) waiting.push({ i, verb: 'Review', sub: `submitted by ${firstName(s, i.ownerId)}`, btn: ['Review', 'review', 'outline'] });
    if (i.status === 'blocked' && i.blockedBy === me) waiting.push({ i, verb: 'Unblock', sub: `${firstName(s, i.ownerId)} is waiting on you`, pill: 'Blocked' });
    if (i.status === 'awaiting' && i.declined && i.creatorId === me) waiting.push({ i, verb: 'Reassign', sub: `${firstName(s, i.ownerId)} declined`, pill: 'Declined' });
    if (i.status === 'pending_approval' && i.rejected && i.creatorId === me) waiting.push({ i, verb: 'Reassign', sub: 'Owner not approved', pill: 'Not approved' });
    if (i.assigneeId === me && ['open', 'in_progress'].includes(i.status)) waiting.push({ i, verb: 'Your part', sub: `handed over by ${firstName(s, i.ownerId)}`, pill: 'With you' });
  }
  const approvals = approvalsFor(s, me);
  const touchedIds = new Set(s.activity.filter((a) => a.userId === me && a.itemId && a.ts >= startOfDay(t)).map((a) => a.itemId));
  const also = s.items.filter(
    (i) => !top.ids.includes(i.id) && (i.ownerId === me || i.assigneeId === me) && isWorkItem(i) && ((i.currentDeadline && startOfDay(i.currentDeadline) === startOfDay(t)) || touchedIds.has(i.id)) && !['cancelled', 'skipped'].includes(i.status)
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">{fmtLongDay(t)}</div>
          <h1 className="page-title">
            <Accent text={`${greeting()}, *${user.name.split(' ')[0]}*`} />
          </h1>
          <div className="page-sub">
            {offToday && offToday.code !== 'Half-day'
              ? `You're off today (${offToday.code}). No SOW needed — rest well. 🌿`
              : holiday
              ? `Company holiday: ${holiday.name}. No SOW today.`
              : submittedToday
              ? "Today's SOW is in. Thank you — see you tomorrow. 🌿"
              : remaining > 0
              ? `You're ${remaining} task${remaining > 1 ? 's' : ''} away from a clean day. Let's close strong.`
              : 'Your top 3 are moving nicely. Log the day when you wrap up.'}
          </div>
        </div>
        <div className="row wrap">
          {!offToday && (
            <button className="btn" onClick={() => setOff(true)}>
              Mark today Off
            </button>
          )}
          {required && (
            <button className={`btn ${afterNudge && !submittedToday ? 'orange' : 'outline'}`} onClick={() => setEod(today)}>
              {submittedToday ? 'Edit plan for tomorrow' : 'End-of-day update'}
            </button>
          )}
        </div>
      </div>

      {P(s, 'setupSprintOpen') && (
        <div className="hint-box info" style={{ marginBottom: 20 }}>
          <span className="spacer">Setup sprint is open — add the tasks you're working on right now so they're on the board.</span>
          <a className="btn sm primary" href="#/setup">
            Open setup sprint
          </a>
        </div>
      )}
      {openDays.length > 0 && (
        <div className="hint-box warn" style={{ marginBottom: 20 }}>
          <Icon name="clock" size={18} />
          <span className="spacer">
            Your SOW for {openDays.map((k) => fmtDate(parseKey(k))).join(', ')} is still open. It's still needed — it only takes 3 minutes.
          </span>
          <button className="btn sm orange" onClick={() => setEod(openDays[openDays.length - 1])}>
            Fill it now
          </button>
        </div>
      )}

      <div className="grid g4" style={{ marginBottom: 24 }}>
        <div className="card stat">
          <div className="card-label">SOW streak</div>
          <div className="num">
            {streak.onTime}
            <small>/{streak.required}</small>
          </div>
          <div className="dots" title="Mon–Sat this week">
            {streak.days.map((d) => (
              <i key={d.k} className={d.st === 'on_time' ? 'on' : d.st === 'late' ? 'late' : d.st === 'missed' ? 'miss' : ''} title={`${fmtDate(parseKey(d.k))}: ${SOW_LABEL[d.st]}`} />
            ))}
          </div>
        </div>
        <a className="card stat" href="#/score" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="card-label">Delivery score · {monthName(t)}</div>
          <div className="num">
            {ds.score ?? '—'}{' '}
            <span title={`${mood.label} — only you can see this`} style={{ fontSize: 28 }}>
              {mood.icon}
            </span>
          </div>
          <Pill tone={tier.key === 'platinum' ? 'platinum' : tier.key === 'support' ? '' : 'gold'} className="sm">
            {tier.name}
            {P(s, 'trialMode') ? ' · trial' : ''}
          </Pill>
        </a>
        <a className="card stat" href="#/tasks?tab=doing" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="card-label">Due this week</div>
          <div className="num">{dueWeek.length}</div>
          <div className="sub">
            {atRisk} at-risk · {overdue} overdue
          </div>
        </a>
        <div className="card stat">
          <div className="card-label">My load this week</div>
          <div className="num" style={{ color: load > 100 ? 'var(--overdue)' : load >= 80 ? 'var(--risk-ink)' : 'var(--text)' }}>{load}%</div>
          <Bar value={load} tone={loadTone(load)} thick />
        </div>
      </div>

      <div className="split">
        <div className="card">
          <div className="row" style={{ marginBottom: 14 }}>
            <h2 className="card-title spacer" style={{ margin: 0 }}>
              <Accent text="Today's *Top 3*" />
            </h2>
            <span className="small muted">{top.planned ? 'Picked by you yesterday' : 'Suggested for you'}</span>
          </div>
          <div className="stack-sm" style={{ gap: 14 }}>
            {topItems.length ? topItems.map((i) => <TaskCard key={i.id} item={i} />) : <Empty>No open tasks — enjoy the calm, or pick something from My Tasks.</Empty>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h2 className="card-title">
              <Accent text="Waiting *on you*" />
            </h2>
            {waiting.length === 0 && approvals.length === 0 && <Empty>Nothing waiting on you. 🌿</Empty>}
            {waiting.slice(0, 6).map(({ i, verb, sub, btn, pill }) => (
              <div key={i.id + verb} className="list-row">
                <a className="grow" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>
                  <div className="ellipsis">
                    <b>{verb}:</b> {i.title}
                  </div>
                  <div className="tiny muted">{sub}</div>
                </a>
                {btn ? (
                  <button className={`btn sm ${btn[2]}`} onClick={() => setAct({ item: i, action: btn[1] })}>
                    {btn[0]}
                  </button>
                ) : (
                  <Pill className="sm" tone={pill === 'Blocked' ? 'blocked' : 'gold'}>
                    {pill}
                  </Pill>
                )}
              </div>
            ))}
            {approvals.length > 0 && (
              <div className="list-row">
                <a className="grow" href="#/approvals" style={{ color: 'inherit' }}>
                  <b>Approve:</b> {approvals.length} request{approvals.length > 1 ? 's' : ''}
                  <div className="tiny muted">{[...new Set(approvals.map((a) => APPROVAL_LABEL[a.type]))].join(' · ')}</div>
                </a>
                <a className="btn sm outline" href="#/approvals">
                  Open
                </a>
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="card-title">Also due / touched today</h2>
            {also.length ? (
              also.map((i) => (
                <a key={i.id} className="list-row" href={`#/task/${i.id}`} style={{ color: 'inherit' }}>
                  <span className="grow ellipsis">{i.title}</span>
                  <StatusPill item={i} sm />
                </a>
              ))
            ) : (
              <Empty>Nothing else due today.</Empty>
            )}
          </div>
        </div>
      </div>

      {eod && <EodFlow dayKey={eod} onClose={() => setEod(null)} />}
      {off && <OffDialog onClose={() => setOff(false)} />}
      {act && <ActionDialog item={act.item} action={act.action} onClose={() => setAct(null)} />}
    </div>
  );
}

/* ---------- End-of-day update ---------- */
function EodFlow({ dayKey, onClose }) {
  const { s, me, commit, toast } = useStore();
  const items = useMemo(() => eodItems(s, me, dayKey), []); // eslint-disable-line
  const forKey = nextWorkingKey(s, dayKey);
  const [step, setStep] = useState(1);
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        {
          itemId: i.id,
          outcome: i.status === 'blocked' ? 'not_touched' : null,
          reason: i.status === 'blocked' ? 'Blocked' : '',
          comment: '',
          proofLink: '',
          stage: Math.min(75, i.stage || 0),
          checklist: (i.checklist || []).map((c) => ({ ...c })),
          pickup: 'tomorrow',
          pickupCustom: '',
        },
      ])
    )
  );
  const setE = (id, k, v) => setEntries((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));

  // Plan tomorrow: rank what's left after today's outcomes.
  const pickupOf = (e) => (e.pickup === 'tomorrow' ? forKey : e.pickup === 'plus2' ? nextWorkingKey(s, forKey) : e.pickupCustom || null);
  const ranked = useMemo(() => {
    return rankCandidates(s, me, forKey, atTime(forKey, '09:00')).filter(({ item }) => {
      const e = entries[item.id];
      if (!e) return true;
      if (e.outcome === 'done') return false;
      if (e.outcome === 'progress') {
        const p = pickupOf(e);
        return !p || p <= forKey;
      }
      return true;
    });
  }, [entries, step]); // eslint-disable-line
  const suggested = ranked.slice(0, 3).map((x) => x.item.id);
  const [plan, setPlan] = useState(null);
  const [dropReasons, setDropReasons] = useState({});
  const chosen = plan ?? suggested;
  const droppedOverdue = suggested.filter((id) => !chosen.includes(id) && flagsOf(s, itemById(s, id), atTime(forKey, '09:00')).overdue);
  const halfTomorrow = offDayOf(s, me, forKey)?.code === 'Half-day';

  const next = () => {
    for (const i of items) {
      const e = entries[i.id];
      if (!e.outcome) return toast(`Pick an outcome for “${i.title}”.`, 'error');
      if (e.outcome === 'not_touched' && (!e.reason || !e.comment.trim())) return toast(`“${i.title}”: add a reason and a short comment.`, 'error');
      if (e.outcome === 'done' && i.ownerId === me && !/^https?:\/\/\S+\.\S+/.test(e.proofLink)) return toast(`“${i.title}”: add a proof link to submit it.`, 'error');
    }
    setStep(2);
  };
  const submit = () => {
    const list = items.map((i) => {
      const e = entries[i.id];
      return { ...e, pickupDate: e.outcome === 'progress' ? pickupOf(e) : null, stage: i.progressMethod === 'stages' ? e.stage : undefined, checklist: i.progressMethod === 'checklist' ? e.checklist : undefined };
    });
    const r = commit((st) => submitSOW(st, me, dayKey, list, { forKey, top3: chosen, droppedOverdue, dropReasons }));
    if (!r.error) {
      toast(r.status === 'on_time' ? 'SOW logged on time. 🌿 See you tomorrow!' : r.status === 'late' ? 'SOW logged (late — no penalty, streak restarts).' : 'SOW logged. Thanks for closing the loop.');
      onClose();
    }
  };
  const move = (idx, dir) => {
    const arr = [...chosen];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setPlan(arr);
  };

  return (
    <Modal
      wide
      title={<Accent text={step === 1 ? 'How did *today* go?' : `Plan *${fmtDate(parseKey(forKey))}*`} />}
      sub={
        <div className="stack-sm">
          <Trail steps={['Log today', 'Plan tomorrow']} current={step - 1} />
          <span>{step === 1 ? `${fmtDate(parseKey(dayKey))} · one outcome per task` : 'Pick your top 3 — suggested by impact × urgency'}</span>
        </div>
      }
      onClose={onClose}
      footer={
        step === 1 ? (
          <button className="btn primary" onClick={next}>
            Next: plan tomorrow →
          </button>
        ) : (
          <>
            <button className="btn ghost" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button className="btn primary" onClick={submit}>
              Submit SOW
            </button>
          </>
        )
      }
    >
      {step === 1 && (
        <>
          {items.length === 0 && <div className="hint-box info">No tasks to report on today. Go straight to planning tomorrow.</div>}
          {items.map((i) => {
            const e = entries[i.id];
            const isOwner = i.ownerId === me;
            return (
              <div key={i.id} className="card tight">
                <div className="row">
                  <b className="spacer">{i.title}</b>
                  <span className="tiny muted">{progressText(s, i)}</span>
                </div>
                <div className="mt-sm">
                  <Choice
                    options={[['done', isOwner ? '✓ Done' : '✓ My part done'], ['progress', 'Progress'], ['not_touched', 'Not touched']]}
                    value={e.outcome}
                    onChange={(v) => setE(i.id, 'outcome', v)}
                    tones={{ done: 'ok', not_touched: 'warn' }}
                  />
                </div>
                {e.outcome === 'done' && isOwner && (
                  <div className="mt-sm">
                    <input className="input sm" placeholder="Proof link — https://…" value={e.proofLink} onChange={(ev) => setE(i.id, 'proofLink', ev.target.value)} />
                    <div className="tiny muted mt-sm">Goes to {firstName(s, i.reviewerId)} for review.</div>
                  </div>
                )}
                {e.outcome === 'done' && !isOwner && <div className="tiny muted mt-sm">It goes back to {firstName(s, i.ownerId)} (owner).</div>}
                {e.outcome === 'progress' && (
                  <div className="stack-sm mt-sm">
                    {i.progressMethod === 'stages' && (
                      <Choice options={STAGES.filter(([v]) => v < 100).map(([v, l]) => [v, `${l}`])} value={e.stage} onChange={(v) => setE(i.id, 'stage', v)} />
                    )}
                    {i.progressMethod === 'checklist' &&
                      e.checklist.map((c, ci) => (
                        <label key={c.id} className="check small">
                          <input type="checkbox" checked={c.done} onChange={(ev) => setE(i.id, 'checklist', e.checklist.map((x, j) => (j === ci ? { ...x, done: ev.target.checked } : x)))} /> {c.text}
                        </label>
                      ))}
                    <div className="row wrap small">
                      <span className="muted">Pick up:</span>
                      <Choice options={[['tomorrow', 'Tomorrow'], ['plus2', '+2 days'], ['custom', 'Custom']]} value={e.pickup} onChange={(v) => setE(i.id, 'pickup', v)} />
                      {e.pickup === 'custom' && <input type="date" className="input sm" style={{ width: 170 }} min={forKey} max={i.currentDeadline ? dateKey(i.currentDeadline) : undefined} value={e.pickupCustom} onChange={(ev) => setE(i.id, 'pickupCustom', ev.target.value)} />}
                    </div>
                  </div>
                )}
                {e.outcome === 'not_touched' && (
                  <div className="row wrap mt-sm">
                    <select className="input sm" style={{ width: 190 }} value={e.reason} onChange={(ev) => setE(i.id, 'reason', ev.target.value)}>
                      <option value="">Reason…</option>
                      {NOT_TOUCHED_CODES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                {e.outcome && (
                  <input className="input sm mt-sm" placeholder={e.outcome === 'not_touched' ? 'Short comment (required)' : 'Comment (optional)'} value={e.comment} onChange={(ev) => setE(i.id, 'comment', ev.target.value)} />
                )}
              </div>
            );
          })}
        </>
      )}
      {step === 2 && (
        <>
          {halfTomorrow && <div className="hint-box info">Tomorrow is a half-day — pick at least 1 task.</div>}
          <div className="lbl">Your top 3</div>
          {chosen.length === 0 && <Empty>Pick from the list below.</Empty>}
          {chosen.map((id, idx) => {
            const it = itemById(s, id);
            return (
              <div key={id} className="list-row">
                <span className="b" style={{ width: 20 }}>
                  {idx + 1}
                </span>
                <span className="grow ellipsis">
                  {it.title} <span className="tiny muted">· due {dueLabel(it.currentDeadline)}</span>
                </span>
                <button className="btn xs ghost" onClick={() => move(idx, -1)} aria-label="Move up">
                  <Icon name="up" size={14} />
                </button>
                <button className="btn xs ghost" onClick={() => move(idx, 1)} aria-label="Move down">
                  <Icon name="down" size={14} />
                </button>
                <button className="btn xs" onClick={() => setPlan(chosen.filter((x) => x !== id))}>
                  Remove
                </button>
              </div>
            );
          })}
          {droppedOverdue.map((id) => (
            <Field key={id} label={`You dropped an overdue task: “${itemById(s, id).title}”. One line on why?`}>
              <input className="input sm" value={dropReasons[id] || ''} onChange={(e) => setDropReasons((d) => ({ ...d, [id]: e.target.value }))} />
            </Field>
          ))}
          <div className="lbl mt">Other open work (ranked)</div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {ranked
              .filter(({ item }) => !chosen.includes(item.id))
              .map(({ item, p }) => (
                <div key={item.id} className="list-row">
                  <span className="grow ellipsis">
                    {item.title} <span className="tiny muted">· priority {p} · due {dueLabel(item.currentDeadline)}</span>
                  </span>
                  <Flags item={item} />
                  <button className="btn xs outline" disabled={chosen.length >= 3} onClick={() => setPlan([...chosen, item.id])}>
                    + Add
                  </button>
                </div>
              ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------- Mark Off ---------- */
export function OffDialog({ onClose }) {
  const { s, me, commit, toast } = useStore();
  const [date, setDate] = useState(dateKey(now()));
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const save = () => {
    const r = commit((st) => markOff(st, me, date, code, reason));
    if (!r.error) {
      toast(code === 'Half-day' ? 'Half-day marked — SOW still needed (min 1 task).' : 'Marked off. No SOW or nudges that day. Deadlines don’t move — extend or hand over if needed.');
      onClose();
    }
  };
  return (
    <Modal
      title="Mark a day off"
      sub="One tap with a reason code. Only your main manager sees the details."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={save}>
            Mark off
          </button>
        </>
      }
    >
      <Field label="Date">
        <input className="input" type="date" value={date} min={dateKey(now())} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Reason code">
        <Choice options={OFF_CODES.map((c) => [c, c])} value={code} onChange={setCode} />
      </Field>
      {code === 'Other' && (
        <Field label="Tell us a little more (required)">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <div className="hint-box info">Deadlines never move automatically. If something's due, request an extension or hand it over first.</div>
    </Modal>
  );
}
