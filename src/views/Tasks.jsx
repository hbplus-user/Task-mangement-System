import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Accent, Icon, Seg, Flags, StatusPill, SizeImpact, ProgressInline, Deadline, Person, go, useRoute, Empty, Pill } from '../components/ui.jsx';
import ActionDialog from '../components/ActionDialog.jsx';
import TaskForm from '../components/TaskForm.jsx';
import { flagsOf, projectOf, canSeeFull, TYPE_LABEL, STATUS, itemById, firstName } from '../engine/core.js';
import { allowedActions } from '../engine/actions.js';
import { priorityOf } from '../engine/sow.js';
import { now, DAY, dueLabel } from '../lib/time.js';

const TABS = [
  ['doing', 'Doing'],
  ['waiting', 'Waiting on me'],
  ['blocked', 'Blocked'],
  ['overdue', 'Overdue'],
  ['done', 'Done'],
  ['all', 'All'],
];
export const KCOLS = [
  ['awaiting', 'Awaiting acceptance', ['awaiting', 'pending_approval']],
  ['open', 'Open', ['open']],
  ['in_progress', 'In progress', ['in_progress']],
  ['blocked', 'Blocked', ['blocked']],
  ['in_review', 'In review', ['in_review']],
  ['closed', 'Closed', ['closed']],
];

// Same lifecycle action as the buttons; returns [action, preset] or null for an invalid move.
export function dropAction(from, to) {
  const map = {
    'awaiting>open': ['accept'],
    'open>in_progress': ['update'],
    'blocked>in_progress': ['unblock'],
    'closed>in_progress': ['reopen'],
    'cancelled>in_progress': ['reopen'],
    'in_review>in_progress': ['review', { decision: 'send_back' }],
    'open>blocked': ['block'],
    'in_progress>blocked': ['block'],
    'open>in_review': ['submit'],
    'in_progress>in_review': ['submit'],
    'in_review>closed': ['review', { decision: 'accept' }],
    'in_progress>in_progress': null,
  };
  return map[`${from}>${to}`] || null;
}

export function Kanban({ items, masked = () => false }) {
  const { s, me, toast } = useStore();
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [act, setAct] = useState(null);
  const drop = (col) => {
    setOver(null);
    const it = itemById(s, drag);
    setDrag(null);
    if (!it || col === it.status) return;
    const a = dropAction(it.status, col);
    if (!a) return toast(`Can't move from ${STATUS[it.status].label} to ${STATUS[col]?.label || col}. Use the task's actions instead.`, 'error');
    if (!allowedActions(s, me, it).includes(a[0])) return toast("You don't have that action on this task.", 'error');
    setAct({ item: it, action: a[0], preset: a[1] || {} });
  };
  return (
    <>
      <div className="kanban">
        {KCOLS.map(([key, label, sts]) => {
          const col = items.filter((i) => sts.includes(i.status));
          return (
            <div
              key={key}
              className={`kcol ${over === key ? 'drop' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(key);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={() => drop(key)}
            >
              <h4>
                {label} <span className="muted">{col.length}</span>
              </h4>
              {col.map((i) => {
                const hide = masked(i);
                return (
                  <div key={i.id} className="kcard" draggable={!hide} onDragStart={() => setDrag(i.id)} onClick={() => !hide && go(`/task/${i.id}`)}>
                    <div className="tiny muted">
                      {hide ? '—' : i.key} · {firstName(s, i.ownerId)}
                    </div>
                    <div className="t">{hide ? 'Private task' : i.title}</div>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {!(i.currentDeadline && i.currentDeadline < now() && !hide && flagsOf(s, i).overdue) && <Pill className="sm">{i.currentDeadline ? dueLabel(i.currentDeadline) : 'Ongoing'}</Pill>}
                      {!hide && <Flags item={i} />}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      {act && <ActionDialog item={act.item} action={act.action} preset={act.preset} onClose={() => setAct(null)} />}
    </>
  );
}

// Main tasks with their sub-tasks right underneath (like a timeline).
// A sub-task whose main task is also in the list is shown under it, not on its own.
export function treeRows(s, list, tab, collapsed) {
  const inList = new Set(list.map((i) => i.id));
  const showClosed = tab === 'done' || tab === 'all';
  const rows = [];
  for (const i of list) {
    if (i.type === 'subtask' && i.parentId && inList.has(i.parentId)) continue;
    const kids = i.type === 'task' ? s.items.filter((k) => k.parentId === i.id && k.type === 'subtask' && (showClosed || !['cancelled', 'skipped'].includes(k.status))) : [];
    rows.push({ item: i, kids });
    if (kids.length && !collapsed.has(i.id)) kids.forEach((k, n) => rows.push({ item: k, kids: [], child: true, last: n === kids.length - 1 }));
  }
  return rows;
}

export default function TasksView() {
  const { s, me } = useStore();
  const { query } = useRoute();
  const [tab, setTab] = useState(query.tab || 'doing');
  const [view, setView] = useState('list');
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (id) =>
    setCollapsed((c) => {
      const n = new Set(c);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const [fl, setFl] = useState({ role: 'any', type: 'any', vertical: 'any', size: 'any', impact: 'any', deadline: 'any', project: 'any', sort: 'deadline' });
  const setF = (k, v) => setFl((x) => ({ ...x, [k]: v }));
  const t = now();

  const mineAll = useMemo(
    () =>
      s.items.filter(
        (i) => i.type !== 'cycle' && (i.ownerId === me || i.assigneeId === me || i.creatorId === me || i.reviewerId === me || (i.contributors || []).includes(me))
      ),
    [s, me]
  );
  const inTab = (i, key) => {
    const doer = i.ownerId === me || i.assigneeId === me;
    const f = flagsOf(s, i, t);
    switch (key) {
      case 'doing':
        return doer && ['open', 'in_progress'].includes(i.status) && i.type !== 'project' && i.type !== 'stream';
      case 'waiting':
        return (
          (i.status === 'awaiting' && i.ownerId === me && !i.declined) ||
          (i.status === 'in_review' && i.reviewerId === me) ||
          (i.status === 'blocked' && i.blockedBy === me) ||
          (i.assigneeId === me && ['open', 'in_progress'].includes(i.status)) ||
          (i.creatorId === me && (i.declined || i.rejected) && ['awaiting', 'pending_approval'].includes(i.status))
        );
      case 'blocked':
        return doer && i.status === 'blocked';
      case 'overdue':
        return doer && f.overdue;
      case 'done':
        return i.ownerId === me && ['closed', 'cancelled', 'skipped'].includes(i.status);
      default:
        return true;
    }
  };
  const pool = s.items.filter((i) => i.blockedBy === me && i.status === 'blocked' && !mineAll.includes(i));
  const all = [...mineAll, ...pool];
  const counts = Object.fromEntries(TABS.map(([k]) => [k, all.filter((i) => inTab(i, k)).length]));
  const projects = s.items.filter((i) => i.type === 'project' || i.type === 'stream');

  let list = all.filter((i) => inTab(i, view === 'kanban' && tab !== 'done' ? (tab === 'all' ? 'all' : tab) : tab));
  if (view === 'kanban') list = all.filter((i) => (i.ownerId === me || i.assigneeId === me || i.reviewerId === me) && !['cancelled', 'skipped'].includes(i.status) && (i.status !== 'closed' || t - (i.closedAt || 0) < 14 * DAY));
  list = list.filter((i) => {
    if (q && !`${i.key} ${i.title}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (fl.role !== 'any') {
      const r = { owner: i.ownerId, assignee: i.assigneeId, creator: i.creatorId, reviewer: i.reviewerId }[fl.role];
      if (fl.role === 'contributor' ? !(i.contributors || []).includes(me) : r !== me) return false;
    }
    if (fl.type !== 'any' && i.type !== fl.type) return false;
    if (fl.vertical !== 'any' && i.vertical !== fl.vertical) return false;
    if (fl.size !== 'any' && i.size !== fl.size) return false;
    if (fl.impact !== 'any' && i.impact !== +fl.impact) return false;
    if (fl.project !== 'any' && projectOf(s, i)?.id !== fl.project) return false;
    if (fl.deadline === 'week' && !(i.currentDeadline && i.currentDeadline - t < 7 * DAY && i.currentDeadline >= t)) return false;
    if (fl.deadline === 'overdue' && !flagsOf(s, i, t).overdue) return false;
    if (fl.deadline === 'month' && !(i.currentDeadline && i.currentDeadline - t < 30 * DAY)) return false;
    return true;
  });
  list.sort((a, b) => {
    if (fl.sort === 'priority') return priorityOf(s, b) - priorityOf(s, a);
    if (fl.sort === 'impact') return b.impact - a.impact || (a.currentDeadline || 9e15) - (b.currentDeadline || 9e15);
    return tab === 'done' ? (b.closedAt || 0) - (a.closedAt || 0) : (a.currentDeadline || 9e15) - (b.currentDeadline || 9e15);
  });

  const sel = (k, opts) => (
    <select className="input sm" style={{ width: 'auto' }} value={fl[k]} onChange={(e) => setF(k, e.target.value)}>
      {opts.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Everything you own, help with or review</div>
          <h1 className="page-title">
            <Accent text="My *Tasks*" />
          </h1>
        </div>
        <div className="row wrap">
          <Seg options={[['list', 'List'], ['kanban', 'Kanban']]} value={view} onChange={setView} />
        </div>
      </div>
      {view === 'list' && (
        <div className="tabs">
          {TABS.map(([k, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {l}
              <span className="n">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <div className="row" style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <input className="input sm" placeholder="Search title or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {sel('role', [['any', 'Any role'], ['owner', 'I own'], ['assignee', "I'm assignee"], ['creator', 'I created'], ['reviewer', 'I review'], ['contributor', 'I contribute']])}
        {sel('type', [['any', 'Any type'], ...Object.entries(TYPE_LABEL).filter(([k]) => k !== 'cycle')])}
        {sel('vertical', [['any', 'Any vertical'], ...s.verticals.map((v) => [v.id, v.name])])}
        {sel('size', [['any', 'Any size'], ['S', 'S'], ['M', 'M'], ['L', 'L']])}
        {sel('impact', [['any', 'Any impact'], ['5', 'Impact 5'], ['3', 'Impact 3'], ['1', 'Impact 1']])}
        {sel('deadline', [['any', 'Any deadline'], ['overdue', 'Overdue'], ['week', 'Next 7 days'], ['month', 'Next 30 days']])}
        {sel('project', [['any', 'Any project'], ...projects.map((p) => [p.id, p.title])])}
        {sel('sort', [['deadline', 'Sort: deadline'], ['priority', 'Sort: priority'], ['impact', 'Sort: impact']])}
      </div>

      {view === 'kanban' ? (
        <Kanban items={list} />
      ) : (
        <div className="card" style={{ padding: '8px 16px' }}>
          {list.length === 0 ? (
            <Empty>{tab === 'waiting' ? 'Nothing waiting on you. 🌿' : 'No tasks here.'}</Empty>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th className="hide-m">Owner</th>
                    <th>Deadline</th>
                    <th className="hide-m">Size · Impact</th>
                    <th className="hide-m">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {treeRows(s, list, tab, collapsed).map(({ item: i, kids, child, last }) => {
                    const full = canSeeFull(s, me, i);
                    const parent = !child && i.type === 'subtask' && i.parentId ? itemById(s, i.parentId) : null;
                    const doneKids = kids.filter((k) => k.status === 'closed').length;
                    const open = !collapsed.has(i.id);
                    return (
                      <tr key={(child ? 'c' : 'p') + i.id} className={`click ${child ? `sub-row${last ? ' last' : ''}` : ''} ${kids.length ? 'has-kids' : ''}`} onClick={() => go(`/task/${i.id}`)}>
                        <td className="muted nowrap small">{i.key}</td>
                        <td style={{ minWidth: 220 }} className="tree-cell">
                          <div className="tree-title">
                            {kids.length > 0 && (
                              <button
                                className={`tree-toggle ${open ? '' : 'closed'}`}
                                title={open ? 'Hide sub-tasks' : 'Show sub-tasks'}
                                aria-expanded={open}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle(i.id);
                                }}
                              >
                                <Icon name="down" size={16} stroke={2} />
                              </button>
                            )}
                            <span className="b">{full ? i.title : 'Private task'}</span>
                            {kids.length > 0 && (
                              <span className="kid-badge">
                                {kids.length} sub-task{kids.length > 1 ? 's' : ''} · {doneKids} done
                              </span>
                            )}
                          </div>
                          <div className="row wrap tiny" style={{ gap: 6, marginTop: 4 }}>
                            {i.type !== 'task' && !child && <Pill className="sm">{TYPE_LABEL[i.type]}</Pill>}
                            {parent && <span className="faint">↳ under {parent.key} · {canSeeFull(s, me, parent) ? parent.title : 'Private task'}</span>}
                            {i.recurringId && <Pill className="sm">↻ Recurring</Pill>}
                            {full && <Flags item={i} />}
                          </div>
                        </td>
                        <td>
                          <StatusPill item={i} sm />
                        </td>
                        <td className="hide-m">
                          <Person id={i.ownerId} />
                        </td>
                        <td className="nowrap small">
                          <Deadline item={i} short />
                          {i.originalDeadline && i.originalDeadline !== i.currentDeadline && <div className="tiny faint">extended</div>}
                        </td>
                        <td className="hide-m">
                          <SizeImpact item={i} />
                        </td>
                        <td className="hide-m">
                          <ProgressInline item={i} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {creating && <TaskForm onClose={() => setCreating(false)} />}
    </div>
  );
}
