import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { seed, emptyState, STATE_VERSION } from './engine/seed.js';
import { tick } from './engine/tick.js';
import { uid } from './engine/core.js';
import { COMPANY } from './engine/policy.js';
import { clock, dateKey } from './lib/time.js';
import { supabase, DEMO_LOGIN, MODE } from './lib/supabase.js';
import * as sync from './lib/sync.js';

const KEY = 'hbplus-tasks-state';
const SESSION_KEY = 'hbplus-session';
const Ctx = createContext(null);

function loadLocal() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s && s.version === STATE_VERSION ? s : null;
  } catch {
    return null;
  }
}
const safeSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    console.warn('Could not save locally', e);
  }
};

// The person setting up must be a Founder and saved first: the database only
// lets Founders/Admins add other Founders once the first user exists.
function putFirstAsFounder(s, email, name) {
  const e = email.toLowerCase();
  let u = s.users.find((x) => x.email.toLowerCase() === e);
  if (!u) {
    u = { id: uid('u'), name: name || e.split('@')[0], email: e, slackId: '', role: 'founder', customRoles: [], verticals: [{ vid: 'ldr', managerId: null, main: true }], hours: 9, status: 'active', muted: [], title: 'Founder', joinedOn: '2025-01-01' };
  }
  u.role = 'founder';
  u.status = 'active';
  s.users = [u, ...s.users.filter((x) => x !== u)];
  s.sessionUserId = u.id;
  return u;
}

// Fresh company: default verticals and holidays, plus the first founder.
function freshState(name, email) {
  const s = emptyState();
  s.verticals = [
    ['ldr', 'Leadership', 'LDR'], ['mkt', 'Marketing', 'MKT'], ['sal', 'Sales', 'SAL'], ['ops', 'Operations', 'OPS'],
    ['sho', 'Showrunners', 'SHO'], ['hr', 'HR', 'HR'], ['tec', 'Tech', 'TEC'],
  ].map(([id, n, key]) => ({ id, name: n, key }));
  s.roles = [{ id: 'hradmin', name: 'HR Admin', abilities: ['users', 'holidays', 'offboarding'] }];
  const id = uid('u');
  s.users = [{ id, name, email: email.toLowerCase(), slackId: '', role: 'founder', customRoles: [], verticals: [{ vid: 'ldr', managerId: null, main: true }], hours: 9, status: 'active', muted: [], title: 'Founder', joinedOn: dateKey(Date.now()) }];
  s.activity.push({ id: uid('a'), ts: Date.now(), userId: id, itemId: null, action: 'Workspace created', from: null, to: name });
  s.sessionUserId = id;
  return s;
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | signin | empty | noaccount | error | ready
  const [error, setError] = useState('');
  const [authUser, setAuthUser] = useState(null); // Google account (Supabase mode)
  const [saveStatus, setSaveStatus] = useState('saved');
  const [toasts, setToasts] = useState([]);
  const ref = useRef(null);
  const leader = useRef(MODE === 'local');

  const toast = useCallback((text, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3800);
  }, []);

  const persist = useCallback((s) => {
    safeSet(SESSION_KEY, s.sessionUserId || '');
    if (MODE === 'local') safeSet(KEY, JSON.stringify(s));
    else sync.push(s);
  }, []);

  const finish = useCallback(
    (s) => {
      clock.offset = s.clockOffset || 0;
      if (leader.current) tick(s);
      ref.current = s;
      persist(s);
      setState(s);
      setStatus('ready');
    },
    [persist]
  );

  // Who is signed in, matched to an HB+ user.
  const pickSession = (s, email) => {
    if (email) return s.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.status !== 'inactive')?.id || null;
    const saved = localStorage.getItem(SESSION_KEY);
    return s.users.some((u) => u.id === saved) ? saved : null;
  };

  const boot = useCallback(async () => {
    setStatus('loading');
    try {
      if (MODE === 'local') {
        const s = loadLocal() || seed();
        finish(s);
        return;
      }
      let email = null;
      if (!DEMO_LOGIN) {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) return setStatus('signin');
        setAuthUser(user);
        email = user.email;
      }
      let s = await sync.loadAll();
      if (!s) return setStatus('empty');
      s.sessionUserId = pickSession(s, email);
      let joined = false;
      if (!DEMO_LOGIN && !s.sessionUserId) {
        // First sign-in with a company account: join the team automatically (supabase/migrations/005_auto_join.sql).
        const offboarded = s.users.some((u) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'inactive');
        if (offboarded) return setStatus('noaccount');
        const { data: newId, error: joinErr } = await supabase.rpc('hb_join');
        if (joinErr) console.error('hb_join', joinErr);
        if (!newId) return setStatus('noaccount');
        s = await sync.loadAll();
        s.sessionUserId = pickSession(s, email);
        if (!s.sessionUserId) return setStatus('noaccount');
        joined = true;
      }
      leader.current = await sync.holdLease();
      finish(s);
      if (joined) toast("Welcome to HB+ Tasks! 🌱 You've been added to the team — a founder will set your vertical and manager.");
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setStatus('error');
    }
  }, [finish, toast]);

  useEffect(() => {
    boot();
    if (MODE === 'local') return;
    const offSave = sync.onSaveStatus(setSaveStatus);
    // Live changes from other people, applied in small batches.
    let queue = [];
    let t = null;
    const offLive = sync.subscribe((table, row, deleted) => {
      queue.push([table, row, deleted]);
      clearTimeout(t);
      t = setTimeout(() => {
        if (!ref.current) return;
        const draft = structuredClone(ref.current);
        for (const [tb, row, del] of queue) sync.applyRemote(draft, tb, row, del);
        sync.rememberRows(draft, queue.map(([tb, row]) => [tb, row.id]));
        queue = [];
        ref.current = draft;
        setState(draft);
      }, 150);
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((evt) => {
      if (evt === 'SIGNED_IN' && !ref.current) boot();
    });
    const warn = (e) => {
      if (sync.hasUnsaved()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      offSave();
      offLive();
      authSub?.subscription?.unsubscribe();
      window.removeEventListener('beforeunload', warn);
    };
  }, []); // eslint-disable-line

  // Run a change against a copy of the state. If it returns {error}, nothing is saved.
  const commit = useCallback(
    (fn, { silent = false } = {}) => {
      if (!ref.current) return { error: 'Still loading.' };
      const draft = structuredClone(ref.current);
      let res;
      try {
        res = fn(draft);
      } catch (e) {
        console.error(e);
        toast('Something went wrong — nothing was changed.', 'error');
        return { error: String(e) };
      }
      if (res && res.error) {
        if (!silent) toast(res.error, 'error');
        return res;
      }
      if (res === false) return res;
      if (leader.current) tick(draft);
      ref.current = draft;
      persist(draft);
      setState(draft);
      return res ?? { ok: true };
    },
    [toast, persist]
  );

  // System jobs every minute (only in the browser holding the lease).
  useEffect(() => {
    if (status !== 'ready') return;
    const id = setInterval(async () => {
      if (MODE !== 'local') leader.current = await sync.holdLease();
      if (leader.current) commit((s) => tick(s), { silent: true });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [status, commit]);

  /* ---------- Sign-in, setup, reset ---------- */
  const signInGoogle = useCallback(async () => {
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname, queryParams: { hd: COMPANY.domain, prompt: 'select_account' } },
    });
    if (e) toast(e.message, 'error');
  }, [toast]);

  const signOut = useCallback(async () => {
    safeSet(SESSION_KEY, '');
    if (MODE === 'supabase') {
      await supabase.auth.signOut();
      window.location.reload();
      return;
    }
    commit((s) => {
      s.sessionUserId = null;
    });
  }, [commit]);

  const setupDemo = useCallback(async () => {
    setStatus('loading');
    try {
      const s = seed();
      if (authUser) {
        // Add the signed-in person as a founder so they can see everything.
        putFirstAsFounder(s, authUser.email, authUser.user_metadata?.full_name);
      }
      tick(s);
      await sync.uploadAll(s);
      leader.current = await sync.holdLease();
      finish(s);
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, [authUser, finish]);

  const setupFresh = useCallback(
    async (name, email) => {
      setStatus('loading');
      try {
        const s = freshState(name, authUser?.email || email);
        await sync.uploadAll(s);
        leader.current = await sync.holdLease();
        finish(s);
      } catch (e) {
        setError(e.message);
        setStatus('error');
      }
    },
    [authUser, finish]
  );

  const reset = useCallback(async () => {
    clock.offset = 0;
    if (MODE === 'local') {
      const s = seed();
      s.sessionUserId = ref.current?.sessionUserId;
      finish(s);
      return;
    }
    const me = ref.current?.users.find((u) => u.id === ref.current.sessionUserId);
    setStatus('loading');
    try {
      await sync.wipeAll();
      const s = seed();
      if (me) putFirstAsFounder(s, me.email, me.name);
      tick(s);
      await sync.uploadAll(s);
      finish(s);
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, [finish]);

  const setClock = useCallback(
    (offset) => {
      clock.offset = offset;
      commit((s) => {
        s.clockOffset = offset;
      });
    },
    [commit]
  );

  const value = useMemo(
    () => ({ s: state, commit, toast, toasts, reset, setClock, me: state?.sessionUserId, status, error, mode: MODE, authUser, saveStatus, signInGoogle, signOut, setupDemo, setupFresh, retry: boot }),
    [state, commit, toast, toasts, reset, setClock, status, error, authUser, saveStatus, signInGoogle, signOut, setupDemo, setupFresh, boot]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
