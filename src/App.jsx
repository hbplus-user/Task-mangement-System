import React, { useEffect, useRef, useState } from 'react';
import { useStore } from './store.jsx';
import { useRoute, go, Icon, Avatar, Toasts, Modal, Accent, Blobs } from './components/ui.jsx';
import SlackDrawer from './components/SlackDrawer.jsx';
import TaskForm from './components/TaskForm.jsx';
import { userById, isManager, isFA, isFounder, can, activeUsers, ABILITIES } from './engine/core.js';
import { approvalsFor } from './engine/actions.js';
import { COMPANY } from './engine/policy.js';
import { now } from './lib/time.js';
import SowView from './views/Sow.jsx';
import TasksView from './views/Tasks.jsx';
import TaskDetail from './views/TaskDetail.jsx';
import MatrixView from './views/Matrix.jsx';
import CalendarView from './views/Calendar.jsx';
import TeamView from './views/Team.jsx';
import CompanyView from './views/Company.jsx';
import ReportsView from './views/Reports.jsx';
import ApprovalsView from './views/Approvals.jsx';
import AdminView from './views/Admin.jsx';
import ScoreView from './views/Score.jsx';
import SetupView from './views/Setup.jsx';
import GoalsView from './views/Goals.jsx';
import ReviewsView from './views/Reviews.jsx';

export function useAccess() {
  const { s, me } = useStore();
  const manager = isManager(s, me);
  return {
    team: manager || isFA(s, me),
    company: isFounder(s, me) || can(s, me, 'company'),
    reports: manager || isFA(s, me) || can(s, me, 'reports'),
    admin: isFA(s, me) || ABILITIES.some(([k]) => k !== 'company' && k !== 'reports' && can(s, me, k)),
    manager,
  };
}

function Login() {
  const { s, commit } = useStore();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [pick, setPick] = useState(false);
  const signIn = (addr) => {
    const e = addr.trim().toLowerCase();
    if (!e.endsWith(`@${COMPANY.domain}`)) return setError(`Only ${COMPANY.name} Google Workspace accounts (@${COMPANY.domain}) can sign in.`);
    const u = s.users.find((x) => x.email === e);
    if (!u) return setError("We couldn't find that account. Ask an admin to add you.");
    if (u.status === 'inactive') return setError('This account has been deactivated.');
    commit((st) => {
      st.sessionUserId = u.id;
    });
    go('/sow');
  };
  return (
    <div className="login">
      <Blobs />
      <div className="login-card">
        <div className="row" style={{ marginBottom: 24 }}>
          <span className="serif" style={{ fontSize: 36, color: 'var(--sidebar)' }}>
            HB+
          </span>
          <span className="eyebrow" style={{ color: 'var(--gold)', letterSpacing: 3 }}>
            Tasks
          </span>
        </div>
        <h1 className="serif accent-title" style={{ fontSize: 30, marginBottom: 6 }}>
          <Accent text="Own it. *Finish* it." />
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in with your {COMPANY.name} Google Workspace account.
        </p>
        {!pick ? (
          <button className="gbtn" onClick={() => setPick(true)}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6z" />
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z" />
            </svg>
            Sign in with Google
          </button>
        ) : (
          <div className="stack-sm">
            <div className="small muted">Choose an account (demo — real Google sign-in is wired at deploy time)</div>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 12 }}>
              {activeUsers(s).map((u) => (
                <button key={u.id} className="menu-row" onClick={() => signIn(u.email)} style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '10px 12px', border: 0, borderBottom: '1px solid var(--line-soft)', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                  <Avatar id={u.id} />
                  <span className="spacer">
                    <b style={{ fontWeight: 500 }}>{u.name}</b>
                    <div className="tiny muted">
                      {u.email} · {u.role === 'member' ? u.title : u.role[0].toUpperCase() + u.role.slice(1)}
                    </div>
                  </span>
                </button>
              ))}
            </div>
            <div className="row">
              <input className="input" placeholder={`or type you@${COMPANY.domain}`} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn(email)} />
              <button className="btn primary" onClick={() => signIn(email)}>
                Go
              </button>
            </div>
          </div>
        )}
        {error && (
          <div className="hint-box bad mt">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

function Main() {
  const { s, me, commit, signOut, mode, saveStatus } = useStore();
  const { parts } = useRoute();
  const access = useAccess();
  const [slack, setSlack] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [more, setMore] = useState(false);
  const user = userById(s, me);

  useEffect(() => {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http') && import.meta.env.PROD) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }, []);

  if (!user || user.status === 'inactive') return (
    <>
      <Login />
      <Toasts />
    </>
  );

  const page = parts[0] || 'sow';
  const approvalCount = approvalsFor(s, me).length;
  const unread = s.notifications.filter((n) => n.userId === me && !n.read && n.deliverAt <= now() && n.mode !== 'digest').length;
  const nav = [
    ['sow', 'My SOW', 'sow', true],
    ['tasks', 'My Tasks', 'tasks', true],
    ['matrix', 'Matrix', 'matrix', true],
    ['calendar', 'Calendar', 'calendar', true],
    ['goals', 'Goals', 'flag', true],
    ['approvals', 'Approvals', 'approvals', true, approvalCount],
  ];
  const manage = [
    ['team', 'Team', 'team', access.team],
    ['reviews', 'Reviews', 'star', access.team],
    ['company', 'Company', 'company', access.company],
    ['reports', 'Reports', 'reports', access.reports],
    ['admin', 'Admin', 'admin', access.admin],
  ].filter((x) => x[3]);
  const current = page === 'task' ? 'tasks' : page === 'score' ? 'sow' : page;

  let view;
  switch (page) {
    case 'tasks':
      view = <TasksView />;
      break;
    case 'task':
      view = <TaskDetail id={parts[1]} />;
      break;
    case 'matrix':
      view = <MatrixView />;
      break;
    case 'calendar':
      view = <CalendarView />;
      break;
    case 'approvals':
      view = <ApprovalsView />;
      break;
    case 'team':
      view = access.team ? <TeamView /> : <NoAccess />;
      break;
    case 'company':
      view = access.company ? <CompanyView /> : <NoAccess />;
      break;
    case 'reports':
      view = access.reports ? <ReportsView /> : <NoAccess />;
      break;
    case 'admin':
      view = access.admin ? <AdminView tab={parts[1]} /> : <NoAccess />;
      break;
    case 'score':
      view = <ScoreView />;
      break;
    case 'setup':
      view = <SetupView />;
      break;
    case 'goals':
      view = <GoalsView />;
      break;
    case 'reviews':
      view = access.team ? <ReviewsView /> : <NoAccess />;
      break;
    default:
      view = <SowView />;
  }

  const NavBtn = ([key, label, icon, , count]) => (
    <a key={key} href={`#/${key}`} className={`nav-item ${current === key ? 'active' : ''}`}>
      <Icon name={icon} />
      {label}
      {count > 0 && <span className="count">{count}</span>}
    </a>
  );

  const tabs = [['sow', 'SOW', 'sow'], ['tasks', 'Tasks', 'tasks'], ['matrix', 'Matrix', 'matrix'], access.team ? ['team', 'Team', 'team'] : ['approvals', 'Approvals', 'approvals', approvalCount]];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <b>HB+</b>
          <span>TASKS</span>
        </div>
        <nav className="nav">{nav.map(NavBtn)}</nav>
        {manage.length > 0 && (
          <>
            <div className="nav-sec">Manage</div>
            <nav className="nav">{manage.map(NavBtn)}</nav>
          </>
        )}
        <div className="side-foot" onClick={() => setUserMenu((v) => !v)}>
          <Avatar id={me} size="lg" />
          <div className="who">
            <b>{user.name.split(' ')[0]}</b>
            <span>{user.role === 'member' ? user.title : user.role[0].toUpperCase() + user.role.slice(1)}</span>
          </div>
          {userMenu && <UserMenu onClose={() => setUserMenu(false)} style={{ bottom: 64, left: 0 }} />}
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <SaveBadge mode={mode} status={saveStatus} />
          <button className="btn primary sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} /> New
          </button>
          <button className="icon-btn" onClick={() => setSlack(true)} aria-label="Slack messages" title="Slack messages">
            <Icon name="bell" size={18} />
            {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </button>
          <button className="icon-btn show-m" onClick={(e) => { e.stopPropagation(); setUserMenu((v) => !v); }} aria-label="Account">
            <Avatar id={me} size="sm" />
          </button>
        </div>
        {view}
      </main>
      <nav className="tabbar">
        {tabs.map(([key, label, icon, count]) => (
          <button key={key} className={current === key ? 'on' : ''} onClick={() => go(`/${key}`)}>
            <Icon name={icon} size={22} />
            {label}
            {count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
        <button className={more ? 'on' : ''} onClick={() => setMore(true)}>
          <Icon name="more" size={22} />
          More
        </button>
      </nav>
      {more && (
        <Modal title="More" onClose={() => setMore(false)}>
          {[...nav, ...manage]
            .filter(([k]) => !tabs.some((t) => t[0] === k))
            .map(([key, label, icon, , count]) => (
              <button key={key} className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMore(false); go(`/${key}`); }}>
                <Icon name={icon} /> {label} {count > 0 && <span className="pill risk sm">{count}</span>}
              </button>
            ))}
          <button className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMore(false); go('/setup'); }}>
            <Icon name="tasks" /> Setup sprint
          </button>
          <button className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => { setMore(false); go('/score'); }}>
            <Icon name="star" /> My score & badges
          </button>
          <button className="btn block danger" style={{ justifyContent: 'flex-start' }} onClick={signOut}>
            <Icon name="logout" /> Sign out
          </button>
        </Modal>
      )}
      {userMenu && window.innerWidth <= 760 && <UserMenu onClose={() => setUserMenu(false)} style={{ top: 64, right: 16, position: 'fixed' }} />}
      {slack && <SlackDrawer onClose={() => setSlack(false)} />}
      {creating && <TaskForm onClose={() => setCreating(false)} />}
      <Toasts />
    </div>
  );
}

function UserMenu({ onClose, style }) {
  const { s, me, commit, signOut, mode } = useStore();
  const ref = useRef();
  useEffect(() => {
    const on = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    setTimeout(() => document.addEventListener('click', on), 0);
    return () => document.removeEventListener('click', on);
  }, [onClose]);
  return (
    <div className="menu" ref={ref} style={style} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => { onClose(); go('/score'); }}>
        <Icon name="star" size={16} /> My score & badges
      </button>
      <button onClick={() => { onClose(); go('/setup'); }}>
        <Icon name="tasks" size={16} /> Setup sprint
      </button>
      {mode !== 'supabase' && (<>
      <div className="tiny muted" style={{ padding: '8px 10px 4px' }}>
        Demo: switch person
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {activeUsers(s).map((u) => (
          <button key={u.id} onClick={() => { commit((st) => { st.sessionUserId = u.id; }); onClose(); go('/sow'); }}>
            <Avatar id={u.id} size="sm" /> {u.name} {u.id === me && '✓'}
            <span className="tiny muted" style={{ marginLeft: 'auto' }}>
              {u.role !== 'member' ? u.role : ''}
            </span>
          </button>
        ))}
      </div>
      </>)}
      <button onClick={signOut} style={{ color: 'var(--overdue)' }}>
        <Icon name="logout" size={16} /> Sign out
      </button>
    </div>
  );
}

const NoAccess = () => (
  <div className="card">
    <h2 className="card-title">Not available</h2>
    <p className="muted">This section opens up for managers, founders and admins.</p>
  </div>
);

function SaveBadge({ mode, status }) {
  if (mode === 'local') return <span className="pill sm hide-m" title="Data is saved in this browser only">Local mode</span>;
  const map = { saved: ['ok', 'Saved'], saving: ['', 'Saving…'], error: ['overdue', 'Not saved — retrying'] };
  const [tone, label] = map[status] || map.saved;
  return <span className={`pill sm ${tone}`} title="Synced with Supabase">{label}</span>;
}

function Screen({ children }) {
  return (
    <div className="login">
      <Blobs />
      <div className="login-card">
        <div className="row" style={{ marginBottom: 20 }}>
          <span className="serif" style={{ fontSize: 36, color: 'var(--sidebar)' }}>HB+</span>
          <span className="eyebrow" style={{ color: 'var(--gold)', letterSpacing: 3 }}>Tasks</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Setup() {
  const { setupDemo, setupFresh, authUser } = useStore();
  const [name, setName] = useState(authUser?.user_metadata?.full_name || '');
  const [email, setEmail] = useState(authUser?.email || '');
  const [err, setErr] = useState('');
  const fresh = () => {
    if (!name.trim()) return setErr('Add your name.');
    if (!email.toLowerCase().endsWith(`@${COMPANY.domain}`)) return setErr(`Use your @${COMPANY.domain} email.`);
    setupFresh(name.trim(), email.trim());
  };
  return (
    <Screen>
      <h1 className="serif accent-title" style={{ fontSize: 28, marginBottom: 6 }}>
        <Accent text="Set up your *workspace*" />
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>The database is connected and empty. How would you like to start?</p>
      <div className="stack-sm">
        <div className="card tight">
          <b>Start fresh</b>
          <div className="small muted" style={{ margin: '4px 0 10px' }}>You become the first Founder. Add people from Admin → Users.</div>
          <div className="stack-sm">
            <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <input className="input" placeholder={`you@${COMPANY.domain}`} value={email} disabled={!!authUser} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn primary" onClick={fresh}>Create workspace</button>
          </div>
        </div>
        <div className="card tight">
          <b>Load the demo team</b>
          <div className="small muted" style={{ margin: '4px 0 10px' }}>Riya, Selina and 10 others with 10 weeks of history — good for a walkthrough. You can reset it later.</div>
          <button className="btn outline" onClick={setupDemo}>Load demo data</button>
        </div>
      </div>
      {err && <div className="hint-box bad mt">{err}</div>}
    </Screen>
  );
}

export default function App() {
  const { status, error, signInGoogle, signOut, authUser, retry } = useStore();
  if (status === 'ready') return <Main />;
  let body;
  if (status === 'loading') body = <p className="muted">Loading HB+ Tasks…</p>;
  else if (status === 'signin')
    body = (
      <>
        <h1 className="serif accent-title" style={{ fontSize: 30, marginBottom: 6 }}>
          <Accent text="Own it. *Finish* it." />
        </h1>
        <p className="muted" style={{ marginTop: 0 }}>Sign in with your {COMPANY.name} Google Workspace account (@{COMPANY.domain}).</p>
        <button className="gbtn" onClick={signInGoogle}>
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.7l-7.8 6C6.6 42.6 14.6 48 24 48z" /></svg>
          Sign in with Google
        </button>
      </>
    );
  else if (status === 'empty') return <><Setup /><Toasts /></>;
  else if (status === 'noaccount')
    body = (
      <>
        <h1 className="serif" style={{ fontSize: 28 }}>Almost there</h1>
        <p className="muted">
          You're signed in as <b>{authUser?.email}</b>, but we couldn't add you to HB+ Tasks yet.
        </p>
        {error && (
          <div className="hint-box bad" style={{ marginBottom: 14 }}>
            {error}
          </div>
        )}
        <div className="row" style={{ gap: 10 }}>
          <button className="btn primary" onClick={retry}>
            Try again
          </button>
          <button className="btn" onClick={signOut}>Sign out</button>
        </div>
      </>
    );
  else
    body = (
      <>
        <h1 className="serif" style={{ fontSize: 28 }}>Couldn't reach the database</h1>
        <div className="hint-box bad">{error}</div>
        <p className="small muted">Check that supabase/schema.sql has been run in the Supabase SQL editor, and that the URL and anon key in .env.local are right. If Google sign-in isn't set up yet, see the README for demo access.</p>
        <button className="btn primary" onClick={retry}>Try again</button>
      </>
    );
  return <><Screen>{body}</Screen><Toasts /></>;
}
