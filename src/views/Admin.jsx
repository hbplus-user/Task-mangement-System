import React, { useState } from 'react';
import { useStore } from '../store.jsx';
import { Pill, Avatar, Modal, Field, UserSelect, go, Empty, StatusPill, Choice } from '../components/ui.jsx';
import { P, POLICY_GROUPS, DEFAULT_POLICY, POLICY_LABEL, COMPANY } from '../engine/policy.js';
import { userById, nameOf, firstName, ABILITIES, can, isFA, isFounder, uid, verticalById, log, notify, founders, scoreEvent, mainManager, itemById, directReports, reportTree, activeUsers } from '../engine/core.js';
import { changePolicy, currentPolicyValue, rolesChanged, linkedOpenItems, offboardReassign } from '../engine/actions.js';
import { tick } from '../engine/tick.js';
import { now, HOUR, DAY, fmtDT, fmtDate, dateKey, parseKey, atTime, addDays, ago } from '../lib/time.js';

const TABS = [
  ['users', 'Users', 'users'],
  ['verticals', 'Verticals', 'verticals'],
  ['holidays', 'Holidays', 'holidays'],
  ['roles', 'Roles', '_fa'],
  ['policy', 'Policy & Scoring', 'policy'],
  ['offboarding', 'Offboarding', 'offboarding'],
  ['log', 'System log', 'syslog'],
  ['adjust', 'Score adjustments', '_fa'],
  ['demo', 'Demo tools', '_fa'],
];

export default function AdminView({ tab }) {
  const { s, me } = useStore();
  const allowed = TABS.filter(([, , ab]) => (ab === '_fa' ? isFA(s, me) : can(s, me, ab)));
  const cur = allowed.find((t) => t[0] === tab)?.[0] || allowed[0]?.[0];
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Founders, admins & granted roles</div>
          <h1 className="page-title">Admin</h1>
        </div>
      </div>
      <div className="tabs">
        {allowed.map(([k, l]) => (
          <button key={k} className={cur === k ? 'on' : ''} onClick={() => go(`/admin/${k}`)}>
            {l}
          </button>
        ))}
      </div>
      {cur === 'users' && <Users />}
      {cur === 'verticals' && <Verticals />}
      {cur === 'holidays' && <Holidays />}
      {cur === 'roles' && <Roles />}
      {cur === 'policy' && <Policy />}
      {cur === 'offboarding' && <Offboarding />}
      {cur === 'log' && <SysLog />}
      {cur === 'adjust' && <Adjustments />}
      {cur === 'demo' && <Demo />}
    </div>
  );
}

/* ---------- Users ---------- */
function Users() {
  const { s } = useStore();
  const [edit, setEdit] = useState(null);
  return (
    <div className="card" style={{ padding: '10px 16px' }}>
      <div className="row" style={{ padding: '6px 0 10px' }}>
        <span className="small muted spacer">Users are never deleted — use Offboarding to deactivate. Manager is not a role: anyone with reports is a manager automatically.</span>
        <button className="btn sm primary" onClick={() => setEdit('new')}>
          + Add user
        </button>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Verticals (main ★) · manager</th>
              <th className="num">Hours/day</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {s.users.map((u) => (
              <tr key={u.id} className="click" onClick={() => setEdit(u.id)}>
                <td>
                  <span className="person">
                    <Avatar id={u.id} />
                    <span>
                      {u.name}
                      <div className="tiny muted">{u.email}</div>
                    </span>
                  </span>
                </td>
                <td>
                  <Pill className="sm" tone={u.role === 'founder' ? 'gold' : u.role === 'admin' ? 'review' : ''}>
                    {u.role}
                  </Pill>{' '}
                  {(u.customRoles || []).map((r) => (
                    <Pill key={r} className="sm">
                      {s.roles.find((x) => x.id === r)?.name}
                    </Pill>
                  ))}
                </td>
                <td className="small">
                  {u.verticals.map((v) => (
                    <div key={v.vid}>
                      {v.main ? '★ ' : ''}
                      {verticalById(s, v.vid)?.name} · {v.managerId ? firstName(s, v.managerId) : '—'}
                    </div>
                  ))}
                  {directReports(s, u.id).length > 0 && (
                    <div className="tiny muted">Manages: {directReports(s, u.id).map((r) => firstName(s, r)).join(', ')}</div>
                  )}
                </td>
                <td className="num">{u.hours}</td>
                <td>
                  <Pill className="sm" tone={u.status === 'active' ? 'ok' : u.status === 'offboarding' ? 'risk' : 'blocked'}>
                    {u.status}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <UserEdit id={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function UserEdit({ id, onClose }) {
  const { s, me, commit, toast } = useStore();
  const existing = id !== 'new' ? userById(s, id) : null;
  const [f, setF] = useState(() =>
    existing
      ? structuredClone(existing)
      : { name: '', email: '', role: 'member', customRoles: [], verticals: [{ vid: s.verticals[1]?.id, managerId: null, main: true }], hours: 9, status: 'active', muted: [] }
  );
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const canRole = isFA(s, me);
  // People who report to this person. Picked from the manager's side; on save each
  // added person's main vertical gets this person as manager.
  const [reports, setReports] = useState(() => (existing ? directReports(s, existing.id) : []));
  const [addPick, setAddPick] = useState('');
  // Can't add yourself, or anyone above you (that would make a loop).
  const above = (() => {
    const out = [];
    let cur = existing ? mainManager(s, existing.id) : null;
    while (cur && !out.includes(cur)) {
      out.push(cur);
      cur = mainManager(s, cur);
    }
    return out;
  })();
  const save = () => {
    if (!f.name.trim()) return toast('Name is needed.', 'error');
    if (!f.email.toLowerCase().endsWith(`@${COMPANY.domain}`)) return toast(`Email must be on @${COMPANY.domain}.`, 'error');
    if (!f.verticals.length || !f.verticals.some((v) => v.main)) return toast('Pick at least one vertical and mark one as main.', 'error');
    if (f.role !== 'founder' && f.verticals.some((v) => !v.managerId)) return toast('Every vertical needs a manager (except for founders).', 'error');
    if (f.verticals.some((v) => v.managerId === (existing?.id || 'x'))) return toast("Someone can't be their own manager.", 'error');
    if (existing && reports.some((r) => f.verticals.some((v) => v.managerId === r))) return toast(`${f.name.split(' ')[0]} can't manage their own manager.`, 'error');
    const before = existing ? directReports(s, existing.id) : [];
    const added = reports.filter((r) => !before.includes(r));
    const removed = before.filter((r) => !reports.includes(r));
    // People taken off this team go to this person's own manager (or a founder).
    const fallback = existing && (f.verticals.find((v) => v.main)?.managerId || founders(s).find((x) => x !== existing.id));
    if (removed.length && !fallback) return toast('Give the people you removed a new manager from their own row first.', 'error');
    commit((st) => {
      if (existing) {
        for (const rid of added) {
          const r = userById(st, rid);
          if (!r) continue;
          const mv = r.verticals.find((v) => v.main) || r.verticals[0];
          if (mv) mv.managerId = id;
          else r.verticals.push({ vid: f.verticals.find((v) => v.main)?.vid, managerId: id, main: true });
          st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: `Manager changed: ${r.name}`, from: null, to: f.name });
          notify(st, rid, `You now report to *${f.name}*.`);
          notify(st, id, `*${r.name}* now reports to you.`);
        }
        for (const rid of removed) {
          const r = userById(st, rid);
          if (!r) continue;
          for (const v of r.verticals) if (v.managerId === id) v.managerId = fallback;
          st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: `Manager changed: ${r.name}`, from: f.name, to: nameOf(st, fallback) });
          notify(st, rid, `You now report to *${nameOf(st, fallback)}*.`);
        }
      }
      if (existing) {
        const u = userById(st, id);
        const roleChange = u.role !== f.role || JSON.stringify(u.customRoles) !== JSON.stringify(f.customRoles);
        const before = JSON.stringify({ v: u.verticals, h: u.hours });
        Object.assign(u, { name: f.name, email: f.email.toLowerCase(), role: f.role, customRoles: f.customRoles, verticals: f.verticals, hours: +f.hours });
        if (roleChange) rolesChanged(st, me, `${u.name}: ${f.role}${f.customRoles.length ? ' + ' + f.customRoles.map((r) => st.roles.find((x) => x.id === r)?.name).join(', ') : ''}`);
        if (before !== JSON.stringify({ v: u.verticals, h: u.hours })) st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: `User updated: ${u.name}`, from: null, to: 'verticals / manager / hours' });
      } else {
        const u = { ...f, id: uid('u'), email: f.email.toLowerCase(), slackId: `U0${Math.random().toString(36).slice(2, 8).toUpperCase()}`, joinedOn: dateKey(now()), hours: +f.hours };
        st.users.push(u);
        st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'User added', from: null, to: `${u.name} (${u.email})` });
        if (u.role !== 'member') rolesChanged(st, me, `${u.name} added as ${u.role}`);
      }
    });
    toast('Saved.');
    onClose();
  };
  return (
    <Modal wide title={existing ? existing.name : 'Add user'} onClose={onClose} footer={<button className="btn primary" onClick={save}>Save</button>}>
      <div className="form-grid">
        <Field label="Name">
          <input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={`Google Workspace email (@${COMPANY.domain})`} hint="Slack is linked automatically by email.">
          <input className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="System role" hint={canRole ? 'Founder / Admin / Member' : 'Only founders and admins change roles'}>
          <select className="input" disabled={!canRole} value={f.role} onChange={(e) => set('role', e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="founder">Founder</option>
          </select>
        </Field>
        <Field label="Daily working hours">
          <input className="input" type="number" value={f.hours} onChange={(e) => set('hours', e.target.value)} />
        </Field>
        <Field label="Custom company-level roles" className="full">
          <div className="row wrap">
            {s.roles.map((r) => (
              <label key={r.id} className="check">
                <input type="checkbox" disabled={!canRole} checked={f.customRoles.includes(r.id)} onChange={(e) => set('customRoles', e.target.checked ? [...f.customRoles, r.id] : f.customRoles.filter((x) => x !== r.id))} /> {r.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Verticals · manager per vertical · main" className="full">
          {f.verticals.map((v, i) => (
            <div key={i} className="row wrap">
              <select className="input sm" style={{ width: 160 }} value={v.vid} onChange={(e) => set('verticals', f.verticals.map((x, j) => (j === i ? { ...x, vid: e.target.value } : x)))}>
                {s.verticals.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <UserSelect className="input sm" value={v.managerId} placeholder="Manager…" exclude={existing ? [existing.id] : []} onChange={(m) => set('verticals', f.verticals.map((x, j) => (j === i ? { ...x, managerId: m } : x)))} />
              <label className="check small">
                <input type="radio" name="main" checked={v.main} onChange={() => set('verticals', f.verticals.map((x, j) => ({ ...x, main: j === i })))} /> Main
              </label>
              <button className="btn xs ghost" onClick={() => set('verticals', f.verticals.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button className="btn xs" onClick={() => set('verticals', [...f.verticals, { vid: s.verticals[0].id, managerId: null, main: false }])}>
            + Vertical
          </button>
        </Field>
        {existing && (
          <Field
            label={`Team members — people who report to ${f.name.split(' ')[0] || 'this person'}`}
            hint="Anyone can be a manager — a Member, Admin or Founder. Added people get this person as the manager of their main vertical. Removed people go to this person's own manager."
            className="full"
          >
            <div className="row wrap">
              {reports.length === 0 && <span className="small muted">No one yet.</span>}
              {reports.map((r) => (
                <Pill key={r} className="sm">
                  {nameOf(s, r)}{' '}
                  <button className="btn xs ghost" title="Remove from this team" onClick={() => setReports(reports.filter((x) => x !== r))}>
                    ✕
                  </button>
                </Pill>
              ))}
            </div>
            <div className="row wrap" style={{ marginTop: 6 }}>
              <UserSelect
                className="input sm"
                value={addPick}
                placeholder="Add a team member…"
                exclude={[existing.id, ...reports, ...above]}
                onChange={(m) => setAddPick(m || '')}
              />
              <button
                className="btn xs"
                disabled={!addPick}
                onClick={() => {
                  setReports([...reports, addPick]);
                  setAddPick('');
                }}
              >
                + Add
              </button>
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Verticals & holidays ---------- */
function Verticals() {
  const { s, me, commit, toast } = useStore();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const add = () => {
    if (!name.trim() || !key.trim()) return toast('Name and key are needed.', 'error');
    if (s.verticals.some((v) => v.key === key.toUpperCase())) return toast('That key is taken.', 'error');
    commit((st) => {
      st.verticals.push({ id: uid('v'), name: name.trim(), key: key.toUpperCase().slice(0, 4) });
      st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Vertical added', from: null, to: name });
    });
    setName('');
    setKey('');
  };
  return (
    <div className="card">
      {s.verticals.map((v) => (
        <div key={v.id} className="list-row">
          <Pill className="sm">{v.key}</Pill>
          <input
            className="input sm"
            style={{ maxWidth: 260 }}
            defaultValue={v.name}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== v.name &&
              commit((st) => {
                const x = st.verticals.find((y) => y.id === v.id);
                st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Vertical renamed', from: x.name, to: e.target.value });
                x.name = e.target.value.trim();
              })
            }
          />
          <span className="tiny muted grow">{s.users.filter((u) => u.verticals.some((x) => x.vid === v.id)).length} people</span>
        </div>
      ))}
      <div className="row mt">
        <input className="input sm" placeholder="New vertical name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input sm" style={{ width: 100 }} placeholder="Key" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn sm primary" onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}

function Holidays() {
  const { s, me, commit } = useStore();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const list = [...s.holidays].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="card">
      <div className="small muted" style={{ marginBottom: 10 }}>
        No SOW is needed on company holidays. Deadlines never move automatically.
      </div>
      {list.map((h) => (
        <div key={h.date} className="list-row">
          <span style={{ width: 140 }}>{fmtDate(parseKey(h.date), true)}</span>
          <span className="grow">{h.name}</span>
          <button className="btn xs ghost" onClick={() => commit((st) => { st.holidays = st.holidays.filter((x) => x.date !== h.date); st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Holiday removed', from: h.name, to: null }); })}>
            Remove
          </button>
        </div>
      ))}
      <div className="row mt">
        <input className="input sm" type="date" style={{ width: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input sm" placeholder="Holiday name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn sm primary"
          onClick={() => {
            if (!date || !name) return;
            commit((st) => {
              st.holidays.push({ date, name });
              st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Holiday added', from: null, to: `${date} ${name}` });
            });
            setDate('');
            setName('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------- Roles editor ---------- */
function Roles() {
  const { s, me, commit, toast } = useStore();
  const [name, setName] = useState('');
  const toggle = (rid, ab, on) =>
    commit((st) => {
      const r = st.roles.find((x) => x.id === rid);
      r.abilities = on ? [...r.abilities, ab] : r.abilities.filter((a) => a !== ab);
      rolesChanged(st, me, `Role “${r.name}” ${on ? 'can now' : 'can no longer'}: ${ABILITIES.find((a) => a[0] === ab)[1]}`);
    });
  return (
    <div className="card">
      <div className="hint-box info" style={{ marginBottom: 14 }}>
        Custom roles control company-level abilities only. Task-level rules are never set per role — they live in Policy & Scoring Settings. Founders get a DM for every change.
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th>Role</th>
              {ABILITIES.map(([k, l]) => (
                <th key={k} style={{ whiteSpace: 'normal', minWidth: 90 }}>
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>Founder / Admin</b>
              </td>
              {ABILITIES.map(([k]) => (
                <td key={k}>✓</td>
              ))}
            </tr>
            {s.roles.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  <div className="tiny muted">{s.users.filter((u) => (u.customRoles || []).includes(r.id)).map((u) => firstName(s, u.id)).join(', ') || 'No one yet'}</div>
                </td>
                {ABILITIES.map(([k]) => (
                  <td key={k}>
                    <input type="checkbox" style={{ accentColor: 'var(--primary)', width: 18, height: 18 }} checked={r.abilities.includes(k)} onChange={(e) => toggle(r.id, k, e.target.checked)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row mt">
        <input className="input sm" placeholder="New role name (e.g. Finance Admin)" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn sm primary"
          onClick={() => {
            if (!name.trim()) return toast('Name the role.', 'error');
            commit((st) => {
              st.roles.push({ id: uid('r'), name: name.trim(), abilities: [] });
              rolesChanged(st, me, `New role “${name.trim()}” created`);
            });
            setName('');
          }}
        >
          Add role
        </button>
      </div>
      <div className="tiny muted mt-sm">Assign roles to people in Users.</div>
    </div>
  );
}

/* ---------- Policy & Scoring ---------- */
function Policy() {
  const { s, me, commit, toast } = useStore();
  const [draft, setDraft] = useState({});
  const [eff, setEff] = useState(dateKey(addDays(now(), 1)));
  const val = (k) => (k in draft ? draft[k] : currentPolicyValue(s, k));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const changed = Object.keys(draft).filter((k) => String(draft[k]) !== String(currentPolicyValue(s, k)));
  const save = () => {
    const r = commit((st) => changePolicy(st, me, Object.fromEntries(changed.map((k) => [k, draft[k]])), parseKey(eff)));
    if (!r.error) {
      toast(`${r.count} setting${r.count > 1 ? 's' : ''} saved — effective ${fmtDate(parseKey(eff))}. Founders DM'd, team informed.`);
      setDraft({});
    }
  };
  const versions = [...s.policyVersions].sort((a, b) => b.ts - a.ts);
  return (
    <div className="stack">
      <div className="hint-box info">
        Changes apply from the date you choose — past scores are never recalculated. Every change is logged (who, old → new, when), both founders get a DM, and the team gets a Slack announcement.
      </div>
      {POLICY_GROUPS.map((g) => (
        <div key={g.title} className="card">
          <h3 className="serif" style={{ fontSize: 22, marginBottom: 12 }}>
            {g.title}
          </h3>
          <div className="form-grid">
            {g.fields.map((f) => {
              const v = val(f.key);
              const dirty = changed.includes(f.key);
              return (
                <Field key={f.key} label={<span>{f.label} {dirty && <Pill tone="risk" className="sm">changed</Pill>}</span>} hint={`Default: ${fmt(DEFAULT_POLICY[f.key])}${f.unit ? ' ' + f.unit : ''}`}>
                  {f.type === 'bool' ? (
                    <Choice options={[[true, 'On'], [false, 'Off']]} value={v} onChange={(x) => set(f.key, x)} />
                  ) : f.type === 'select' ? (
                    <select className="input" value={String(v)} onChange={(e) => set(f.key, isNaN(+e.target.value) ? e.target.value : +e.target.value)}>
                      {f.options.map(([ov, ol]) => (
                        <option key={ov} value={String(ov)}>
                          {ol}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'time' ? (
                    <input className="input" type="time" value={v} onChange={(e) => set(f.key, e.target.value)} />
                  ) : (
                    <div className="row">
                      <input className="input" type="number" step={f.step || 1} min={f.min} max={f.max} value={v} onChange={(e) => set(f.key, e.target.value === '' ? '' : +e.target.value)} />
                      {f.unit && <span className="small muted nowrap">{f.unit}</span>}
                    </div>
                  )}
                </Field>
              );
            })}
          </div>
        </div>
      ))}
      <div className="card" style={{ position: 'sticky', bottom: 70, zIndex: 5 }}>
        <div className="row wrap">
          <b className="spacer">{changed.length ? `${changed.length} unsaved change${changed.length > 1 ? 's' : ''}` : 'No changes'}</b>
          <span className="small muted">Effective from</span>
          <input className="input sm" type="date" style={{ width: 170 }} value={eff} min={dateKey(now())} onChange={(e) => setEff(e.target.value)} />
          <button className="btn ghost" disabled={!changed.length} onClick={() => setDraft({})}>
            Discard
          </button>
          <button className="btn primary" disabled={!changed.length} onClick={save}>
            Save changes
          </button>
        </div>
      </div>
      <div className="card">
        <h3 className="serif" style={{ fontSize: 22, marginBottom: 8 }}>
          Policy versions
        </h3>
        {versions.length === 0 && <Empty>Running on the v1.0 defaults (Rewards & Penalties canvas FINAL v1.0).</Empty>}
        {versions.map((v) => (
          <div key={v.id} className="list-row small">
            <span className="muted nowrap" style={{ width: 150 }}>
              {fmtDT(v.ts)}
            </span>
            <span className="grow">
              <b>{POLICY_LABEL[v.key] || v.key}</b>: {fmt(v.oldValue)} → {fmt(v.newValue)}
            </span>
            <span className="muted">by {firstName(s, v.changedBy)}</span>
            <Pill className="sm" tone={v.effectiveFrom > now() ? 'gold' : 'ok'}>
              {v.effectiveFrom > now() ? 'from' : 'since'} {fmtDate(v.effectiveFrom)}
            </Pill>
          </div>
        ))}
      </div>
    </div>
  );
}
const fmt = (v) => (v === true ? 'On' : v === false ? 'Off' : v === 0 ? '0' : String(v));

/* ---------- Offboarding ---------- */
function Offboarding() {
  const { s, me, commit, toast } = useStore();
  const [who, setWho] = useState(null);
  const [to, setTo] = useState({});
  const leaver = who ? userById(s, who) : null;
  const linked = who ? linkedOpenItems(s, who) : [];
  const waiting = who ? s.items.filter((i) => i.offboardedFrom === who && i.status === 'awaiting') : [];
  const role = (i) => [i.ownerId === who && 'owner', i.assigneeId === who && 'assignee', i.creatorId === who && 'creator', i.reviewerId === who && 'reviewer'].filter(Boolean).join(', ');
  const reports = who ? s.users.filter((u) => u.verticals.some((v) => v.managerId === who) && u.status !== 'inactive') : [];
  const start = () =>
    commit((st) => {
      const u = userById(st, who);
      if (u.status === 'active') {
        u.status = 'offboarding';
        st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Offboarding started', from: 'active', to: u.name });
      }
    });
  const deactivate = () => {
    commit((st) => {
      const u = userById(st, who);
      u.status = 'inactive';
      st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'User deactivated (history archived)', from: 'offboarding', to: u.name });
      notify(st, founders(st), `${u.name} has been deactivated. All their open work was handed over and accepted.`, {});
    });
    toast(`${leaver.name} is now inactive. History is archived, nothing deleted.`);
    setWho(null);
  };
  return (
    <div className="card">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <span className="muted">Person leaving or changing vertical:</span>
        <UserSelect className="input sm" value={who} onChange={setWho} exclude={[me]} />
        {leaver?.status === 'active' && (
          <button className="btn sm outline" onClick={start}>
            Start offboarding
          </button>
        )}
        {leaver && <Pill tone={leaver.status === 'offboarding' ? 'risk' : 'ok'}>{leaver.status}</Pill>}
      </div>
      {leaver && (
        <>
          {reports.length > 0 && (
            <div className="hint-box warn" style={{ marginBottom: 12 }}>
              {reports.length} people report to {leaver.name.split(' ')[0]} ({reports.map((r) => r.name.split(' ')[0]).join(', ')}). Give them a new manager in Users first.
            </div>
          )}
          <div className="card-label">Open items linked to {leaver.name.split(' ')[0]} ({linked.length})</div>
          {linked.length === 0 && <Empty>Nothing linked — all handed over.</Empty>}
          {linked.map((i) => (
            <div key={i.id} className="list-row">
              <span className="grow">
                <a href={`#/task/${i.id}`}>{i.key}</a> {i.title}
                <div className="tiny muted">as {role(i)}</div>
              </span>
              <StatusPill item={i} sm />
              <UserSelect className="input sm" value={to[i.id]} exclude={[who]} placeholder="Hand over to…" onChange={(v) => setTo((x) => ({ ...x, [i.id]: v }))} />
              <button className="btn sm" disabled={!to[i.id] || leaver.status !== 'offboarding'} onClick={() => commit((st) => offboardReassign(st, me, i.id, who, to[i.id]))}>
                Reassign
              </button>
            </div>
          ))}
          {waiting.length > 0 && (
            <>
              <div className="card-label mt">Waiting for the new owner to accept ({waiting.length})</div>
              {waiting.map((i) => (
                <div key={i.id} className="list-row small">
                  <span className="grow">{i.title}</span>
                  <span className="muted">{firstName(s, i.ownerId)} hasn't accepted yet</span>
                </div>
              ))}
            </>
          )}
          <div className="row mt">
            <span className="spacer small muted">Deactivate is enabled once every item is reassigned and accepted, and nobody reports to them.</span>
            <button className="btn danger" disabled={leaver.status !== 'offboarding' || linked.length > 0 || waiting.length > 0 || reports.length > 0} onClick={deactivate}>
              Deactivate {leaver.name.split(' ')[0]}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- System log ---------- */
function SysLog() {
  const { s } = useStore();
  const [q, setQ] = useState('');
  const [n, setN] = useState(100);
  const list = [...s.activity]
    .sort((a, b) => b.ts - a.ts)
    .filter((a) => !q || `${nameOf(s, a.userId)} ${a.action} ${a.from} ${a.to} ${itemById(s, a.itemId)?.title || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input sm" placeholder="Filter by person, action, task…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <span className="small muted">{list.length} entries · read-only, can't be edited or deleted</span>
      </div>
      {list.slice(0, n).map((a) => (
        <div key={a.id} className="list-row small">
          <span className="muted nowrap" style={{ width: 140 }}>
            {fmtDT(a.ts)}
          </span>
          <span style={{ width: 90 }}>{a.userId ? firstName(s, a.userId) : 'System'}</span>
          <span className="grow">
            {a.action}
            {a.itemId && (
              <>
                {' · '}
                <a href={`#/task/${a.itemId}`}>{itemById(s, a.itemId)?.key}</a>
              </>
            )}
            {(a.from || a.to) && (
              <span className="muted">
                {' '}
                {a.from ?? '—'} → {a.to ?? '—'}
              </span>
            )}
          </span>
        </div>
      ))}
      {list.length > n && (
        <button className="btn sm mt" onClick={() => setN(n + 200)}>
          Show more
        </button>
      )}
    </div>
  );
}

/* ---------- Score adjustments (appeals) ---------- */
function Adjustments() {
  const { s, me, commit, toast } = useStore();
  const [d, setD] = useState({});
  const list = [...s.appeals].sort((a, b) => (a.status === 'open' ? -1 : 1) - (b.status === 'open' ? -1 : 1) || b.ts - a.ts);
  const decide = (ap, uphold) => {
    const pts = +(d[ap.id]?.pts || 0);
    const note = d[ap.id]?.note || '';
    if (!note.trim()) return toast('Add a note for the decision.', 'error');
    commit((st) => {
      const a = st.appeals.find((x) => x.id === ap.id);
      a.status = uphold ? 'adjusted' : 'declined';
      a.outcome = note;
      a.decidedBy = me;
      a.decidedAt = now();
      if (uphold && pts) scoreEvent(st, a.userId, st.scoreEvents.find((e) => e.id === a.scoreEventId)?.itemId, 'adjustment', 'ADJ', pts, `Appeal outcome: ${note}`);
      st.activity.push({ id: uid('a'), ts: now(), userId: me, itemId: null, action: 'Appeal decided', from: nameOf(st, a.userId), to: `${a.status}${pts ? ` (${pts > 0 ? '+' : ''}${pts})` : ''}` });
      notify(st, a.userId, `Your appeal was ${uphold ? `accepted${pts ? ` — ${pts > 0 ? '+' : ''}${pts} points` : ''}` : 'reviewed and not changed'}: “${note}”`, {});
    });
  };
  return (
    <div className="card">
      <div className="small muted" style={{ marginBottom: 10 }}>
        Disputes on penalties and ratings are settled here in the monthly review window. Outcomes are logged as score adjustment events.
      </div>
      {list.length === 0 && <Empty>No appeals.</Empty>}
      {list.map((ap) => {
        const ev = s.scoreEvents.find((e) => e.id === ap.scoreEventId);
        return (
          <div key={ap.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line-soft)' }}>
            <div className="row wrap">
              <b>{nameOf(s, ap.userId)}</b>
              <span className="muted small">
                on {ev?.code} {ev?.note} ({ev?.points})
              </span>
              <Pill className="sm" tone={ap.status === 'open' ? 'risk' : 'ok'}>
                {ap.status}
              </Pill>
            </div>
            <div className="small mt-sm">“{ap.reason}”</div>
            {ap.status === 'open' ? (
              <div className="row wrap mt-sm">
                <input className="input sm" style={{ width: 110 }} type="number" placeholder="± points" value={d[ap.id]?.pts || ''} onChange={(e) => setD((x) => ({ ...x, [ap.id]: { ...x[ap.id], pts: e.target.value } }))} />
                <input className="input sm" style={{ flex: 1 }} placeholder="Decision note (required)" value={d[ap.id]?.note || ''} onChange={(e) => setD((x) => ({ ...x, [ap.id]: { ...x[ap.id], note: e.target.value } }))} />
                <button className="btn sm primary" onClick={() => decide(ap, true)}>
                  Adjust
                </button>
                <button className="btn sm" onClick={() => decide(ap, false)}>
                  Keep as is
                </button>
              </div>
            ) : (
              <div className="tiny muted">
                {firstName(s, ap.decidedBy)}: {ap.outcome}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Demo tools ---------- */
function Demo() {
  const { s, commit, reset, setClock, toast, mode } = useStore();
  const doReset = () => {
    if (mode === 'local') {
      if (confirm('Reset all demo data?')) { reset(); toast('Demo data reset.'); }
      return;
    }
    const typed = prompt('This wipes the SHARED Supabase database for everyone and reloads the demo team. The activity log is kept. Type RESET to continue.');
    if (typed === 'RESET') reset();
  };
  const shift = (ms) => setClock((s.clockOffset || 0) + ms);
  const to = (ts) => setClock(ts - Date.now());
  return (
    <div className="stack">
      <div className="card">
        <h3 className="serif" style={{ fontSize: 22 }}>Demo clock</h3>
        <p className="muted small">
          Move time forward to see the system follow up on its own: SOW nudges at 6:30 PM and 9 PM, missed SOW at 10 AM, 24h acceptance nudges, review auto-accept, at-risk and overdue alerts, recurring tasks and stream cycles.
        </p>
        <div className="row wrap">
          <b>Now: {fmtDT(now())}</b>
          {s.clockOffset ? <Pill tone="risk">shifted {Math.round(s.clockOffset / HOUR)}h</Pill> : <Pill tone="ok">real time</Pill>}
        </div>
        <div className="row wrap mt">
          <button className="btn sm" onClick={() => shift(HOUR)}>+1 hour</button>
          <button className="btn sm" onClick={() => shift(6 * HOUR)}>+6 hours</button>
          <button className="btn sm" onClick={() => shift(DAY)}>+1 day</button>
          <button className="btn sm" onClick={() => to(atTime(now(), '18:35'))}>Today 6:35 PM</button>
          <button className="btn sm" onClick={() => to(atTime(now(), '21:05'))}>Today 9:05 PM</button>
          <button className="btn sm" onClick={() => to(atTime(addDays(now(), 1), '10:05'))}>Tomorrow 10:05 AM</button>
          <button className="btn sm" onClick={() => setClock(0)}>Back to real time</button>
        </div>
      </div>
      <div className="card">
        <h3 className="serif" style={{ fontSize: 22 }}>Data</h3>
        <p className="muted small">{mode === 'local' ? 'Local mode: data lives in this browser only. Resetting reloads the HB+ demo team.' : 'Connected to Supabase: everyone shares this data. The demo clock only affects your browser.'}</p>
        <div className="row wrap">
          <button className="btn sm" onClick={() => { commit((st) => tick(st)); toast('System checks ran.'); }}>Run system checks now</button>
          <button className="btn sm danger" onClick={doReset}>Reset demo data</button>
        </div>
      </div>
    </div>
  );
}
