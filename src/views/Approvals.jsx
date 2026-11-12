import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Pill, Person, Empty, Seg, Modal, Field, Choice } from '../components/ui.jsx';
import { approvalsFor, decideApproval, APPROVAL_LABEL, canDecide } from '../engine/actions.js';
import { itemById, firstName, nameOf } from '../engine/core.js';
import { ago, fmtDT } from '../lib/time.js';

const Rich = ({ text }) => text.split(/(\*[^*]+\*)/g).map((p, i) => (p.startsWith('*') && p.endsWith('*') ? <b key={i}>{p.slice(1, -1)}</b> : <React.Fragment key={i}>{p}</React.Fragment>));
const TONE = { extension: 'review', cross_vertical: 'gold', cancel: 'overdue', owner_change: 'primary', skip: '', blocked_extra: 'blocked', setup: 'ok', self_review: 'primary' };

export function ApprovalCard({ ap, compact }) {
  const { s, me, commit, toast } = useStore();
  const [deciding, setDeciding] = useState(null);
  const [comment, setComment] = useState('');
  const [changes, setChanges] = useState(() => {
    const it = ap.itemId ? itemById(s, ap.itemId) : null;
    return { size: it?.size, impact: it?.impact };
  });
  const setupItems = ap.type === 'setup' ? (ap.payload?.itemIds || []).map((id) => itemById(s, id)).filter(Boolean) : [];
  const review = ap.type === 'self_review';
  const item = ap.itemId ? itemById(s, ap.itemId) : null;
  const mine = canDecide(s, me, ap);
  const go = () => {
    const r = commit((st) => decideApproval(st, me, ap.id, deciding === 'approve', comment, review ? changes : {}));
    if (!r.error) {
      toast(deciding === 'approve' ? 'Approved.' : 'Rejected — they’ve been told why.');
      setDeciding(null);
    }
  };
  return (
    <div style={{ padding: compact ? '12px 0' : '16px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <Pill tone={TONE[ap.type]} className="sm">
          {APPROVAL_LABEL[ap.type]}
        </Pill>
        <span className="tiny muted">
          {firstName(s, ap.requesterId)} · {ago(ap.ts)}
        </span>
        {ap.status !== 'pending' && (
          <Pill tone={ap.status === 'approved' ? 'ok' : 'blocked'} className="sm">
            {ap.status} by {firstName(s, ap.decidedBy)}
          </Pill>
        )}
      </div>
      <div style={{ margin: '6px 0 8px' }}>
        <Rich text={ap.text} />
      </div>
      {ap.type === 'extension' && ap.payload?.cost?.length > 0 && <div className="tiny muted">If approved: {ap.payload.cost.join(', ')} of Base.</div>}
      {setupItems.length > 0 && (
        <div className="small" style={{ margin: '4px 0 8px' }}>
          {setupItems.map((i) => (
            <div key={i.id} className="row" style={{ padding: '3px 0' }}>
              <span className="spacer">• {i.title}</span>
              <span className="tiny muted">
                {i.size} · Impact {i.impact} · due {new Date(i.currentDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
              </span>
            </div>
          ))}
        </div>
      )}
      {item && !compact && (
        <a className="tiny" href={`#/task/${item.id}`}>
          Open {item.key}
        </a>
      )}
      {ap.comment && <div className="small muted">“{ap.comment}”</div>}
      {mine && (
        <div className="row mt-sm">
          <button className="btn sm primary" onClick={() => setDeciding('approve')}>
            {review ? 'Confirm' : 'Approve'}
          </button>
          {!review && (
            <button className="btn sm" onClick={() => setDeciding('reject')}>
              {ap.type === 'setup' ? 'Send back' : 'Reject'}
            </button>
          )}
        </div>
      )}
      {deciding && (
        <Modal
          title={deciding === 'approve' ? 'Approve' : 'Reject'}
          sub={APPROVAL_LABEL[ap.type]}
          onClose={() => setDeciding(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setDeciding(null)}>
                Close
              </button>
              <button className={`btn ${deciding === 'approve' ? 'primary' : 'danger'}`} onClick={go}>
                {deciding === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </>
          }
        >
          <div>
            <Rich text={ap.text} />
          </div>
          {review && deciding === 'approve' && (
            <>
              <Field label="Size">
                <Choice options={[['S', 'S · ≤2 days'], ['M', 'M · 3–10 days'], ['L', 'L · >10 days']]} value={changes.size} onChange={(v) => setChanges((c) => ({ ...c, size: v }))} />
              </Field>
              <Field label="Impact">
                <Choice options={[[1, '1 Low'], [3, '3 Medium'], [5, '5 Critical']]} value={changes.impact} onChange={(v) => setChanges((c) => ({ ...c, impact: v }))} />
              </Field>
            </>
          )}
          <Field label="Comment (required)">
            <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} autoFocus placeholder={deciding === 'approve' ? 'Any note for them?' : 'Why not — and what would work instead?'} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

export default function ApprovalsView() {
  const { s, me } = useStore();
  const [tab, setTab] = useState('mine');
  const mine = approvalsFor(s, me).sort((a, b) => a.ts - b.ts);
  const requested = s.approvals.filter((a) => a.requesterId === me).sort((a, b) => b.ts - a.ts);
  const history = s.approvals.filter((a) => a.status !== 'pending' && (a.decidedBy === me || a.approverIds.includes(me))).sort((a, b) => b.decidedAt - a.decidedAt);
  const list = tab === 'mine' ? mine : tab === 'requested' ? requested : history;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Every approval in one place</div>
          <h1 className="page-title">Approvals</h1>
        </div>
        <Seg options={[['mine', `Waiting on me (${mine.length})`], ['requested', 'My requests'], ['history', 'Decided']]} value={tab} onChange={setTab} />
      </div>
      <div className="card" style={{ paddingTop: 6, paddingBottom: 6 }}>
        {list.length === 0 ? <Empty>{tab === 'mine' ? 'Inbox zero. 🌿' : 'Nothing here yet.'}</Empty> : list.map((a) => <ApprovalCard key={a.id} ap={a} />)}
      </div>
    </div>
  );
}
