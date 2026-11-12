import { createClient } from '@supabase/supabase-js';

const env = import.meta.env || {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

// null when not configured → the app falls back to browser-only (local) mode.
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } }) : null;
// true = account picker instead of Google sign-in (needs supabase/demo-access.sql).
export const DEMO_LOGIN = env.VITE_DEMO_LOGIN === 'true';
export const MODE = supabase ? (DEMO_LOGIN ? 'supabase-demo' : 'supabase') : 'local';
