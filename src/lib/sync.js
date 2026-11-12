// Keeps the in-memory app state and the Supabase tables in step.
// Every field has its own column (see supabase/schema.sql). Lists such as a
// task's checklist or a person's verticals live in their own child tables.
import { supabase } from './supabase.js';

// The browser uses its signed-in client; the server job passes its own.
let client = supabase;
export const useClient = (c) => {
  client = c;
};
import { emptyState } from '../engine/seed.js';

/* ---------- Column conversions ---------- */
// kinds: s text · n number · N number (0 if empty) · b bool · B bool (false if empty)
//        t timestamp (app uses ms) · d date (YYYY-MM-DD) · a text[] · j jsonb
const toDb = (v, kind) => {
  if (kind === 'a') return Array.isArray(v) ? v : [];
  if (kind === 'B') return !!v;
  if (kind === 'N') return v == null || v === '' ? 0 : +v;
  if (v === undefined || v === null) return null;
  if (kind === 't') return new Date(v).toISOString();
  if (kind === 'n') return v === '' ? null : +v;
  if (kind === 'b') return !!v;
  return v;
};
const fromDb = (v, kind) => {
  if (v === null || v === undefined) return undefined;
  if (kind === 't') return Date.parse(v);
  if (kind === 'n' || kind === 'N') return +v;
  if (kind === 'd') return String(v).slice(0, 10);
  return v;
};
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
const setPath = (o, p, v) => {
  const ks = p.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]] = cur[ks[i]] && typeof cur[ks[i]] === 'object' ? cur[ks[i]] : {};
  cur[ks[ks.length - 1]] = v;
};

/* ---------- Table specs ---------- */
// f(path in the app record, column, kind, writeOnly?)
const f = (path, col = path, kind = 's', writeOnly = false) => ({ path, col, kind, writeOnly });
const ID = f('id');

const CHILD = {
  user_verticals: {
    prop: 'verticals', parentCol: 'user_id', position: true,
    idOf: (p, el) => `${p.id}:${el.vid}`,
    fields: [f('vid', 'vertical_id'), f('managerId', 'manager_id'), f('main', 'is_main', 'B')],
  },
  user_roles: {
    prop: 'customRoles', parentCol: 'user_id', scalar: 'role_id',
    idOf: (p, el) => `${p.id}:${el}`,
  },
  checklist_items: {
    prop: 'checklist', parentCol: 'item_id', position: true,
    idOf: (p, el) => el.id,
    fields: [f('id'), f('text'), f('done', 'done', 'B')],
  },
  item_links: {
    prop: 'links', parentCol: 'item_id', position: true,
    idOf: (p, el, i) => `${p.id}:${i}`,
    fields: [f('label'), f('url')],
  },
  sow_entries: {
    prop: 'entries', parentCol: 'sow_day_id', position: true,
    idOf: (p, el, i) => `${p.id}:${i}`,
    fields: [f('itemId', 'item_id'), f('outcome'), f('reason', 'reason_code'), f('comment'), f('pickupDate', 'pickup_date', 'd')],
  },
  kpi_actuals: {
    prop: 'actuals', parentCol: 'kpi_id', position: true,
    idOf: (p, el) => el.id,
    fields: [f('id'), f('weekOf', 'week_of', 'd'), f('value', 'value', 'n'), f('link', 'source_link'), f('by', 'entered_by'), f('ts', 'entered_at', 't'), f('verifiedBy', 'verified_by'), f('auto', 'is_auto', 'b')],
  },
  goal_checkins: {
    prop: 'checkins', parentCol: 'goal_id', position: true,
    idOf: (p, el) => el.id,
    fields: [f('id'), f('ts', 'checked_at', 't'), f('value', 'value', 'n'), f('note'), f('by', 'checked_by')],
  },
};

const SPECS = [
  { key: 'verticals', table: 'verticals', fields: [ID, f('name'), f('key')] },
  { key: 'roles', table: 'roles', fields: [ID, f('name'), f('abilities', 'abilities', 'a')] },
  {
    key: 'users', table: 'users', children: ['user_verticals', 'user_roles'],
    fields: [ID, f('name'), f('email'), f('slackId', 'slack_id'), f('role'), f('title'), f('hours', 'daily_hours', 'n'), f('status'), f('joinedOn', 'joined_on', 'd'), f('muted', 'muted_item_ids', 'a')],
  },
  {
    key: 'recurring', table: 'recurring_rules',
    fields: [ID, f('template.title', 'title', 's', true), f('ownerId', 'owner_id'), f('creatorId', 'creator_id'), f('freq', 'frequency'), f('everyDays', 'every_days', 'n'), f('dueAfterDays', 'due_after_days', 'n'), f('nextRun', 'next_run_at', 't'), f('active', 'is_active', 'B'), f('consecutiveMisses', 'consecutive_misses', 'N'), f('template', 'template', 'j'), f('createdAt', 'created_at', 't')],
  },
  {
    key: 'items', table: 'work_items', children: ['checklist_items', 'item_links'],
    fields: [
      ID, f('key', 'item_key'), f('type'), f('parentId', 'parent_id'), f('title'), f('desc', 'description'), f('vertical', 'vertical_id'),
      f('creatorId', 'creator_id'), f('ownerId', 'owner_id'), f('assigneeId', 'assignee_id'), f('reviewerId', 'reviewer_id'), f('contributors', 'contributor_ids', 'a'),
      f('status'), f('prevStatus', 'previous_status'), f('size'), f('impact', 'impact', 'n'), f('impactReason', 'impact_reason'), f('estHours', 'estimated_hours', 'n'),
      f('progressMethod', 'progress_method'), f('progress', 'progress', 'n'), f('stage', 'stage', 'n'), f('private', 'is_private', 'B'), f('pinned', 'is_pinned', 'B'),
      f('originalDeadline', 'original_deadline', 't'), f('currentDeadline', 'current_deadline', 't'), f('pickupDate', 'pickup_date', 'd'), f('proofLinks', 'proof_links', 'a'),
      f('rating', 'rating', 'n'), f('recurringId', 'recurring_rule_id'), f('projKey', 'project_key'), f('cycleLength', 'cycle_length'), f('cycleStart', 'cycle_start', 't'),
      f('verified', 'cycle_verified', 'b'), f('pausedMs', 'paused_ms', 'N'), f('extensionsCount', 'extensions_count', 'N'),
      f('blockedBy', 'blocked_by'), f('blockedAt', 'blocked_at', 't'), f('blockedReason', 'blocked_reason'), f('blockedApprovedDays', 'blocked_approved_days', 'n'),
      f('declined.by', 'declined_by'), f('declined.reason', 'declined_reason'), f('declined.at', 'declined_at', 't'),
      f('rejected.by', 'rejected_by'), f('rejected.reason', 'rejected_reason'), f('cancelReason', 'cancel_reason'), f('offboardedFrom', 'offboarded_from'),
      f('missFlag', 'recurring_miss_flagged', 'b'), f('setupBatch', 'setup_batch', 'b'), f('sizeConfirmedBy', 'size_confirmed_by'), f('goalLinks', 'goal_links', 'a'),
      f('createdAt', 'created_at', 't'), f('assignedAt', 'assigned_at', 't'), f('acceptedAt', 'accepted_at', 't'), f('lastUpdateAt', 'last_update_at', 't'),
      f('submittedAt', 'submitted_at', 't'), f('deadlineAtSubmit', 'deadline_at_submit', 't'), f('closedAt', 'closed_at', 't'),
    ],
  },
  { key: 'comments', table: 'comments', fields: [ID, f('itemId', 'item_id'), f('userId', 'author_id'), f('text', 'body'), f('action'), f('parentId', 'parent_comment_id'), f('ts', 'created_at', 't')] },
  { key: 'activity', table: 'activity_log', fields: [ID, f('itemId', 'item_id'), f('userId', 'actor_id'), f('action'), f('from', 'old_value'), f('to', 'new_value'), f('ts', 'created_at', 't')] },
  {
    key: 'approvals', table: 'approvals',
    fields: [
      ID, f('type'), f('itemId', 'item_id'), f('requesterId', 'requester_id'), f('approverIds', 'approver_ids', 'a'), f('status'), f('text', 'summary'),
      f('payload.newDeadline', 'new_deadline', 't'), f('payload.oldDeadline', 'old_deadline', 't'), f('payload.noticeH', 'notice_hours', 'n'), f('payload.nth', 'extension_number', 'n'),
      f('payload.cost', 'extension_cost', 'a'), f('payload.newOwnerId', 'new_owner_id'), f('payload.reason', 'reason'), f('payload.day', 'blocked_day', 'n'),
      f('payload.itemIds', 'setup_item_ids'), f('payload.size', 'proposed_size'), f('payload.impact', 'proposed_impact', 'n'), f('payload.confirmedSize', 'confirmed_size'), f('payload.confirmedImpact', 'confirmed_impact', 'n'),
      f('decidedBy', 'decided_by'), f('decidedAt', 'decided_at', 't'), f('comment', 'decision_comment'), f('ts', 'created_at', 't'),
    ],
  },
  {
    key: 'sowDays', table: 'sow_days', children: ['sow_entries'],
    fields: [ID, f('userId', 'user_id'), f('date', 'sow_date', 'd'), f('top3', 'top3_item_ids', 'a'), f('status'), f('submittedAt', 'submitted_at', 't'), f('plannedAt', 'planned_at', 't'), f('missedPenalized', 'missed_penalized', 'b'), f('dropReasons', 'drop_reasons', 'j')],
  },
  { key: 'offDays', table: 'off_days', fields: [ID, f('userId', 'user_id'), f('date', 'off_date', 'd'), f('code'), f('reason'), f('ts', 'created_at', 't')] },
  { key: 'holidays', table: 'holidays', idOf: (r) => r.date, fields: [f('date', 'holiday_date', 'd'), f('name')] },
  {
    key: 'scoreEvents', table: 'score_events',
    fields: [ID, f('userId', 'user_id'), f('itemId', 'item_id'), f('type'), f('code'), f('points', 'points', 'n'), f('note'), f('policyVersion', 'policy_version'), f('trial', 'is_trial', 'B'), f('reversed', 'reversed', 'B'), f('meta.early', 'is_early', 'b'), f('meta.onTime', 'is_on_time', 'b'), f('meta.impact', 'impact', 'n'), f('meta.rating', 'rating', 'n'), f('ts', 'created_at', 't')],
  },
  { key: 'appeals', table: 'appeals', fields: [ID, f('scoreEventId', 'score_event_id'), f('userId', 'user_id'), f('reason'), f('month', 'review_month', 'd'), f('status'), f('outcome'), f('decidedBy', 'decided_by'), f('decidedAt', 'decided_at', 't'), f('ts', 'created_at', 't')] },
  { key: 'policyVersions', table: 'policy_versions', fields: [ID, f('key', 'setting_key'), f('oldValue', 'old_value', 'j'), f('newValue', 'new_value', 'j'), f('effectiveFrom', 'effective_from', 't'), f('changedBy', 'changed_by'), f('ts', 'changed_at', 't')] },
  { key: 'kpis', table: 'kpis', children: ['kpi_actuals'], fields: [ID, f('itemId', 'item_id'), f('name'), f('target', 'target', 'n'), f('unit'), f('dir', 'direction'), f('agg', 'aggregation'), f('source'), f('sourceMetric', 'source_metric')] },
  {
    key: 'goals', table: 'goals', children: ['goal_checkins'],
    fields: [ID, f('userId', 'user_id'), f('type'), f('title'), f('desc', 'description'), f('periodStart', 'period_start', 'd'), f('periodEnd', 'period_end', 'd'), f('measure'), f('dir', 'direction'), f('target', 'target', 'n'), f('current', 'current_value', 'n'), f('unit'), f('weight', 'weight', 'n'), f('private', 'is_private', 'B'), f('status'), f('statusNote', 'status_note'), f('createdBy', 'created_by'), f('createdAt', 'created_at', 't'), f('lastCheckIn', 'last_check_in', 't'), f('achievedAt', 'achieved_at', 't')],
  },
  {
    key: 'reviews', table: 'performance_reviews',
    fields: [ID, f('userId', 'user_id'), f('reviewerId', 'reviewer_id'), f('periodLabel', 'period_label'), f('periodStart', 'period_start', 'd'), f('periodEnd', 'period_end', 'd'), f('snapshot', 'snapshot', 'j'), f('rating', 'rating', 'n'), f('strengths'), f('improve', 'growth_area'), f('notes'), f('status'), f('createdAt', 'created_at', 't'), f('updatedAt', 'updated_at_app', 't'), f('sharedAt', 'shared_at', 't'), f('ackAt', 'acknowledged_at', 't'), f('ackNote', 'acknowledgement')],
  },
  { key: 'notifications', table: 'notifications', fields: [ID, f('userId', 'user_id'), f('itemId', 'item_id'), f('text', 'message'), f('mode'), f('kind'), f('approvalId', 'approval_id'), f('buttons', 'buttons', 'a'), f('read', 'is_read', 'B'), f('ts', 'created_at', 't'), f('deliverAt', 'deliver_at', 't')] },
  { key: 'channel', table: 'channel_posts', fields: [ID, f('channel'), f('text', 'message'), f('ts', 'created_at', 't')] },
];
const SPEC_BY_TABLE = Object.fromEntries(SPECS.map((sp) => [sp.table, sp]));
const CHILD_PARENT = {};
for (const sp of SPECS) for (const c of sp.children || []) CHILD_PARENT[c] = sp;

// Saved in this order (parents before children); deleted in reverse.
export const TABLE_ORDER = [
  'verticals', 'roles', 'users', 'user_verticals', 'user_roles', 'recurring_rules', 'work_items', 'checklist_items', 'item_links',
  'comments', 'activity_log', 'approvals', 'sow_days', 'sow_entries', 'off_days', 'holidays', 'score_events', 'appeals',
  'policy_versions', 'kpis', 'kpi_actuals', 'goals', 'goal_checkins', 'performance_reviews', 'notifications', 'channel_posts', 'system_flags', 'id_sequences', 'matrix_overrides',
];
const APPEND_ONLY = new Set(['activity_log']);
// Added by migration 004. Until it's run, these load as empty and aren't written, so the rest of the app keeps working.
const OPTIONAL = new Set(['goals', 'goal_checkins', 'performance_reviews']);
const missing = new Set();
const isMissingTable = (e) => /does not exist|schema cache|PGRST205|42P01/i.test(`${e?.code || ''} ${e?.message || ''}`);
export const missingTables = () => [...missing];
const idOfRec = (sp, r) => (sp.idOf ? sp.idOf(r) : r.id);

/* ---------- Record ⇄ row ---------- */
function pack(fields, rec, skipKeys = []) {
  const row = {};
  const roots = new Set(skipKeys);
  for (const fd of fields) {
    roots.add(fd.path.split('.')[0]);
    row[fd.col] = toDb(getPath(rec, fd.path), fd.kind);
  }
  // Anything the app stores that has no column yet is kept in `extra`.
  const extra = {};
  for (const k of Object.keys(rec)) if (!roots.has(k) && rec[k] !== undefined) extra[k] = rec[k];
  row.extra = extra;
  return row;
}
function unpack(fields, row) {
  const rec = { ...(row.extra || {}) };
  for (const fd of fields) {
    if (fd.writeOnly) continue;
    const v = fromDb(row[fd.col], fd.kind);
    if (v !== undefined) setPath(rec, fd.path, v);
  }
  return rec;
}
function packRecord(sp, rec) {
  const row = pack(sp.fields, rec, (sp.children || []).map((c) => CHILD[c].prop));
  if (sp.idOf) row.id = sp.idOf(rec);
  return row;
}
function packChild(c, parent, el, i) {
  const row = { id: c.idOf(parent, el, i), [c.parentCol]: parent.id };
  if (c.scalar) {
    row[c.scalar] = el;
    row.extra = {};
    return row;
  }
  Object.assign(row, pack(c.fields, el));
  row.id = c.idOf(parent, el, i);
  if (c.position) row.position = i;
  return row;
}
const unpackChild = (c, row) => (c.scalar ? row[c.scalar] : unpack(c.fields, row));

// Every row the state should have: { table: [[id, row], …] }
export function rowsOf(s) {
  const out = Object.fromEntries(TABLE_ORDER.map((t) => [t, []]));
  for (const sp of SPECS) {
    for (const rec of s[sp.key] || []) {
      const row = packRecord(sp, rec);
      out[sp.table].push([row.id, row]);
      for (const ct of sp.children || []) {
        const c = CHILD[ct];
        (rec[c.prop] || []).forEach((el, i) => {
          const r = packChild(c, rec, el, i);
          out[ct].push([r.id, r]);
        });
      }
    }
  }
  out.system_flags = Object.entries(s.flags || {}).map(([k, v]) => [k, { id: k, set_at: typeof v === 'number' ? toDb(v, 't') : null, extra: {} }]);
  out.id_sequences = Object.entries(s.seq || {}).map(([k, v]) => [k, { id: k, last_number: v, extra: {} }]);
  out.matrix_overrides = Object.entries(s.matrixOverrides || {}).flatMap(([u, m]) =>
    Object.entries(m || {}).map(([item, q]) => [`${u}:${item}`, { id: `${u}:${item}`, user_id: u, item_id: item, quadrant: q, extra: {} }])
  );
  return out;
}

// Turns database rows back into the app state (used on load and in tests).
export function stateFromRows(byTable) {
  const s = emptyState();
  for (const sp of SPECS) {
    const kids = {};
    for (const ct of sp.children || []) {
      const c = CHILD[ct];
      kids[ct] = {};
      for (const r of (byTable[ct] || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
        (kids[ct][r[c.parentCol]] = kids[ct][r[c.parentCol]] || []).push(unpackChild(c, r));
      }
    }
    s[sp.key] = (byTable[sp.table] || []).map((row) => {
      const rec = unpack(sp.fields, row);
      for (const ct of sp.children || []) rec[CHILD[ct].prop] = kids[ct][row.id] || [];
      return rec;
    });
  }
  for (const r of byTable.system_flags || []) s.flags[r.id] = fromDb(r.set_at, 't') ?? true;
  for (const r of byTable.id_sequences || []) s.seq[r.id] = r.last_number;
  for (const r of byTable.matrix_overrides || []) (s.matrixOverrides[r.user_id] = s.matrixOverrides[r.user_id] || {})[r.item_id] = r.quadrant;
  for (const sp of SPECS) if (sp.key !== 'holidays') s[sp.key].sort((a, b) => (a.ts || a.createdAt || 0) - (b.ts || b.createdAt || 0));
  return s;
}

/* ---------- Load ---------- */
async function fetchAll(table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select('*').order('id').range(from, from + 999);
    if (error && OPTIONAL.has(table) && isMissingTable(error)) {
      missing.add(table);
      return [];
    }
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

// Returns the app state, or null if there are no users yet.
export async function loadAll() {
  const results = await Promise.all(TABLE_ORDER.map((t) => fetchAll(t)));
  const s = stateFromRows(Object.fromEntries(TABLE_ORDER.map((t, i) => [t, results[i]])));
  if (!s.users.length) return null;
  baseline(s);
  return s;
}

/* ---------- Live changes from other people ---------- */
export function applyRemote(s, table, row, deleted) {
  if (table === 'system_flags') {
    if (deleted) delete s.flags[row.id];
    else s.flags[row.id] = fromDb(row.set_at, 't') ?? true;
    return;
  }
  if (table === 'id_sequences') {
    if (!deleted) s.seq[row.id] = Math.max(s.seq[row.id] || 0, row.last_number);
    return;
  }
  if (table === 'matrix_overrides') {
    const i = row.id.indexOf(':');
    const u = row.id.slice(0, i);
    const item = row.id.slice(i + 1);
    if (deleted) delete (s.matrixOverrides[u] || {})[item];
    else (s.matrixOverrides[u] = s.matrixOverrides[u] || {})[item] = row.quadrant;
    return;
  }
  const sp = SPEC_BY_TABLE[table];
  if (sp) {
    const arr = s[sp.key];
    const idx = arr.findIndex((r) => idOfRec(sp, r) === row.id);
    if (deleted) {
      if (idx >= 0) arr.splice(idx, 1);
      return;
    }
    const rec = unpack(sp.fields, row);
    for (const ct of sp.children || []) rec[CHILD[ct].prop] = idx >= 0 ? arr[idx][CHILD[ct].prop] || [] : [];
    if (idx >= 0) arr[idx] = rec;
    else arr.push(rec);
    return;
  }
  const c = CHILD[table];
  const psp = CHILD_PARENT[table];
  if (!c || !psp) return;
  for (const parent of s[psp.key]) {
    const list = parent[c.prop] || (parent[c.prop] = []);
    const idx = list.findIndex((el, i) => c.idOf(parent, el, i) === row.id);
    if (deleted) {
      if (idx >= 0) return void list.splice(idx, 1);
      continue;
    }
    if (parent.id !== row[c.parentCol]) continue;
    const el = unpackChild(c, row);
    if (idx >= 0) list[idx] = el;
    else if (c.position && row.position != null) list.splice(Math.min(row.position, list.length), 0, el);
    else list.push(el);
    return;
  }
}

/* ---------- Save ---------- */
let last = new Map(); // "table|id" → JSON last known to be in the database
const recent = new Map(); // "table|id" → when we last wrote it (to ignore our own echoes)
const rk = (t, id) => `${t}|${id}`;

export function baseline(s) {
  last = new Map();
  const rows = rowsOf(s);
  for (const t of TABLE_ORDER) for (const [id, row] of rows[t]) last.set(rk(t, id), JSON.stringify(row));
}
// After applying someone else's changes, mark just those rows as already saved.
export function rememberRows(s, keys) {
  const rows = rowsOf(s);
  const idx = {};
  for (const [t] of keys) if (!idx[t]) idx[t] = new Map(rows[t].map(([id, row]) => [id, row]));
  for (const [t, id] of keys) {
    const row = idx[t].get(id);
    if (row) last.set(rk(t, id), JSON.stringify(row));
    else last.delete(rk(t, id));
  }
}

export function diff(s) {
  const up = {};
  const del = {};
  const seen = new Set();
  const rows = rowsOf(s);
  for (const t of TABLE_ORDER) {
    for (const [id, row] of rows[t]) {
      const k = rk(t, id);
      seen.add(k);
      const j = JSON.stringify(row);
      if (last.get(k) !== j) {
        (up[t] = up[t] || []).push(row);
        last.set(k, j);
      }
    }
  }
  for (const k of [...last.keys()]) {
    if (seen.has(k)) continue;
    const i = k.indexOf('|');
    const t = k.slice(0, i);
    if (APPEND_ONLY.has(t)) continue;
    (del[t] = del[t] || []).push(k.slice(i + 1));
    last.delete(k);
  }
  // Parents before sub-items so the parent link always exists.
  if (up.work_items) {
    const parentOf = new Map((s.items || []).map((i) => [i.id, i.parentId]));
    const depth = (id, g = 0) => (!parentOf.get(id) || g > 10 ? 0 : 1 + depth(parentOf.get(id), g + 1));
    up.work_items.sort((a, b) => depth(a.id) - depth(b.id));
  }
  return { up, del };
}

let pending = null;
let timer = null;
let flushing = false;
let lastError = '';
const listeners = new Set();
export let saveStatus = 'saved';
const setStatus = (st) => {
  saveStatus = st;
  listeners.forEach((fn) => fn(st));
};
export const onSaveStatus = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Called after every change. Writes are batched every ~400 ms.
export function push(s) {
  pending = s;
  setStatus('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, 400);
}

const explain = (t, error) =>
  /row-level security/i.test(error.message)
    ? 'The database refused the save. Your sign-in email domain probably does not match the one in public.hb_is_member() in supabase/schema.sql.'
    : `${t}: ${error.message}`;

let pendingDiff = null;
async function flush() {
  if (flushing || !pending) return;
  flushing = true;
  const s = pending;
  pending = null;
  pendingDiff = diff(s);
  const failed = await writeDiff();
  flushing = false;
  if (failed) {
    setStatus('error');
    pending = pending || s;
    timer = setTimeout(flush, 5000);
  } else if (pending) flush();
  else setStatus('saved');
}

async function writeDiff() {
  const { up, del } = pendingDiff;
  pendingDiff = null;
  const stamp = new Date().toISOString();
  let failed = false;
  for (const t of TABLE_ORDER) {
    const list = up[t];
    if (!list || missing.has(t)) continue;
    for (let i = 0; i < list.length; i += 500) {
      const chunk = list.slice(i, i + 500);
      chunk.forEach((r) => recent.set(rk(t, r.id), Date.now()));
      const { error } = await client
        .from(t)
        .upsert(chunk.map((r) => ({ ...r, updated_at: stamp })), { onConflict: 'id', ignoreDuplicates: APPEND_ONLY.has(t) });
      if (error) {
        console.error(t, error);
        failed = true;
        lastError = explain(t, error);
        chunk.forEach((r) => last.delete(rk(t, r.id))); // resend next time
      }
    }
  }
  for (const t of [...TABLE_ORDER].reverse()) {
    const ids = del[t];
    if (!ids || missing.has(t)) continue;
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200);
      part.forEach((id) => recent.set(rk(t, id), Date.now()));
      const { error } = await client.from(t).delete().in('id', part);
      if (error) {
        console.error(t, error);
        failed = true;
        lastError = explain(t, error);
      }
    }
  }
  if (failed) setStatus('error');
  return failed;
}
export const hasUnsaved = () => !!pending || flushing;

export function subscribe(onChange) {
  const ch = client.channel('hb-all');
  ch.on('postgres_changes', { event: '*', schema: 'public' }, (p) => {
    if (!TABLE_ORDER.includes(p.table)) return;
    const deleted = p.eventType === 'DELETE';
    const row = deleted ? p.old : p.new;
    if (!row?.id) return;
    if (Date.now() - (recent.get(rk(p.table, row.id)) || 0) < 10000) return; // our own write coming back
    onChange(p.table, row, deleted);
  });
  ch.subscribe();
  return () => client.removeChannel(ch);
}

/* ---------- One browser runs the system jobs ---------- */
const CLIENT = Math.random().toString(36).slice(2);
export async function holdLease() {
  const { data, error } = await client.from('app_lease').select('client_id,held_until').eq('id', 'ticker').maybeSingle();
  if (error) return false;
  const until = data?.held_until ? Date.parse(data.held_until) : 0;
  if (data && until > Date.now() && data.client_id !== CLIENT) return false;
  const { error: e2 } = await client
    .from('app_lease')
    .upsert({ id: 'ticker', client_id: CLIENT, held_until: new Date(Date.now() + 150000).toISOString(), updated_at: new Date().toISOString() });
  if (e2) return false;
  const { data: check } = await client.from('app_lease').select('client_id').eq('id', 'ticker').maybeSingle();
  return check?.client_id === CLIENT;
}

// Server job: the server always holds the lease (browsers then skip the system jobs).
export async function takeServerLease(minutes = 10) {
  await client.from('app_lease').upsert({ id: 'ticker', client_id: 'server', held_until: new Date(Date.now() + minutes * 60000).toISOString(), updated_at: new Date().toISOString() });
}
// Save everything that changed and wait for it. Returns rows written per table.
export async function saveNow(s) {
  const counts = {};
  const { up, del } = diff(s);
  for (const [t, l] of Object.entries(up)) counts[t] = l.length;
  for (const [t, l] of Object.entries(del)) counts[`${t} (deleted)`] = l.length;
  // diff() already marked these as saved; write them now.
  pendingDiff = { up, del };
  await writeDiff();
  if (saveStatus === 'error') throw new Error(lastError);
  return counts;
}

/* ---------- Setup & reset ---------- */
export async function uploadAll(s) {
  last = new Map();
  pending = s;
  await flush();
  if (saveStatus === 'error') {
    clearTimeout(timer);
    pending = null;
    throw new Error(lastError || 'Some records could not be saved. Check the browser console.');
  }
}
export async function wipeAll() {
  // Users go last: the database checks you're a Founder/Admin while clearing the rest.
  const order = [...TABLE_ORDER].reverse().filter((t) => t !== 'users').concat('users');
  for (const t of order) {
    if (APPEND_ONLY.has(t)) continue; // the activity log can't be deleted by design
    const { error } = await client.from(t).delete().neq('id', '__none__');
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  last = new Map();
}
