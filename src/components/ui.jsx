import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store.jsx';
import { STATUS, userById, flagsOf, healthTone, progressOf, progressText, activeUsers, firstName, IMPACT_LABEL } from '../engine/core.js';
import { tierOf } from '../engine/scoring.js';
import { fmtDT, dueLabel } from '../lib/time.js';

/* ---------- Router (hash based, works when opened from a file) ---------- */
export function useRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/sow');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/sow');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const [path, query = ''] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  return { parts, query: Object.fromEntries(new URLSearchParams(query)) };
}
export const go = (path) => {
  window.location.hash = path;
  window.scrollTo(0, 0);
};

/* ---------- Icons (minimal line icons) ---------- */
const P = {
  sow: 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z',
  tasks: 'M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
  matrix: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  approvals: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5',
  team: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
  company: 'M4 21V5l8-3v19M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  admin: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  x: 'M18 6L6 18M6 6l12 12',
  check: 'M20 6L9 17l-5-5',
  link: 'M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  pin: 'M12 17v5M5 17h14l-2-4V5H7v8z',
  repeat: 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3',
  user: 'M12 12a5 5 0 100-10 5 5 0 000 10zM3 22a9 9 0 0118 0',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  kanban: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
  hand: 'M18 11V6a2 2 0 00-4 0M14 10V4a2 2 0 00-4 0v2M10 10.5V6a2 2 0 00-4 0v8M18 8a2 2 0 014 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 012.8-2.8L7 15',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
  stream: 'M3 12c3-6 6 6 9 0s6 6 9 0',
  project: 'M3 7h18v13H3zM8 7V4h8v3',
  load: 'M12 20V10M18 20V4M6 20v-4',
};
export function Icon({ name, size = 20, stroke = 1.6, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.more} />
    </svg>
  );
}

/* ---------- People ---------- */
// Brand palette only (HB+ guidelines).
const AV_COLORS = ['#344161', '#6f8e7c', '#a9674d', '#747440', '#53372b', '#9f4022', '#c99d5d', '#d27440'];
export const initials = (name = '?') => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
export function Avatar({ id, size = '' }) {
  const { s } = useStore();
  const u = userById(s, id);
  if (!u) return <span className={`av ${size}`} style={{ background: '#ccc' }}>?</span>;
  const c = AV_COLORS[[...u.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AV_COLORS.length];
  return (
    <span className={`av ${size}`} style={{ background: c }} title={u.name}>
      {u.name.split(' ')[0].length <= 4 ? u.name[0] : initials(u.name).slice(0, 1)}
    </span>
  );
}
export function Person({ id, size = 'sm', full = false }) {
  const { s } = useStore();
  const u = userById(s, id);
  if (!id) return <span className="faint">—</span>;
  return (
    <span className="person">
      <Avatar id={id} size={size} />
      <span>{full ? u?.name : u?.name.split(' ')[0]}</span>
    </span>
  );
}
export function UserSelect({ value, onChange, exclude = [], placeholder = 'Choose a person', include = null, className = 'input', style }) {
  const { s } = useStore();
  const people = (include ? include.map((id) => userById(s, id)) : activeUsers(s)).filter((u) => u && !exclude.includes(u.id));
  return (
    <select className={className} style={style} value={value || ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {people.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {u.title || u.role}
        </option>
      ))}
    </select>
  );
}

/* ---------- Pills ---------- */
export const Pill = ({ tone = '', children, className = '', ...rest }) => (
  <span className={`pill ${tone} ${className}`} {...rest}>
    {children}
  </span>
);
export function StatusPill({ item, sm }) {
  const st = STATUS[item.status] || { label: item.status, tone: '' };
  const tone = item.status === 'awaiting' && item.declined ? 'overdue' : st.tone;
  return (
    <Pill tone={tone} className={sm ? 'sm' : ''}>
      {item.status === 'awaiting' && item.declined ? 'Declined — reassign' : item.status === 'pending_approval' && item.rejected ? 'Not approved' : st.label}
    </Pill>
  );
}
export function Flags({ item, sm = true }) {
  const { s } = useStore();
  const f = flagsOf(s, item);
  const cls = sm ? 'sm' : '';
  return (
    <>
      {f.overdue && <Pill tone="overdue" className={cls}>{dueLabel(item.currentDeadline)}</Pill>}
      {f.atRisk && <Pill tone="risk" className={cls}>At-risk</Pill>}
      {f.withAssignee && <Pill tone="gold" className={cls}><Icon name="user" size={12} /> With {firstName(s, item.assigneeId)}</Pill>}
      {f.private && <Pill className={cls}><Icon name="lock" size={12} /> Private</Pill>}
      {f.pinned && <Pill tone="primary" className={cls}><Icon name="pin" size={12} /> Pinned</Pill>}
    </>
  );
}
// The single "health" pill used on task cards (mockup: Overdue 1d / At-risk / On track).
export function HealthPill({ item }) {
  const { s } = useStore();
  const tone = healthTone(s, item);
  if (item.status === 'awaiting') return <StatusPill item={item} sm />;
  const label = { overdue: dueLabel(item.currentDeadline), risk: 'At-risk', ok: 'On track', review: 'In review', blocked: 'Blocked' }[tone];
  return <Pill tone={tone}>{label}</Pill>;
}
export const SizeImpact = ({ item }) => (
  <Pill className="sm">
    {item.size} · Impact {item.impact}
  </Pill>
);
export function TierPill({ score }) {
  const { s } = useStore();
  const t = tierOf(s, score);
  const tone = { platinum: 'platinum', gold: 'gold', silver: '', bronze: 'gold', support: 'support', none: '' }[t.key];
  return (
    <Pill tone={tone} className="sm">
      {score != null ? `${score} ` : ''}
      {t.name}
    </Pill>
  );
}

export function Bar({ value, tone = 'ok', thick }) {
  return (
    <div className={`bar ${tone} ${thick ? 'thick' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
export function ProgressInline({ item }) {
  const { s } = useStore();
  return (
    <span className="row" style={{ minWidth: 120 }}>
      <Bar value={progressOf(s, item)} tone={healthTone(s, item)} />
      <span className="small b nowrap">{progressText(s, item)}</span>
    </span>
  );
}
export function Deadline({ item, short }) {
  if (!item.currentDeadline) return <span className="faint">No end date</span>;
  const changed = item.originalDeadline && item.originalDeadline !== item.currentDeadline;
  return (
    <span>
      {short ? dueLabel(item.currentDeadline) : `Due ${fmtDT(item.currentDeadline)}`}
      {changed && !short && <span className="strike faint small"> orig. {fmtDT(item.originalDeadline).split(',')[0]}</span>}
    </span>
  );
}

/* ---------- Controls ---------- */
export function Seg({ options, value, onChange, sm }) {
  return (
    <div className={`seg ${sm ? 'sm' : ''}`}>
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
export function Choice({ options, value, onChange, tones = {} }) {
  return (
    <div className="choice">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={`${value === v ? 'on' : ''} ${tones[v] || ''}`} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}
export function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3].map((n) => (
        <button key={n} type="button" className={value >= n ? 'on' : ''} onClick={() => onChange(n)} aria-label={`${n} stars`}>
          ★
        </button>
      ))}
    </div>
  );
}
export function Modal({ title, sub, onClose, children, footer, wide }) {
  useEffect(() => {
    const on = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <button className="icon-btn close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
        {title && <h2>{title}</h2>}
        {sub && <div className="muted" style={{ marginBottom: 16 }}>{sub}</div>}
        <div className="stack-sm" style={{ gap: 14, marginTop: sub ? 0 : 14 }}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
export const Empty = ({ children }) => (
  <div className="muted small" style={{ padding: '18px 0', textAlign: 'center' }}>
    {children}
  </div>
);

/* ---------- Brand design elements (HB+ guidelines) ---------- */
// Headline with 2–3 highlighted words: "Good evening, *Riya*" → italic accent.
export const Accent = ({ text }) =>
  String(text)
    .split(/(\*[^*]+\*)/g)
    .map((p, i) => (p.startsWith('*') && p.endsWith('*') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em> : <React.Fragment key={i}>{p}</React.Fragment>));

// Dotted line with arrow heads between steps (guide page 8).
export const Trail = ({ steps, current }) => (
  <div className="trail" aria-label={`Step ${current + 1} of ${steps.length}`}>
    {steps.map((s, i) => (
      <React.Fragment key={s}>
        <span className={`step ${i === current ? 'on' : ''}`}>
          {i + 1} · {s}
        </span>
        {i < steps.length - 1 && <span className="line" />}
      </React.Fragment>
    ))}
  </div>
);

// Earthy, irregular shapes (guide: "earthy & irregular shapes") for the sign-in screen.
export const Blobs = () => (
  <svg className="blobs" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path fill="#a9674d" d="M-60 690c40-120 170-170 280-130s170 150 120 250-210 150-300 110-140-110-100-230z" />
    <path fill="#747440" d="M120 470c30-60 110-70 160-30s50 120 0 160-130 30-160-20-30-60 0-110z" />
    <path fill="#9f4022" d="M210 330c20-35 70-40 95-15s20 70-10 90-80 10-90-20 0-30 5-55z" />
    <path fill="#53372b" d="M1180 -40c90-30 190 30 200 120s-70 150-160 140-140-80-130-150 30-90 90-110z" />
    <path fill="#a9674d" d="M1250 520c80-70 210-40 250 50s-10 200-110 230-200-20-210-110 0-110 70-170z" />
    <path fill="#747440" d="M1040 780c40-50 120-50 160 0s20 130-50 150-130-20-140-70 0-40 30-80z" />
    <g fill="none" stroke="#a9674d" strokeWidth="1.6">
      <path d="M0 820 H 420" strokeDasharray="5 7" />
    </g>
  </svg>
);
export const impactText = (i) => `Impact ${i} · ${IMPACT_LABEL[i]}`;

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function downloadFile(name, content, type = 'text/csv') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const toCSV = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
