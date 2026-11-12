import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store.jsx';
import { Icon, go, Seg } from './ui.jsx';
import { itemById, firstName } from '../engine/core.js';
import { allowedActions, approvalsFor } from '../engine/actions.js';
import { COMPANY } from '../engine/policy.js';
import { now, ago, fmtTime } from '../lib/time.js';

const BTN = {
  accept: ['Accept', 'accept'],
  decline: ['Decline', 'decline'],
  update: ['Update progress', 'update'],
  submit: ['Submit', 'submit'],
  review: ['Review', 'review'],
  unblock: ['Unblock', 'unblock'],
  extension: ['Request extension', 'request_extension'],
  approve: ['Approve', null],
  reject: ['Reject', null],
  sow: ['Fill SOW', null],
  open: ['Open in app', null],
};

// Renders *bold* like Slack.
const Rich = ({ text }) => text.split(/(\*[^*]+\*)/g).map((p, i) => (p.startsWith('*') && p.endsWith('*') ? <b key={i}>{p.slice(1, -1)}</b> : <React.Fragment key={i}>{p}</React.Fragment>));

export default function SlackDrawer({ onClose }) {
  const { s, me, commit } = useStore();
  const [tab, setTab] = useState('dm');
  const t = now();
  const mine = s.notifications.filter((n) => n.userId === me && n.deliverAt <= t).sort((a, b) => b.ts - a.ts);
  const instant = mine.filter((n) => n.mode !== 'digest');
  const digest = mine.filter((n) => n.mode === 'digest');
  const held = s.notifications.filter((n) => n.userId === me && n.deliverAt > t).length;
  const channel = [...s.channel].sort((a, b) => b.ts - a.ts);

  const markRead = () =>
    commit((st) => {
      st.notifications.forEach((n) => {
        if (n.userId === me && n.deliverAt <= now()) n.read = true;
      });
    });

  const click = (n, key) => {
    const item = n.itemId ? itemById(s, n.itemId) : null;
    const [, action] = BTN[key] || [];
    onClose();
    if (key === 'sow') return go('/sow?eod=1');
    if (key === 'approve' || key === 'reject') return go('/approvals');
    if (item && action) return go(`/task/${item.id}?do=${action}`);
    if (item) return go(`/task/${item.id}`);
  };
  const stale = (n, key) => {
    const item = n.itemId ? itemById(s, n.itemId) : null;
    const [, action] = BTN[key] || [];
    if (key === 'approve' || key === 'reject') return n.itemId && !approvalsFor(s, me).some((a) => a.itemId === n.itemId);
    if (!item || !action) return false;
    return !allowedActions(s, me, item).includes(action);
  };

  const Msg = ({ n }) => (
    <div className={`slack-msg ${n.read ? '' : 'unread'}`}>
      <div className="bot">HB+</div>
      <div style={{ minWidth: 0 }}>
        <div className="small">
          <b>HB+ Tasks</b> <span className="faint tiny">APP · {ago(n.deliverAt)}</span>
        </div>
        <div className="txt">
          <Rich text={n.text} />
        </div>
        {n.buttons?.length > 0 && (
          <div className="btns">
            {n.buttons.map((b) => {
              const old = stale(n, b);
              return (
                <button key={b} className={`slack-btn ${b === 'accept' || b === 'approve' || b === 'sow' ? 'go' : ''}`} disabled={old} onClick={() => click(n, b)}>
                  {old ? 'Already done' : BTN[b]?.[0] || b}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <>
      <div className="drawer-ov" onClick={onClose} />
      <aside className="drawer" aria-label="Slack messages">
        <div className="drawer-head">
          <Icon name="chat" />
          <div className="spacer">
            <b>Slack · HB+ Tasks</b>
            <div className="tiny muted">What {firstName(s, me)} receives in Slack (simulated)</div>
          </div>
          <button className="btn xs" onClick={markRead}>
            Mark read
          </button>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: '10px 20px' }}>
          <Seg sm value={tab} onChange={setTab} options={[['dm', `DMs ${instant.filter((n) => !n.read).length || ''}`], ['digest', `7 PM digest ${digest.length || ''}`], ['ch', 'Channels']]} />
          {held > 0 && <div className="tiny muted mt-sm">{held} message(s) held for quiet hours (9 PM–8 AM) or the next digest.</div>}
        </div>
        <div className="drawer-body">
          {tab === 'dm' && (instant.length ? instant.slice(0, 80).map((n) => <Msg key={n.id} n={n} />) : <p className="muted" style={{ padding: 20 }}>No messages yet.</p>)}
          {tab === 'digest' && (digest.length ? digest.slice(0, 80).map((n) => <Msg key={n.id} n={n} />) : <p className="muted" style={{ padding: 20 }}>Nothing in your digest.</p>)}
          {tab === 'ch' &&
            channel.map((c) => (
              <div key={c.id} className="slack-msg">
                <div className="bot">#</div>
                <div>
                  <div className="small">
                    <b>{c.channel === 'credits' ? COMPANY.creditsChannel : COMPANY.announceChannel}</b> <span className="faint tiny">{ago(c.ts)} · {fmtTime(c.ts)}</span>
                  </div>
                  <div className="txt">{c.text}</div>
                </div>
              </div>
            ))}
        </div>
      </aside>
    </>,
    document.body
  );
}
