// Server job: runs the HB+ system jobs (nudges, missed-SOW penalties, auto-accept,
// recurring tasks, stream cycles, digests) every few minutes, even when nobody
// has the app open. Uses the exact same rules code as the app (src/engine).
import { createClient } from '@supabase/supabase-js';
import * as sync from '../src/lib/sync.js';
import { tick } from '../src/engine/tick.js';
import { clock } from '../src/lib/time.js';

export async function runTick(client) {
  sync.useClient(client);
  clock.offset = 0;
  const s = await sync.loadAll();
  if (!s) return { ok: true, skipped: 'No users yet' };
  await sync.takeServerLease(); // browsers stop running the jobs while the server does
  const changed = tick(s);
  const written = changed ? await sync.saveNow(s) : {};
  return { ok: true, changed, written };
}

// Supabase Edge Function entry point (Deno).
if (typeof Deno !== 'undefined') {
  Deno.serve(async (req) => {
    const secret = Deno.env.get('HB_CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Unauthorized', { status: 401 });
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('HB_SERVICE_KEY');
    const client = createClient(Deno.env.get('SUPABASE_URL'), key, { auth: { persistSession: false } });
    try {
      return Response.json(await runTick(client));
    } catch (e) {
      console.error(e);
      return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
    }
  });
}
