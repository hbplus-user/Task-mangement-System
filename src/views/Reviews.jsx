import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Accent, Pill, Bar, Field, Choice, Empty, UserSelect, Icon, Modal, downloadFile, toCSV } from '../components/ui.jsx';
import { ColumnChart } from '../components/charts.jsx';
import { periodOptions, perfSummary, saveReview, reviewsFor, RATING_LABEL, GOAL_LABEL, canManagePerson } from '../engine/goals.js';
import { teamScope, nameOf, firstName, isFA } from '../engine/core.js';
import { ReviewBody } from './Goals.jsx';
import { fmtDate } from '../lib/time.js';

const tone = (v) => (v == null ? '' : v >= 95 ? 'ok' : v >= 70 ? 'gold' : 'risk');

export default function ReviewsView() {
  const { s, me, commit, toast } = useStore();
  const periods = useMemo(() => periodOptions(), []);
  const people = teamScope(s, me).filter((id) => id !== me && canManagePerson(s, me, id));
  const [person, setPerson] = useState(people[0] || null);
  const [periodKey, setPeriodKey] = useState(periods[0].key);
  const period = periods.find((p) => p.key === periodKey);
  const sum = person ? perfSummary(s, person, period.start, period.end) : null;
  const existing = person ? reviewsFor(s, me, person) : [];
  const draft = existing.find((r) => r.periodStart === period.start && r.periodEnd === period.end && r.reviewerId === me && r.status === 'draft');
  const [f, setF] = useState({ rating: null, strengths: '', improve: '', notes: '' });
  const [open, setOpen] = useState(null);
  useEffect(() => {
    setF(draft ? { rating: draft.rating, strengths: draft.strengths, improve: draft.improve, notes: draft.notes } : { rating: null, strengths: '', improve: '', notes: '' });
  }, [person, periodKey, draft?.id]); // eslint-disable-line
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const save = (share) => {
    const r = commit((st) => saveReview(st, me, { userId: person, periodLabel: period.label, periodStart: period.start, periodEnd: period.end, ...f, id: draft?.id, share }));
    if (!r.error) toast(share ? `Shared with ${firstName(s, person)}.` : 'Draft saved.');
  };
  const exportCSV = () => {
    const rows = [['Person', 'Period', 'Overall', ...sum.components.map((c) => `${c.label} (weight ${c.weight}%)`), 'Tasks closed', 'On-time %', 'Avg rating', 'Impact-5 on time', 'Extensions']];
    rows.push([nameOf(s, person), period.label, sum.composite ?? '', ...sum.components.map((c) => c.value ?? ''), sum.stats.closed, sum.stats.onTime ?? '', sum.stats.avgRating ?? '', sum.stats.impact5, sum.stats.extensions]);
    rows.push([]);
    rows.push(['Goal', 'Type', 'Progress %', 'Status']);
    sum.goals.filter((g) => !g.private || isFA(s, me)).forEach((g) => rows.push([g.title, GOAL_LABEL[g.type], g.progress, g.status]));
    downloadFile(`review-${nameOf(s, person).replace(/\s+/g, '-')}-${period.label}.csv`, toCSV(rows));
  };

  if (!people.length) {
    return (
      <div className="card">
        <h2 className="card-title">Reviews</h2>
        <p className="muted">Reviews open up once people report to you.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Performance review · {period.label}</div>
          <h1 className="page-title">
            <Accent text={`${firstName(s, person)}'s *review*`} />
          </h1>
          <div className="page-sub">Task score is one part. Goals, KPIs and the daily SOW habit complete the picture.</div>
        </div>
        <div className="row wrap no-print">
          <UserSelect className="input sm" style={{ width: 'auto' }} value={person} onChange={(v) => v && setPerson(v)} include={people} />
          <select className="input sm" style={{ width: 'auto' }} value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={exportCSV}>
            <Icon name="download" size={16} /> CSV
          </button>
          <button className="btn" onClick={() => window.print()}>
            <Icon name="download" size={16} /> PDF
          </button>
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 20 }}>
        <div className="card stat">
          <div className="card-label">Overall</div>
          <div className="num">{sum.composite ?? '—'}</div>
          <div className="sub">100 = fully on target (weights in Policy & Scoring)</div>
        </div>
        <div className="card stat">
          <div className="card-label">Tasks closed</div>
          <div className="num">{sum.stats.closed}</div>
          <div className="sub">
            {sum.stats.onTime == null ? '—' : `${sum.stats.onTime}% on time`} · avg {sum.stats.avgRating ?? '—'}★
          </div>
        </div>
        <div className="card stat">
          <div className="card-label">Impact-5 on time</div>
          <div className="num">{sum.stats.impact5}</div>
          <div className="sub">{sum.stats.extensions} extensions approved</div>
        </div>
        <div className="card stat">
          <div className="card-label">Goals in period</div>
          <div className="num">{sum.goals.length}</div>
          <div className="sub">{sum.goals.filter((g) => g.progress >= 100 || g.status === 'achieved').length} achieved</div>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          <div className="card">
            <h2 className="card-title">What makes up the score</h2>
            {sum.components.map((c) => (
              <div key={c.key} className="row" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <span style={{ width: 200 }}>{c.label}</span>
                <Bar value={c.value == null ? 0 : Math.min(c.value, 100)} tone={tone(c.value) === 'gold' ? 'risk' : tone(c.value) || 'blocked'} />
                <b style={{ width: 48, textAlign: 'right' }}>{c.value ?? '—'}</b>
                <span className="tiny muted" style={{ width: 80, textAlign: 'right' }}>
                  {c.weight ? `weight ${c.weight}%` : 'not counted'}
                </span>
              </div>
            ))}
            <div className="tiny muted mt-sm">Components with no data in the period are left out; the rest are re-weighted.</div>
          </div>
          <div className="card">
            <h2 className="card-title">Delivery Score by month</h2>
            {sum.months.some((m) => m.score != null) ? <ColumnChart data={sum.months.map((m) => ({ label: m.label, value: Math.max(0, m.score ?? 0), tip: `${m.label}: ${m.score ?? '—'}` }))} height={160} /> : <Empty>No scored tasks in this period.</Empty>}
          </div>
          <div className="card">
            <h2 className="card-title">Goals</h2>
            {sum.goals.length === 0 && <Empty>No goals in this period.</Empty>}
            {sum.goals.map((g) => (
              <div key={g.id} className="list-row">
                <Pill className="sm">{GOAL_LABEL[g.type]}</Pill>
                <span className="grow">
                  {g.private ? <Icon name="lock" size={12} /> : null} {g.title}
                </span>
                <span style={{ width: 120 }}>
                  <Bar value={g.progress} tone={tone(g.progress) === 'gold' ? 'risk' : tone(g.progress)} />
                </span>
                <b style={{ width: 44, textAlign: 'right' }}>{g.progress}%</b>
              </div>
            ))}
            {sum.cycles.length > 0 && (
              <>
                <div className="card-label mt">Stream cycles owned</div>
                {sum.cycles.map((c) => (
                  <div key={c.id} className="list-row small">
                    <span className="grow">{c.title}</span>
                    <b>{c.pct}% KPI</b>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card no-print">
            <h2 className="card-title">
              <Accent text={draft ? 'Your *draft*' : 'Write the *review*'} />
            </h2>
            <Field label="Overall rating">
              <Choice options={[1, 2, 3, 4, 5].map((n) => [n, String(n)])} value={f.rating} onChange={(v) => set('rating', v)} />
              <div className="tiny muted">{f.rating ? RATING_LABEL[f.rating] : '1 = needs significant support · 5 = outstanding'}</div>
            </Field>
            <Field label="Strengths">
              <textarea className="input" value={f.strengths} onChange={(e) => set('strengths', e.target.value)} placeholder="Specific things that went well" />
            </Field>
            <Field label="One area to grow" className="mt">
              <textarea className="input" value={f.improve} onChange={(e) => set('improve', e.target.value)} placeholder="One clear, kind, specific focus" />
            </Field>
            <Field label="Notes (optional)" className="mt">
              <textarea className="input" value={f.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <div className="row mt">
              <button className="btn" onClick={() => save(false)}>
                Save draft
              </button>
              <span className="spacer" />
              <button className="btn primary" onClick={() => save(true)}>
                Share with {firstName(s, person)}
              </button>
            </div>
            <div className="tiny muted mt-sm">Sharing saves today's numbers with the review and sends {firstName(s, person)} a message to read and acknowledge it.</div>
          </div>
          <div className="card">
            <h2 className="card-title">Past reviews</h2>
            {existing.filter((r) => r.status !== 'draft').length === 0 && <Empty>None yet.</Empty>}
            {existing
              .filter((r) => r.status !== 'draft')
              .sort((a, b) => b.sharedAt - a.sharedAt)
              .map((r) => (
                <div key={r.id} className="list-row">
                  <span className="grow">
                    <b>{r.periodLabel}</b>
                    <div className="tiny muted">
                      {r.rating}/5 · by {firstName(s, r.reviewerId)} · {fmtDate(r.sharedAt)}
                    </div>
                  </span>
                  <Pill tone={r.status === 'acknowledged' ? 'ok' : 'gold'} className="sm">
                    {r.status === 'acknowledged' ? 'Acknowledged' : 'Waiting'}
                  </Pill>
                  <button className="btn xs" onClick={() => setOpen(r)}>
                    Read
                  </button>
                </div>
              ))}
          </div>
        </div>
      </div>
      {open && (
        <Modal title={<Accent text={`${open.periodLabel} *review*`} />} sub={`${nameOf(s, open.userId)} · by ${nameOf(s, open.reviewerId)}`} onClose={() => setOpen(null)} wide>
          <ReviewBody r={open} />
        </Modal>
      )}
    </div>
  );
}
