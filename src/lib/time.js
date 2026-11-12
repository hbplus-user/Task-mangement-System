// All dates and times are India Standard Time (UTC+5:30, no daylight saving),
// whatever the device or server clock is set to.
export const MIN = 60 * 1000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
const IST = 330 * MIN;

// Demo clock: lets admins "time travel" to test nudges and penalties.
export const clock = { offset: 0 };
export const now = () => Date.now() + clock.offset;

// IST calendar parts of a timestamp.
export const ist = (ts) => {
  const d = new Date(ts + IST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), dow: d.getUTCDay() };
};
// Timestamp for an IST wall-clock time. Month and day may overflow (JS Date rules).
export const fromIst = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo, d, h, mi) - IST;

const pad = (n) => String(n).padStart(2, '0');
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dateKey = (ts) => {
  const p = ist(ts);
  return `${p.y}-${pad(p.mo + 1)}-${pad(p.d)}`;
};
export const todayKey = () => dateKey(now());
export const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return fromIst(y, m - 1, d);
};
export const startOfDay = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d);
};
export const addDays = (ts, n) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d + n, p.h, p.mi) + (ts - fromIst(p.y, p.mo, p.d, p.h, p.mi));
};
export const addKey = (k, n) => dateKey(addDays(parseKey(k), n));
// "18:30" on a date key or timestamp -> timestamp
export const atTime = (dayOrTs, hhmm = '18:30') => {
  const base = typeof dayOrTs === 'string' ? parseKey(dayOrTs) : startOfDay(dayOrTs);
  const p = ist(base);
  const [h, m] = hhmm.split(':').map(Number);
  return fromIst(p.y, p.mo, p.d, h, m || 0);
};
export const startOfWeek = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, p.d - ((p.dow + 6) % 7)); // Monday
};
export const startOfMonth = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo, 1);
};
export const endOfMonth = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo + 1, 1) - 1;
};
export const addMonths = (ts, n) => {
  const p = ist(ts);
  return fromIst(p.y, p.mo + n, Math.min(p.d, 28), p.h, p.mi);
};
export const weekday = (ts) => ist(ts).dow;
export const hourOf = (ts) => ist(ts).h;
export const monthIndex = (ts) => ist(ts).mo;
export const yearOf = (ts) => ist(ts).y;
export const dayOfMonth = (ts) => ist(ts).d;
export const isWorkingDay = (k) => weekday(parseKey(k)) !== 0; // Mon–Sat

export const fmtTime = (ts) => {
  const p = ist(ts);
  const ap = p.h >= 12 ? 'PM' : 'AM';
  return `${p.h % 12 || 12}:${pad(p.mi)} ${ap}`;
};
export const fmtDate = (ts, withYear = false) => {
  if (!ts) return '—';
  const p = ist(ts);
  return `${DOW[p.dow]} ${p.d} ${MON[p.mo]}${withYear ? ' ' + p.y : ''}`;
};
export const fmtShort = (ts) => {
  const p = ist(ts);
  return `${p.d} ${MON[p.mo]}`;
};
export const fmtDT = (ts) => (ts ? `${fmtDate(ts)}, ${fmtTime(ts)}` : '—');
export const fmtLongDay = (ts) => {
  const p = ist(ts);
  return `${DOW_LONG[p.dow]}, ${p.d} ${MON_LONG[p.mo]}`;
};
export const monthName = (ts, long = false) => (long ? MON_LONG : MON)[ist(ts).mo];
export const dowName = (ts) => DOW[ist(ts).dow];

export const ago = (ts) => {
  const diff = now() - ts;
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const d = Math.floor(diff / DAY);
  return d === 1 ? 'yesterday' : `${d}d ago`;
};
// Short relative label for deadlines: "Overdue 1d", "Today", "Thu", "12 Nov"
export const dueLabel = (ts) => {
  const n = now();
  if (ts < n) return `Overdue ${Math.max(1, Math.floor((n - ts) / DAY))}d`;
  const days = Math.round((startOfDay(ts) - startOfDay(n)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return DOW[ist(ts).dow];
  return fmtShort(ts);
};
export const toInputDate = (ts) => dateKey(ts);
export const toInputTime = (ts) => {
  const p = ist(ts);
  return `${pad(p.h)}:${pad(p.mi)}`;
};
export const greeting = () => {
  const h = ist(now()).h;
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
// Quarter end (calendar quarters) for the Matrix.
export const endOfQuarter = (ts) => {
  const p = ist(ts);
  return fromIst(p.y, Math.floor(p.mo / 3) * 3 + 3, 1) - 1;
};
